/**
 * Variant classifier — folds captured DOM signals into the
 * VariantClassifierVerdict routing tag per design §4.4.
 *
 *   Reactive: ≥3 osui-* classes + zero __OSVSTATE + React
 *     (or Angular or Vue) marker.
 *   Traditional: __OSVSTATE present + ≥1 OS* PascalCase class.
 *   Mobile: cordova-app / is-phonegap / OS Mobile marker present.
 *   Not-OS: none of the OS signals + none of the frameworks.
 *   Ambiguous: conflicting signals (e.g., __OSVSTATE AND osui-*).
 *
 * The classifier is a pure function of the counts + booleans
 * the DOM walker gathers — it does not reach into a Playwright
 * Page itself. Tests drive it by constructing the input tuple
 * directly (fast, deterministic).
 *
 * Pure domain.
 */

import type {
  VariantClassifierVerdict,
} from '../domain/snapshot-record';

/** The signals the walker surfaces, which the classifier folds. */
export interface VariantClassifierSignals {
  /** Count of elements whose first class token starts with
   *  `osui-` (kebab-case, Reactive Web marker). */
  readonly osuiClassCount: number;
  /** Count of elements whose first class token is an OS*
   *  PascalCase utility (OSFillParent, OSInline, etc. —
   *  Traditional Web marker). */
  readonly osPascalClassCount: number;
  /** True iff a hidden input named __OSVSTATE is present
   *  (dispositive Traditional Web marker). */
  readonly osvstatePresent: boolean;
  /** True iff a cordova-app / is-phonegap / OS Mobile marker
   *  was detected. */
  readonly mobileMarkerPresent: boolean;
  /** Page-level framework detection. */
  readonly reactDetected: boolean;
  readonly angularDetected: boolean;
  readonly vueDetected: boolean;
}

/** Classify per design §4.4 rules. The verdict carries
 *  structured evidence so operator-review can understand why
 *  a page landed where it did.
 *
 *  Ambiguity gate: a page with meaningful osui-* signal AND
 *  __OSVSTATE present is inherently conflicted (Reactive uses
 *  osui-* and does NOT emit __OSVSTATE; Traditional emits
 *  __OSVSTATE and does NOT use osui-*). Surface this as
 *  ambiguous even though only the traditional branch's
 *  positive-rule is satisfied — the stronger osui-* signal
 *  should have matched reactive except the __OSVSTATE
 *  contradicts it. Same for mobile + other variants. */
export function classifyVariant(
  signals: VariantClassifierSignals,
): VariantClassifierVerdict {
  const evidence: string[] = [];

  const reactiveOK =
    signals.osuiClassCount >= 3 &&
    !signals.osvstatePresent &&
    (signals.reactDetected || signals.angularDetected || signals.vueDetected);

  const traditionalOK =
    signals.osvstatePresent && signals.osPascalClassCount >= 1;

  const mobileOK = signals.mobileMarkerPresent;

  // Early ambiguity: osui-* present alongside __OSVSTATE. The
  // two signals belong to different variants and MUST NOT
  // coexist in a well-formed OS app; surfacing as ambiguous
  // forces operator review rather than silently picking one.
  const osuiAndOsvstateConflict =
    signals.osuiClassCount >= 3 && signals.osvstatePresent;
  if (osuiAndOsvstateConflict) {
    evidence.push(
      `reactive candidate: osui-* count=${signals.osuiClassCount}`,
    );
    evidence.push(
      `traditional candidate: __OSVSTATE + OS* pascal count=${signals.osPascalClassCount}`,
    );
    if (mobileOK) evidence.push('mobile marker detected');
    return { kind: 'ambiguous', conflictingEvidence: evidence };
  }

  // Count positive classifications across the three variant
  // rules. More than one triggers ambiguous.
  const positiveCount =
    (reactiveOK ? 1 : 0) + (traditionalOK ? 1 : 0) + (mobileOK ? 1 : 0);

  if (positiveCount > 1) {
    if (reactiveOK)
      evidence.push(`reactive candidate: osui-* count=${signals.osuiClassCount}`);
    if (traditionalOK)
      evidence.push(
        `traditional candidate: __OSVSTATE + OS* pascal count=${signals.osPascalClassCount}`,
      );
    if (mobileOK) evidence.push('mobile marker detected');
    return { kind: 'ambiguous', conflictingEvidence: evidence };
  }

  if (reactiveOK) {
    evidence.push(`osui-* class count: ${signals.osuiClassCount}`);
    if (signals.reactDetected) evidence.push('React fiber detected');
    if (signals.angularDetected) evidence.push('Angular marker detected');
    if (signals.vueDetected) evidence.push('Vue marker detected');
    return {
      kind: 'reactive',
      osuiClassCount: signals.osuiClassCount,
      evidence,
    };
  }

  if (traditionalOK) {
    evidence.push('__OSVSTATE hidden input present');
    evidence.push(`OS* PascalCase count: ${signals.osPascalClassCount}`);
    return {
      kind: 'traditional',
      osvstatePresent: true,
      evidence,
    };
  }

  if (mobileOK) {
    evidence.push('mobile platform marker present');
    return { kind: 'mobile', evidence };
  }

  // No OS markers at all.
  if (!signals.reactDetected && !signals.angularDetected && !signals.vueDetected) {
    evidence.push('no OS markers; no framework markers');
    return { kind: 'not-os', evidence };
  }

  // Framework present but no OS classes — the page is a
  // framework-driven page that isn't OS. Classify not-os with
  // framework evidence.
  if (signals.reactDetected) evidence.push('React present but no OS classes');
  if (signals.angularDetected)
    evidence.push('Angular present but no OS classes');
  if (signals.vueDetected) evidence.push('Vue present but no OS classes');
  return { kind: 'not-os', evidence };
}

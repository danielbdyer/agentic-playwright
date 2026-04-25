/**
 * Variant classifier — folds captured DOM signals into the
 * Reactive-Web detection verdict.
 *
 * Scope per operator direction (2026-04-24): Z11g.d targets
 * Reactive Web only. The classifier's job is a three-way
 * decision:
 *
 *   `reactive`     — ≥3 osui-* classes + zero __OSVSTATE +
 *                    React / Angular / Vue framework marker.
 *                    All three conditions required: osui-*
 *                    alone could be a styling library; framework
 *                    alone could be any JS app; __OSVSTATE
 *                    presence disqualifies regardless.
 *   `ambiguous`    — Reactive-positive signals AND Reactive-
 *                    negative signals both present (e.g.,
 *                    osui-* classes observed on a page that
 *                    also emits __OSVSTATE). Surfaces the
 *                    conflict rather than silently picking one.
 *   `not-reactive` — neither the positive conjunction nor the
 *                    conflict pattern holds. Page is Traditional,
 *                    Mobile, or not-OS; the distillation pipeline
 *                    rejects it.
 *
 * Pure domain — no Effect, no IO. Tests drive it by constructing
 * the input tuple directly (fast, deterministic).
 */

import type { VariantClassifierVerdict } from '../domain/snapshot-record';

/** The signals the DOM walker surfaces. These are the
 *  minimal evidence set the classifier folds. */
export interface VariantClassifierSignals {
  /** Count of elements whose first class token starts with
   *  `osui-` (kebab-case, Reactive-Web marker). */
  readonly osuiClassCount: number;
  /** True iff a hidden input named `__OSVSTATE` is present
   *  (Traditional-Web marker; disqualifies Reactive). */
  readonly osvstatePresent: boolean;
  /** Page-level framework detection. Reactive requires at
   *  least one of these. */
  readonly reactDetected: boolean;
  readonly angularDetected: boolean;
  readonly vueDetected: boolean;
}

/** Minimum osui-* count for a Reactive-positive signal.
 *  Below this threshold, a lone osui-* class could be a
 *  styling library import on an otherwise-not-OS page. */
const OSUI_THRESHOLD = 3;

/** Classify a page's variant from its DOM signals. Pure. */
export function classifyVariant(
  signals: VariantClassifierSignals,
): VariantClassifierVerdict {
  const frameworkDetected =
    signals.reactDetected || signals.angularDetected || signals.vueDetected;
  const osuiStrong = signals.osuiClassCount >= OSUI_THRESHOLD;

  // Reactive-positive signals alongside a hard Traditional-Web
  // marker → ambiguous. Route to operator review rather than
  // silently picking.
  if (osuiStrong && signals.osvstatePresent) {
    const evidence: string[] = [
      `reactive candidate: osui-* count=${signals.osuiClassCount}`,
      'traditional marker present: __OSVSTATE hidden input',
    ];
    return { kind: 'ambiguous', conflictingEvidence: evidence };
  }

  // Clean Reactive detection — all three conditions agree.
  if (osuiStrong && frameworkDetected && !signals.osvstatePresent) {
    const evidence: string[] = [
      `osui-* class count: ${signals.osuiClassCount}`,
    ];
    if (signals.reactDetected) evidence.push('React fiber detected');
    if (signals.angularDetected) evidence.push('Angular marker detected');
    if (signals.vueDetected) evidence.push('Vue marker detected');
    return {
      kind: 'reactive',
      osuiClassCount: signals.osuiClassCount,
      evidence,
    };
  }

  // Not-reactive. Enumerate the missing conditions for
  // diagnostic clarity.
  const evidence: string[] = [];
  if (signals.osvstatePresent) {
    evidence.push('__OSVSTATE present (Traditional Web marker)');
  }
  if (!osuiStrong) {
    evidence.push(
      `osui-* count below threshold: ${signals.osuiClassCount} < ${OSUI_THRESHOLD}`,
    );
  }
  if (!frameworkDetected) {
    evidence.push('no React/Angular/Vue framework marker detected');
  }
  return { kind: 'not-reactive', evidence };
}

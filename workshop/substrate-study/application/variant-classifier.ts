/**
 * Variant classifier — folds captured DOM signals into the
 * Reactive-Web detection verdict.
 *
 * Scope per operator direction (2026-04-24): Z11g.d targets
 * Reactive Web only. The classifier's job is a three-way decision:
 * `reactive` / `not-reactive` / `ambiguous`.
 *
 * ## 2026-09-16 recalibration against real Reactive DOM
 *
 * The first real harvest (OutSystems UI website, 7 study routes)
 * refuted the original rule, which required **≥3 `osui-*` classes
 * AND a React/Angular/Vue framework marker**. Both premises were
 * wrong on genuine OutSystems Reactive output:
 *
 *   - **React fiber is nearly invisible.** OutSystems Reactive is
 *     React-based but renders through its own `OSFramework` runtime;
 *     across a 377-node catalog page exactly ONE node carried a
 *     `__reactFiber*` key (the root container). Requiring a fiber
 *     marker rejected every real page.
 *   - **`osui-*` is sparse and component-scoped.** Real pages carry
 *     2–22 `osui-*` first-token classes (`osui-search`, `osui-gallery`,
 *     `osui-deprecated`) — below the old floor on 4 of 7 routes.
 *
 * What IS reliably present on every real Reactive page, and absent
 * from non-OutSystems pages:
 *
 *   - `window.OutSystems` / `window.OSFramework` runtime globals.
 *   - The OutSystems runtime bundle (`OutSystemsReactView.js`,
 *     `OutSystems.js`) in the script list.
 *   - `data-block` containers (11–164 per route; the compiled unit
 *     of a Reactive screen) — zero on non-OutSystems pages.
 *
 * The rule now treats any one of those as a Reactive-positive
 * signal; `osui-*` (any-token) is corroborating. Framework markers
 * are retained as informational evidence, never as a gate.
 * `__OSVSTATE` still disqualifies (Traditional Web) and, alongside a
 * Reactive-positive signal, routes to `ambiguous` for operator
 * review rather than a silent pick.
 *
 * Pure domain — no Effect, no IO.
 */

import type { VariantClassifierVerdict } from '../domain/snapshot-record';

/** The signals the DOM walker surfaces. These are the minimal
 *  evidence set the classifier folds. */
export interface VariantClassifierSignals {
  /** Count of elements whose FIRST class token starts with `osui-`.
   *  Retained for continuity; no longer the primary signal. */
  readonly osuiClassCount: number;
  /** Count of elements carrying an `osui-*` class in ANY position.
   *  The real corpus names components with `osui-*` mid-list, so the
   *  any-position count is the honest one. */
  readonly osuiAnyTokenCount: number;
  /** Count of elements carrying a `data-block` attribute — the
   *  compiled unit of an OutSystems Reactive screen. Decisive: no
   *  non-OutSystems page emits it. */
  readonly dataBlockCount: number;
  /** `window.OutSystems` or `window.OSFramework` present. The single
   *  strongest Reactive-runtime signal. */
  readonly outSystemsRuntimeGlobal: boolean;
  /** The OutSystems runtime bundle is referenced by a `<script src>`
   *  (`OutSystemsReactView.js` / `OutSystems.js`). Survives even a
   *  runtime that has not yet exposed its global. */
  readonly outSystemsScriptPresent: boolean;
  /** True iff a hidden input named `__OSVSTATE` is present
   *  (Traditional-Web marker; disqualifies Reactive). */
  readonly osvstatePresent: boolean;
  /** Page-level framework detection. Informational since the
   *  2026-09-16 recalibration — corroborates but never gates. */
  readonly reactDetected: boolean;
  readonly angularDetected: boolean;
  readonly vueDetected: boolean;
}

/** `data-block` count at or above which the page is Reactive-positive
 *  on that signal alone. Real routes ranged 11–164; a defensive floor
 *  of 3 clears chrome-only false positives. */
const DATA_BLOCK_FLOOR = 3;

/** `osui-*` any-token count at or above which the page is
 *  Reactive-positive without a runtime global. The old code used 3
 *  over first-token classes; this keeps the number but reads the
 *  honest any-position count. */
const OSUI_STANDALONE_FLOOR = 3;

/** Classify a page's variant from its DOM signals. Pure. */
export function classifyVariant(
  signals: VariantClassifierSignals,
): VariantClassifierVerdict {
  const positives: string[] = [];
  if (signals.outSystemsRuntimeGlobal) {
    positives.push('window.OutSystems / OSFramework runtime global present');
  }
  if (signals.outSystemsScriptPresent) {
    positives.push('OutSystems runtime bundle referenced by a script tag');
  }
  if (signals.dataBlockCount >= DATA_BLOCK_FLOOR) {
    positives.push(`${signals.dataBlockCount} data-block containers (Reactive compiled-block markers)`);
  }
  if (signals.osuiAnyTokenCount >= OSUI_STANDALONE_FLOOR) {
    positives.push(`${signals.osuiAnyTokenCount} osui-* class tokens (any position)`);
  }

  // Corroborating (never sufficient alone): framework markers +
  // a lone osui-* class. Recorded in evidence when a decision lands.
  const corroborating: string[] = [];
  if (signals.reactDetected) corroborating.push('React marker detected');
  if (signals.angularDetected) corroborating.push('Angular marker detected');
  if (signals.vueDetected) corroborating.push('Vue marker detected');
  if (signals.osuiAnyTokenCount > 0 && signals.osuiAnyTokenCount < OSUI_STANDALONE_FLOOR) {
    corroborating.push(`${signals.osuiAnyTokenCount} osui-* class token(s) (below standalone floor)`);
  }

  const reactivePositive = positives.length > 0;

  // Reactive-positive signals alongside the Traditional-Web marker →
  // ambiguous. Route to operator review rather than silently picking.
  if (reactivePositive && signals.osvstatePresent) {
    return {
      kind: 'ambiguous',
      conflictingEvidence: [
        ...positives.map((p) => `reactive: ${p}`),
        'traditional marker present: __OSVSTATE hidden input',
      ],
    };
  }

  if (reactivePositive) {
    return {
      kind: 'reactive',
      osuiClassCount: signals.osuiAnyTokenCount,
      evidence: [...positives, ...corroborating],
    };
  }

  // Not-reactive. Enumerate the missing conditions for diagnostic
  // clarity.
  const evidence: string[] = [];
  if (signals.osvstatePresent) {
    evidence.push('__OSVSTATE present (Traditional Web marker)');
  }
  evidence.push(
    `no Reactive-positive signal: runtime global ${signals.outSystemsRuntimeGlobal ? 'present' : 'absent'}, ` +
      `script ${signals.outSystemsScriptPresent ? 'present' : 'absent'}, ` +
      `data-block ${signals.dataBlockCount}, osui-* ${signals.osuiAnyTokenCount}`,
  );
  if (corroborating.length > 0) {
    evidence.push(`corroborating-only (insufficient): ${corroborating.join('; ')}`);
  }
  return { kind: 'not-reactive', evidence };
}

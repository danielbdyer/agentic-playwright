/**
 * GraduationGate — the closed graduation-state union + the four
 * ordered conditions the engine evaluates.
 *
 * Per docs/v2-compounding-engine-plan.md §3.5, graduation is a
 * computed state over the most-recent scoreboard. Four conditions,
 * evaluated in order:
 *
 *   1. probe-coverage-is-100          — every manifest verb has a
 *                                        passing probe receipt.
 *   2. scenario-corpus-all-passes     — every scenario in the
 *                                        corpus passes current run.
 *   3. hypothesis-confirmation-rate-  — the rolling window of
 *         sustained                     confirmation rates sits at
 *                                        or above trust-policy floor.
 *   4. no-ratchet-regressions         — every ratcheted scenario is
 *                                        passing today.
 *
 * `holds` iff all four conditions held. `regressed` iff any
 * condition flipped from previously-held to failing. `not-yet`
 * is the default first-time-not-yet state.
 *
 * No Effect imports — pure types + fold.
 */

export type GraduationGateState = 'holds' | 'not-yet' | 'regressed';

/** One condition's evaluation. `detail` carries a short reason
 *  string for the dashboard / CLI's explain mode. */
export interface GraduationCondition {
  readonly name: string;
  readonly held: boolean;
  readonly detail: string;
}

/** The aggregate report the scoreboard carries. */
export interface GraduationGateReport {
  readonly state: GraduationGateState;
  /** Names of conditions that did NOT hold. Empty when `state`
   *  is `'holds'`. */
  readonly missingConditions: readonly string[];
  /** Every condition, in evaluation order, with its held flag +
   *  detail. `conditions.length === GRADUATION_CONDITIONS.length`. */
  readonly conditions: readonly GraduationCondition[];
}

/** The four ordered graduation conditions. Referenced by name
 *  across the engine. The array is frozen in intent — additions
 *  bump schemaVersion + require coordinated evaluator updates. */
export const GRADUATION_CONDITIONS: readonly string[] = [
  'probe-coverage-is-100',
  'scenario-corpus-all-passes',
  'hypothesis-confirmation-rate-sustained',
  'no-ratchet-regressions',
];

/** Exhaustive GraduationGateState fold. */
export function foldGraduationGateState<R>(
  state: GraduationGateState,
  cases: {
    readonly holds: () => R;
    readonly notYet: () => R;
    readonly regressed: () => R;
  },
): R {
  switch (state) {
    case 'holds':     return cases.holds();
    case 'not-yet':   return cases.notYet();
    case 'regressed': return cases.regressed();
  }
}

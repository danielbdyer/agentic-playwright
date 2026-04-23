/**
 * computeGraduationGate — pure evaluation of the four ordered
 * graduation conditions.
 *
 * Per docs/v2-compounding-engine-plan.md §9.5 (ZC23), the
 * graduation gate:
 *
 *   1. probe-coverage-is-100                — every manifest verb has
 *                                             a passing probe receipt.
 *   2. scenario-corpus-all-passes           — every scenario passes.
 *   3. hypothesis-confirmation-rate-        — rolling window ≥ floor.
 *      sustained
 *   4. no-ratchet-regressions               — no active ratchet is
 *                                             currently broken.
 *
 * `holds` iff all four hold. Missing conditions are listed in
 * stable order (the GRADUATION_CONDITIONS array order). `regressed`
 * is emitted when we have a priorHolds=true baseline AND the
 * current state has at least one missing condition.
 *
 * Default confirmation-rate floor is 0.8 (operator-configurable via
 * trust-policy.yaml in later phases); we accept it as an input.
 *
 * No Effect imports.
 */

import {
  GRADUATION_CONDITIONS,
  type GraduationCondition,
  type GraduationGateReport,
  type GraduationGateState,
} from '../domain/graduation';
import { rollingRate, type Trajectory } from '../domain/trajectory';
import type { RegressionReport } from '../domain/regression';

export interface GraduationInputs {
  readonly probeCoverageRatio: number;
  readonly scenarioPassRatio: number;
  readonly trajectories: readonly Trajectory[];
  readonly regression: RegressionReport | null;
  readonly confirmationRateFloor: number;
  readonly confirmationRateWindow: number;
  /** When true, the prior scoreboard had state='holds'. When the
   *  current evaluation has missing conditions, state becomes
   *  'regressed' rather than 'not-yet'. */
  readonly priorHolds: boolean;
  /** Minimum number of cycle entries the aggregate trajectory must
   *  carry before the rate gate can hold. This enforces the
   *  "sustained over N cycles" semantic: fewer entries → rate gate
   *  is "insufficient evidence" even if the rate itself meets the
   *  floor. Default 3 (matches M5 MIN_TRAJECTORY_POINTS). */
  readonly minSustainedCycles?: number;
}

export function computeGraduationGate(inputs: GraduationInputs): GraduationGateReport {
  const minSustainedCycles = inputs.minSustainedCycles ?? 3;
  const probeCoverageHeld = inputs.probeCoverageRatio >= 1;
  const scenarioCorpusHeld = inputs.scenarioPassRatio >= 1;
  const { rate: sustainedRate, deepestSampled } = computeSustainedRate(inputs);
  const sustainedEnough = deepestSampled >= minSustainedCycles;
  const rateHeld =
    sustainedRate !== null && sustainedEnough && sustainedRate >= inputs.confirmationRateFloor;
  const noRatchetBreaks =
    inputs.regression === null || inputs.regression.ratchetBreaks.length === 0;

  const conditions: GraduationCondition[] = [
    {
      name: GRADUATION_CONDITIONS[0]!,
      held: probeCoverageHeld,
      detail: probeCoverageHeld
        ? 'all manifest verbs have a passing probe receipt'
        : `probe coverage ${(inputs.probeCoverageRatio * 100).toFixed(1)}% < 100%`,
    },
    {
      name: GRADUATION_CONDITIONS[1]!,
      held: scenarioCorpusHeld,
      detail: scenarioCorpusHeld
        ? 'scenario corpus 100% passing'
        : `scenario pass ratio ${(inputs.scenarioPassRatio * 100).toFixed(1)}% < 100%`,
    },
    {
      name: GRADUATION_CONDITIONS[2]!,
      held: rateHeld,
      detail:
        sustainedRate === null
          ? 'insufficient evidence to compute confirmation rate'
          : !sustainedEnough
            ? `only ${deepestSampled} cycle(s) observed; need >= ${minSustainedCycles} to sustain`
            : rateHeld
              ? `rolling rate ${sustainedRate.toFixed(3)} >= floor ${inputs.confirmationRateFloor}`
              : `rolling rate ${sustainedRate.toFixed(3)} < floor ${inputs.confirmationRateFloor}`,
    },
    {
      name: GRADUATION_CONDITIONS[3]!,
      held: noRatchetBreaks,
      detail: noRatchetBreaks
        ? 'no active ratchet is currently broken'
        : `${inputs.regression?.ratchetBreaks.length ?? 0} ratchet(s) currently broken`,
    },
  ];

  const missingConditions = conditions.filter((c) => !c.held).map((c) => c.name);
  const state: GraduationGateState =
    missingConditions.length === 0 ? 'holds' : inputs.priorHolds ? 'regressed' : 'not-yet';

  return { state, missingConditions, conditions };
}

/** Compute the aggregate rolling confirmation rate across all
 *  cohort trajectories, plus the deepest per-cohort sample count
 *  (how many cycle entries the longest trajectory carries within
 *  the window). The deepest count feeds the "sustained enough"
 *  gate so single-cycle evidence doesn't prematurely graduate. */
function computeSustainedRate(inputs: GraduationInputs): {
  rate: number | null;
  deepestSampled: number;
} {
  let confirmed = 0;
  let refuted = 0;
  let hasAny = false;
  let deepestSampled = 0;
  for (const trajectory of inputs.trajectories) {
    const slice = trajectory.entries.slice(-inputs.confirmationRateWindow);
    if (slice.length === 0) continue;
    hasAny = true;
    if (slice.length > deepestSampled) deepestSampled = slice.length;
    for (const entry of slice) {
      confirmed += entry.confirmedCount;
      refuted += entry.refutedCount;
    }
  }
  if (!hasAny) return { rate: null, deepestSampled: 0 };
  const denom = confirmed + refuted;
  return {
    rate: denom === 0 ? null : confirmed / denom,
    deepestSampled,
  };
}

// Re-export rollingRate for convenience (callers that want a
// per-cohort rate can invoke it directly).
export { rollingRate };

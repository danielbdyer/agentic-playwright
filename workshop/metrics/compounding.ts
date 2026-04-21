/**
 * Compounding economics — cohort-trajectory measurement of the C-family
 * obligations from the temporal-epistemic addendum.
 *
 * This is the load-bearing module that turns the addendum's compounding
 * claims into honestly-falsifiable measurements. Today's heuristic risk
 * scores in fitness.ts derive `compounding-economics` from single-frame
 * fitness rates — that's a current-state measurement, not a trajectory.
 *
 * This module operates on a sequence of `(maturity, value)` pairs from
 * within a single cohort and computes the compounding direction
 * (ascending / flat / descending) plus a calibrated risk score that
 * matches `LogicalProofObligation.score` semantics.
 *
 * Pure domain — no Effect, no IO. The application layer projects scorecard
 * history filtered by cohort into the input shape.
 */

import type { LogicalProofObligation, LogicalTheoremGroup, LogicalProofObligationName } from '../../product/domain/fitness/types';

// ─── Inputs ────────────────────────────────────────────────────────

/**
 * One sample within a cohort: a maturity scalar and a numeric value being
 * tracked across maturity (e.g. `meanReuse`, `meanNovelty`, `effectiveHitRate`).
 */
export interface CompoundingSample {
  readonly maturity: number;
  readonly value: number;
  /** Optional ISO timestamp for tie-breaking and downstream display. */
  readonly observedAt?: string;
}

/**
 * The shape consumed by C-family obligation builders. Filtered to a
 * single cohort upstream.
 */
export interface CompoundingTrajectory {
  readonly samples: readonly CompoundingSample[];
  /** Whether higher values are better (e.g. reuse rate) or worse (novelty). */
  readonly direction: 'higher-is-better' | 'lower-is-better';
}

// ─── Direction analysis ────────────────────────────────────────────

export type TrajectoryDirection = 'ascending' | 'flat' | 'descending' | 'insufficient-data';

/** Minimum number of samples required to compute a direction. */
export const MIN_TRAJECTORY_SAMPLES = 2;

/** Number of samples at which the obligation graduates from `proxy` → `direct`. */
export const DIRECT_TRAJECTORY_SAMPLES = 3;

/**
 * Compute the slope direction over the (maturity, value) samples using
 * a least-squares linear fit. Pure.
 *
 *   - 'ascending'   : slope > slopeFlatBand (statistically improving)
 *   - 'descending'  : slope < -slopeFlatBand (statistically regressing)
 *   - 'flat'        : |slope| ≤ slopeFlatBand
 *   - 'insufficient-data' : fewer than MIN_TRAJECTORY_SAMPLES
 *
 * The flat band defaults to 0.01 — small enough to detect real
 * compounding, large enough to ignore floating-point jitter.
 */
export function trajectoryDirection(
  trajectory: CompoundingTrajectory,
  slopeFlatBand: number = 0.01,
): TrajectoryDirection {
  if (trajectory.samples.length < MIN_TRAJECTORY_SAMPLES) {
    return 'insufficient-data';
  }
  const slope = leastSquaresSlope(trajectory.samples);
  const orientedSlope = trajectory.direction === 'higher-is-better' ? slope : -slope;
  if (orientedSlope > slopeFlatBand) return 'ascending';
  if (orientedSlope < -slopeFlatBand) return 'descending';
  return 'flat';
}

/** Pure least-squares slope of `value` over `maturity`. */
export function leastSquaresSlope(samples: readonly CompoundingSample[]): number {
  const n = samples.length;
  if (n < 2) return 0;
  const sumX = samples.reduce((s, p) => s + p.maturity, 0);
  const sumY = samples.reduce((s, p) => s + p.value, 0);
  const meanX = sumX / n;
  const meanY = sumY / n;
  const numerator = samples.reduce((s, p) => s + (p.maturity - meanX) * (p.value - meanY), 0);
  const denominator = samples.reduce((s, p) => s + (p.maturity - meanX) ** 2, 0);
  return denominator === 0 ? 0 : numerator / denominator;
}

// ─── Risk + measurement class ──────────────────────────────────────

/** Map a trajectory direction to a 0..1 risk score. Pure. */
export function trajectoryRisk(direction: TrajectoryDirection): number {
  switch (direction) {
    case 'ascending': return 0;
    case 'flat': return 0.5;
    case 'descending': return 0.9;
    case 'insufficient-data': return 0.5;
  }
}

/** Map a trajectory direction + sample count to a measurement class.
 *  See LogicalProofObligation.measurementClass once Phase 1.7 lands. */
export function trajectoryMeasurementClass(
  trajectory: CompoundingTrajectory,
): 'direct' | 'heuristic-proxy' | 'derived' {
  if (trajectory.samples.length >= DIRECT_TRAJECTORY_SAMPLES) return 'direct';
  if (trajectory.samples.length >= MIN_TRAJECTORY_SAMPLES) return 'heuristic-proxy';
  return 'derived';
}

// ─── Obligation builder ────────────────────────────────────────────

/**
 * Build a `LogicalProofObligation` from a compounding trajectory. Pure.
 *
 * The obligation status:
 *   - `healthy`  when the trajectory is ascending in its preferred direction
 *   - `watch`    when flat or insufficient-data
 *   - `critical` when descending
 *
 * The score is `1 - risk`, matching the existing obligation convention.
 */
export function compoundingObligation(input: {
  readonly obligation: LogicalProofObligationName;
  readonly propertyRefs: readonly LogicalTheoremGroup[];
  readonly trajectory: CompoundingTrajectory;
  readonly metricName: string;
}): LogicalProofObligation {
  const direction = trajectoryDirection(input.trajectory);
  const risk = trajectoryRisk(direction);
  const score = Number((1 - risk).toFixed(4));
  const status: LogicalProofObligation['status'] = direction === 'ascending'
    ? 'healthy'
    : direction === 'descending'
      ? 'critical'
      : 'watch';
  const slope = input.trajectory.samples.length >= 2
    ? leastSquaresSlope(input.trajectory.samples)
    : 0;
  return {
    obligation: input.obligation,
    propertyRefs: input.propertyRefs,
    score,
    status,
    evidence: `${input.metricName} trajectory: ${input.trajectory.samples.length} samples, direction=${direction}, slope=${slope.toFixed(4)}, oriented=${input.trajectory.direction}`,
  };
}

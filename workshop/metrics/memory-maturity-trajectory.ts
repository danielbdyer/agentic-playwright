/**
 * MemoryMaturityTrajectory — a series of maturity observations over
 * time, indexed by cohort identity.
 *
 * M5 (Memory Worthiness Ratio) from `docs/alignment-targets.md` is
 * defined as the slope of this trajectory's cohort-comparable points:
 *
 *   M5 = RememberingBenefit(τ) / MemoryMaintenanceCost(τ)
 *      ≈ slope(effectiveHitRate over MemoryMaturity) / overhead
 *
 * The trajectory is a pure value object — appending a point returns
 * a new trajectory. `trajectorySlope` computes the linear slope over
 * a window of comparable cohort points.
 *
 * Pure domain — no Effect, no IO, no application imports.
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 3
 */

import type { MemoryMaturity, MemoryMaturityCounts } from './memory-maturity';
import { computeMemoryMaturity, ZERO_MATURITY } from './memory-maturity';

// ─── Point ──────────────────────────────────────────────────────

/** A single observation in the maturity trajectory. Captures the
 *  maturity state at a specific point in time for a specific
 *  cohort, plus the pipeline-efficacy metric (effectiveHitRate)
 *  observed at that point. */
export interface MemoryMaturityPoint {
  /** The cohort this point belongs to. Only points with the same
   *  cohortId are comparable for slope computation. */
  readonly cohortId: string;
  /** ISO timestamp of the observation. */
  readonly observedAt: string;
  /** The maturity value at this point. */
  readonly maturity: MemoryMaturity;
  /** The counts that produced the maturity (for provenance/debugging). */
  readonly counts: MemoryMaturityCounts;
  /** The pipeline-efficacy metric observed at this maturity level.
   *  This is the Y-axis for the M5 slope computation. */
  readonly effectiveHitRate: number;
  /** Optional iteration index within a speedrun. */
  readonly iteration?: number | undefined;
  /** Optional run ID for tracing back to the run record. */
  readonly runId?: string | undefined;
}

// ─── Trajectory ─────────────────────────────────────────────────

/** An ordered series of maturity observations. Immutable — appending
 *  returns a new trajectory. */
export interface MemoryMaturityTrajectory {
  readonly points: readonly MemoryMaturityPoint[];
}

/** The empty trajectory — the cold-start baseline. */
export const EMPTY_TRAJECTORY: MemoryMaturityTrajectory = {
  points: [],
};

/** Append a point to a trajectory. Returns a new trajectory with
 *  the point sorted by observedAt. Pure. */
export function appendPoint(
  trajectory: MemoryMaturityTrajectory,
  point: MemoryMaturityPoint,
): MemoryMaturityTrajectory {
  const points = [...trajectory.points, point].sort(
    (a, b) => a.observedAt.localeCompare(b.observedAt),
  );
  return { points };
}

/** Create a trajectory from a list of points. */
export function trajectoryFrom(
  points: readonly MemoryMaturityPoint[],
): MemoryMaturityTrajectory {
  return {
    points: [...points].sort(
      (a, b) => a.observedAt.localeCompare(b.observedAt),
    ),
  };
}

// ─── Comparability ──────────────────────────────────────────────

/** Two points are comparable iff they share a cohort identity.
 *  Cross-cohort comparisons are meaningless because different
 *  cohorts may have different workload sizes and complexity
 *  profiles. */
export function isComparableAt(
  a: MemoryMaturityPoint,
  b: MemoryMaturityPoint,
): boolean {
  return a.cohortId === b.cohortId;
}

/** Filter a trajectory to only points for a specific cohort. */
export function cohortSlice(
  trajectory: MemoryMaturityTrajectory,
  cohortId: string,
): MemoryMaturityTrajectory {
  return {
    points: trajectory.points.filter((p) => p.cohortId === cohortId),
  };
}

/** Get the distinct cohort IDs present in a trajectory. */
export function cohortIds(
  trajectory: MemoryMaturityTrajectory,
): readonly string[] {
  return [...new Set(trajectory.points.map((p) => p.cohortId))].sort();
}

// ─── Slope computation ──────────────────────────────────────────

/** Compute the linear slope of effectiveHitRate over maturity for
 *  a trajectory (or a cohort slice of one). Uses ordinary least-
 *  squares over the (maturity, effectiveHitRate) pairs.
 *
 *  Returns 0 for trajectories with fewer than 2 points (slope is
 *  undefined for a single point; we define it as zero rather than
 *  NaN to avoid downstream NaN propagation).
 *
 *  The slope is the raw M5 numerator: positive means "more memory
 *  = better hit rate" (the compounding benefit is real). Zero or
 *  negative means memory isn't paying off. */
export function trajectorySlope(
  trajectory: MemoryMaturityTrajectory,
): number {
  const n = trajectory.points.length;
  if (n < 2) return 0;

  // OLS: slope = (n * Σ(x*y) - Σx * Σy) / (n * Σ(x²) - (Σx)²)
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (const point of trajectory.points) {
    const x = point.maturity as number;
    const y = point.effectiveHitRate;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }

  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0; // all X values identical

  return (n * sumXY - sumX * sumY) / denominator;
}

/** The latest maturity value in the trajectory, or ZERO_MATURITY
 *  if the trajectory is empty. */
export function latestMaturity(
  trajectory: MemoryMaturityTrajectory,
): MemoryMaturity {
  if (trajectory.points.length === 0) return ZERO_MATURITY;
  return trajectory.points[trajectory.points.length - 1]!.maturity;
}

/** The latest effective hit rate in the trajectory, or 0 if empty. */
export function latestHitRate(
  trajectory: MemoryMaturityTrajectory,
): number {
  if (trajectory.points.length === 0) return 0;
  return trajectory.points[trajectory.points.length - 1]!.effectiveHitRate;
}

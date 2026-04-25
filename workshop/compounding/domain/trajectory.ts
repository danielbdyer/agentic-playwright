/**
 * Trajectory — cohort-keyed time series of confirmation counts.
 *
 * Per docs/v2-compounding-engine-plan.md §3.4, a Trajectory is a
 * per-cohort sequence of TrajectoryEntry values, one per cycle.
 * Each entry stamps the substrate version + rolling-window
 * confirmation counts so the graduation gate can ask "sustained
 * over the last N entries at rate ≥ X?"
 *
 * The `rollingRate` helper is deliberately pure and
 * N-independent: window beyond the available entries returns the
 * rate over whatever entries exist; empty trajectory returns null;
 * zero denominator (all inconclusive) returns null.
 *
 * TrajectoryEntry is value-object-shaped: readonly fields, constructed
 * fresh. Adding an entry requires returning a new Trajectory — never
 * mutating the original. Law ZC8 pins this at Z1b.
 *
 * No Effect imports.
 */

/** One per-cycle sample within a cohort-keyed trajectory. */
export interface TrajectoryEntry {
  readonly cohortId: string;
  readonly timestamp: string;
  readonly sampleSize: number;
  readonly confirmedCount: number;
  readonly refutedCount: number;
  /** cycleRate for the entry: confirmed / (confirmed + refuted).
   *  Stored for snapshot stability. NaN-free by construction —
   *  zero denominators never produce a TrajectoryEntry; they
   *  short-circuit to no-entry upstream. */
  readonly rate: number;
  readonly substrateVersion: string;
}

/** A cohort's full trajectory — the sequence of entries in
 *  chronological order (oldest first). */
export interface Trajectory {
  readonly cohortId: string;
  readonly entries: readonly TrajectoryEntry[];
}

/** Construct an empty trajectory for a given cohort. The
 *  identity element of `trajectoryMonoid(cohortId)`. */
export function emptyTrajectory(cohortId: string): Trajectory {
  return { cohortId, entries: [] };
}

/** A trajectory is a free monoid over TrajectoryEntry, scoped to
 *  a single cohort.
 *
 *  empty   = { cohortId, entries: [] }
 *  combine = entries concatenation (a then b, in declaration order)
 *
 *  Combining two trajectories with different cohortIds throws —
 *  cross-cohort union isn't a meaningful trajectory operation;
 *  callers wanting that should fold over a Map<CohortId,
 *  Trajectory> instead.
 *
 *  Identity laws: combine(empty, t) = t = combine(t, empty).
 *  Associativity: list concatenation is associative.
 *
 *  See `tests/compounding/trajectory-monoid.laws.spec.ts` for
 *  the law-runner. */
export function trajectoryMonoid(cohortId: string): {
  readonly empty: Trajectory;
  readonly combine: (a: Trajectory, b: Trajectory) => Trajectory;
} {
  return {
    empty: emptyTrajectory(cohortId),
    combine: (a, b) => {
      if (a.cohortId !== cohortId) {
        throw new Error(
          `trajectoryMonoid(${cohortId}): combine called with mismatched left cohort ${a.cohortId}`,
        );
      }
      if (b.cohortId !== cohortId) {
        throw new Error(
          `trajectoryMonoid(${cohortId}): combine called with mismatched right cohort ${b.cohortId}`,
        );
      }
      return {
        cohortId,
        entries: [...a.entries, ...b.entries],
      };
    },
  };
}

/** Append an entry to a trajectory, returning a new Trajectory.
 *  The original is unchanged. Law ZC8 (Z1b) pins immutability.
 *
 *  Equivalent to: `trajectoryMonoid(cohortId).combine(trajectory,
 *  { cohortId, entries: [entry] })`. The append helper is
 *  retained for ergonomic call sites; the monoid is the
 *  algebraic interpretation. */
export function appendTrajectoryEntry(
  trajectory: Trajectory,
  entry: TrajectoryEntry,
): Trajectory {
  return {
    cohortId: trajectory.cohortId,
    entries: [...trajectory.entries, entry],
  };
}

/** Rolling-window confirmation rate over the last N entries.
 *
 *  Returns null when the trajectory is empty OR the denominator
 *  (confirmed + refuted across the window) is zero.
 *
 *  Window larger than available entries returns the rate over
 *  all existing entries. Window ≤ 0 is treated as "return null"
 *  — callers should pass a positive integer.
 */
export function rollingRate(trajectory: Trajectory, window: number): number | null {
  if (trajectory.entries.length === 0) return null;
  if (window <= 0) return null;
  const slice = trajectory.entries.slice(-window);
  let confirmed = 0;
  let refuted = 0;
  for (const entry of slice) {
    confirmed += entry.confirmedCount;
    refuted += entry.refutedCount;
  }
  const denom = confirmed + refuted;
  return denom === 0 ? null : confirmed / denom;
}

/**
 * Cohort + Comparable — operational definitions of `Comparable(C1, C2)`
 * from the temporal-epistemic addendum.
 *
 * The addendum's compounding-economics obligations (C1–C5) reason about
 * "comparable cohorts" — sets of run records that are similar enough to
 * be measured together. Without a concrete `Comparable` predicate, every
 * "later cohorts compound" claim is unfalsifiable.
 *
 * Definition (operational):
 *
 *     Cohort      := { runs sharing a CohortKey }
 *     CohortKey   := { substrate, screenSet, postureMode }
 *     Comparable(a, b) :=
 *         a.substrate === b.substrate
 *       ∧ a.postureMode === b.postureMode
 *       ∧ jaccard(a.screenSet, b.screenSet) ≥ JACCARD_THRESHOLD
 *
 * Notes:
 *   - `roleSet` is **not** part of the key. Role-overlay variance is
 *     exactly what V1 says should compound — making it part of
 *     comparability would defeat the purpose.
 *   - The Jaccard threshold is parameterized so callers can tune it
 *     for early-corpus runs. The default is 0.5 (50% screen overlap).
 *   - This module is pure domain — no Effect, no IO, no application
 *     imports. The application layer projects an `ExperimentRecord` or
 *     `ScorecardHistoryEntry` into a `CohortKey`.
 */

/** The structural fingerprint of a substrate run. Two runs with the
 *  same key are guaranteed comparable; runs with different substrates
 *  or posture modes are never comparable regardless of overlap. */
export interface CohortKey {
  readonly substrate: string;
  readonly screenSet: ReadonlySet<string>;
  readonly postureMode: 'cold-start' | 'warm-start' | 'production';
}

/** Default Jaccard overlap threshold for `Comparable`. */
export const DEFAULT_JACCARD_THRESHOLD = 0.5;

/**
 * Jaccard similarity between two sets:  |A ∩ B| / |A ∪ B|
 *
 * Symmetric, in [0, 1]. Returns 1 when both sets are empty (the
 * degenerate case is treated as identity to keep the comparator
 * total — "no screens" cohorts compare equal to themselves).
 */
export function jaccard<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  if (a.size === 0 && b.size === 0) return 1;
  const intersection = countIntersection(a, b);
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function countIntersection<T>(a: ReadonlySet<T>, b: ReadonlySet<T>): number {
  // Iterate the smaller set for O(min(|a|, |b|)) work instead of O(|a|).
  const [smaller, larger] = a.size <= b.size ? [a, b] : [b, a];
  const step = (iter: Iterator<T>, count: number): number => {
    const next = iter.next();
    return next.done ? count : step(iter, count + (larger.has(next.value) ? 1 : 0));
  };
  return step(smaller[Symbol.iterator](), 0);
}

/**
 * Comparable predicate. Pure. Reflexive, symmetric. Not transitive
 * (Jaccard ≥ θ is not a transitive relation), which is the correct
 * intuition: A ~ B and B ~ C does not imply A ~ C if A and C only
 * overlap through B's bridging screens.
 */
export function comparable(
  a: CohortKey,
  b: CohortKey,
  threshold: number = DEFAULT_JACCARD_THRESHOLD,
): boolean {
  if (a.substrate !== b.substrate) return false;
  if (a.postureMode !== b.postureMode) return false;
  return jaccard(a.screenSet, b.screenSet) >= threshold;
}

/** Stable string key for grouping. Two cohorts with the same canonical
 *  key are guaranteed identical (not just comparable). */
export function cohortKeyDigest(key: CohortKey): string {
  const screens = [...key.screenSet].sort().join('|');
  return `${key.substrate}::${key.postureMode}::${screens}`;
}

/** Build a cohort key from a flat record (e.g. an ExperimentRecord
 *  projection or a ScorecardHistoryEntry annotation). Pure. */
export function cohortKey(input: {
  readonly substrate: string;
  readonly screens: Iterable<string>;
  readonly postureMode: 'cold-start' | 'warm-start' | 'production';
}): CohortKey {
  return {
    substrate: input.substrate,
    screenSet: new Set(input.screens),
    postureMode: input.postureMode,
  };
}

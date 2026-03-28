/**
 * Knowledge Coverage as Scorecard Metric (W3.9)
 *
 * Adds thin-screen / thin-action hotspots to convergence criteria.
 * The dogfood loop should not stop while thin screens remain.
 *
 * Coverage score per screen is a weighted mean of element, hint, and
 * posture density — bounded [0, 1]. Aggregate coverage is the weighted
 * mean across all screens (weighted by element count to avoid empty
 * screens inflating the average).
 */

// ─── Knowledge Coverage ───

export interface KnowledgeCoverage {
  readonly screenId: string;
  readonly elementCount: number;
  readonly hintCount: number;
  readonly postureCount: number;
  readonly coverageScore: number;
}

// ─── Weights ───

const ELEMENT_WEIGHT = 0.4;
const HINT_WEIGHT = 0.4;
const POSTURE_WEIGHT = 0.2;

// ─── Pure Functions ───

/**
 * Compute coverage for a single screen.
 *
 * Coverage is a weighted combination of three ratios:
 *   - element presence:  elementCount > 0 ? 1 : 0
 *   - hint coverage:     min(hintCount / elementCount, 1)
 *   - posture coverage:  min(postureCount / elementCount, 1)
 *
 * When elementCount is zero, all ratios are zero.
 */
export function computeScreenCoverage(
  screenId: string,
  elementCount: number,
  hintCount: number,
  postureCount: number,
): KnowledgeCoverage {
  if (elementCount <= 0) {
    return { screenId, elementCount: 0, hintCount, postureCount, coverageScore: 0 };
  }
  const elementPresence = 1;
  const hintRatio = Math.min(hintCount / elementCount, 1);
  const postureRatio = Math.min(postureCount / elementCount, 1);
  const coverageScore =
    ELEMENT_WEIGHT * elementPresence +
    HINT_WEIGHT * hintRatio +
    POSTURE_WEIGHT * postureRatio;
  return { screenId, elementCount, hintCount, postureCount, coverageScore };
}

/**
 * Find screens whose coverage is below the given threshold.
 * These are "thin screens" — hotspots needing more knowledge.
 */
export function findThinScreens(
  coverages: readonly KnowledgeCoverage[],
  threshold: number,
): readonly KnowledgeCoverage[] {
  return coverages.filter((c) => c.coverageScore < threshold);
}

/**
 * Aggregate coverage across all screens as a weighted mean,
 * weighted by element count. Screens with zero elements contribute
 * zero weight. Returns 0 when there are no elements at all.
 */
export function aggregateCoverage(
  coverages: readonly KnowledgeCoverage[],
): number {
  const totalWeight = coverages.reduce((sum, c) => sum + c.elementCount, 0);
  if (totalWeight === 0) {
    return 0;
  }
  const weightedSum = coverages.reduce(
    (sum, c) => sum + c.coverageScore * c.elementCount,
    0,
  );
  return weightedSum / totalWeight;
}

/**
 * Coverage is converged when the aggregate coverage meets or exceeds
 * the threshold AND there are no thin screens below that threshold.
 */
export function isCoverageConverged(
  coverages: readonly KnowledgeCoverage[],
  threshold: number,
): boolean {
  return (
    aggregateCoverage(coverages) >= threshold &&
    findThinScreens(coverages, threshold).length === 0
  );
}

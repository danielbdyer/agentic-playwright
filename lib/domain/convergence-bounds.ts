/**
 * Fixed-point convergence bounds via Lyapunov stability analysis.
 *
 * Provides pure mathematical functions to detect convergence in the
 * self-improving loop. A Lyapunov function maps system state to a scalar
 * energy value; monotonic decrease of that energy guarantees convergence
 * to a fixed point.
 *
 * All functions are pure, side-effect free, and operate on immutable data.
 */

// ─── Convergence Metrics ───

export interface ConvergenceMetrics {
  readonly knowledgeHitRate: number;
  readonly proposalYield: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
}

// ─── Lyapunov Function ───

export interface LyapunovFunction {
  /** Map system state to a scalar energy value. Lower = better. */
  readonly evaluate: (state: ConvergenceMetrics) => number;
  /** True when the energy has decreased by more than epsilon. */
  readonly isDecreasing: (prev: number, current: number, epsilon: number) => boolean;
}

// ─── Lyapunov Constructors ───

/**
 * Lyapunov function based on knowledge hit rate.
 * Phi(state) = 1 - knowledgeHitRate, so decreasing energy = improving hit rate.
 * We use (1 - rate) rather than -rate to keep the energy non-negative,
 * which is the standard Lyapunov convention.
 */
export function knowledgeHitRateLyapunov(): LyapunovFunction {
  return {
    evaluate: (state: ConvergenceMetrics): number => 1 - state.knowledgeHitRate,
    isDecreasing: (prev: number, current: number, epsilon: number): boolean =>
      prev - current > epsilon,
  };
}

/**
 * Composite Lyapunov function combining multiple metrics with weights.
 * Phi(state) = sum(w_i * (1 - metric_i)) for each weighted metric.
 */
export function compositeLyapunov(
  weights: {
    readonly knowledgeHitRate: number;
    readonly proposalYield: number;
    readonly translationPrecision: number;
  },
): LyapunovFunction {
  const totalWeight = weights.knowledgeHitRate + weights.proposalYield + weights.translationPrecision;
  return {
    evaluate: (state: ConvergenceMetrics): number =>
      (weights.knowledgeHitRate * (1 - state.knowledgeHitRate) +
        weights.proposalYield * (1 - state.proposalYield) +
        weights.translationPrecision * (1 - state.translationPrecision)) /
      totalWeight,
    isDecreasing: (prev: number, current: number, epsilon: number): boolean =>
      prev - current > epsilon,
  };
}

// ─── Termination Bound ───

/**
 * Derive the maximum number of iterations to reach targetValue from initialValue
 * given a constant rate of decrease per iteration.
 *
 * Uses ceiling division: ceil((initialValue - targetValue) / rateOfDecrease).
 * Returns Infinity when rateOfDecrease <= 0 (no progress being made).
 * Returns 0 when initialValue <= targetValue (already converged).
 */
export function deriveTerminationBound(
  rateOfDecrease: number,
  initialValue: number,
  targetValue: number,
): number {
  if (initialValue <= targetValue) return 0;
  if (rateOfDecrease <= 0) return Infinity;
  return Math.ceil((initialValue - targetValue) / rateOfDecrease);
}

// ─── Monotonicity Check ───

/**
 * Check whether a sequence of values is monotonically decreasing
 * within an epsilon tolerance. Each successive value must be no greater
 * than the previous value plus epsilon.
 *
 * An empty or single-element sequence is trivially monotone.
 */
export function isMonotonicallyDecreasing(
  values: readonly number[],
  epsilon: number,
): boolean {
  return values.every(
    (value, index) => index === 0 || value <= values[index - 1]! + epsilon,
  );
}

// ─── Fixed-Point Detection ───

/**
 * Detect whether the sequence has reached a fixed point: the last N values
 * are all within epsilon of each other (the system has stopped changing).
 *
 * Returns false if fewer than windowSize values are available.
 */
export function isFixedPoint(
  values: readonly number[],
  windowSize: number,
  epsilon: number,
): boolean {
  if (values.length < windowSize) return false;
  const window = values.slice(-windowSize);
  const min = Math.min(...window);
  const max = Math.max(...window);
  return max - min <= epsilon;
}

// ─── Rate of Decrease Estimation ───

/**
 * Estimate the average rate of decrease from a sequence of energy values.
 * Uses only consecutive pairs where the value actually decreased.
 * Returns 0 if no decrease was observed.
 */
export function estimateRateOfDecrease(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const decreases = values
    .slice(1)
    .map((v, i) => values[i]! - v)
    .filter((d) => d > 0);
  return decreases.length === 0
    ? 0
    : decreases.reduce((sum, d) => sum + d, 0) / decreases.length;
}

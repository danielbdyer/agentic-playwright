/**
 * Signal Maturation — pure functions for dampening early-iteration learning signals.
 *
 * Uses the same saturation curve as component-maturation.ts (lib/domain/projection/
 * component-maturation.ts) with a half-saturation constant of 3 iterations:
 *
 *   maturity(n) = 1 - 1/(1 + n/3)
 *
 * At iteration 1: 0.25 (signals heavily dampened)
 * At iteration 3: 0.50 (half weight)
 * At iteration 5: 0.625 (most decisions influenced)
 * At iteration 10: 0.77 (near full weight)
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import { round4 } from './learning-shared';
import type { LearningSignalsSummary } from '../../domain/types';

/** Half-saturation constant: iteration at which maturity reaches 0.5. */
const HALF_SATURATION_ITERATION = 3;

/**
 * Compute signal maturity for a given iteration number.
 * Returns a value in (0, 1) — never exactly 0 or 1.
 *
 * Reuses the saturation curve from component-maturation.ts:
 *   saturation = 1 - 1/(1 + x/k)
 */
export function signalMaturity(iteration: number): number {
  return round4(1 - 1 / (1 + Math.max(0, iteration) / HALF_SATURATION_ITERATION));
}

/**
 * Dampen a single signal strength by the iteration's maturity factor.
 */
export function dampenSignalStrength(strength: number, iteration: number): number {
  return round4(strength * signalMaturity(iteration));
}

/**
 * Count the number of degrading learning signal dimensions.
 *
 * "Degrading" means the dimension is below healthy thresholds:
 * - For "lower is better" dims (regression, flakiness, noise): value > 0.3
 * - For "higher is better" dims (efficiency, stability, maturity): value < 0.5
 */
export function countDegradingSignals(signals: LearningSignalsSummary): number {
  let count = 0;
  // Lower is better — degrading when high
  if (signals.timingRegressionRate > 0.3) count++;
  if (signals.selectorFlakinessRate > 0.3) count++;
  if (signals.consoleNoiseLevel > 0.3) count++;
  // Higher is better — degrading when low
  if (signals.recoveryEfficiency < 0.5) count++;
  if (signals.costEfficiency < 0.5) count++;
  if (signals.rungStability < 0.5) count++;
  if (signals.componentMaturityRate < 0.5) count++;
  return count;
}

/**
 * Build a LearningSignalsSummary from learning-state.ts LearningSignals
 * combined with execution-coherence composite health data.
 *
 * Pure function: learning signals + coherence metrics → summary.
 */
export function buildLearningSignalsSummary(
  signals: {
    readonly timingRegressionRate: number;
    readonly selectorFlakinessRate: number;
    readonly recoveryEfficiency: number;
    readonly consoleNoiseLevel: number;
    readonly costEfficiency: number;
    readonly rungStability: number;
    readonly componentMaturityRate: number;
  },
  compositeHealthScore: number,
  hotScreenCount: number,
): LearningSignalsSummary {
  return {
    timingRegressionRate: round4(signals.timingRegressionRate),
    selectorFlakinessRate: round4(signals.selectorFlakinessRate),
    recoveryEfficiency: round4(signals.recoveryEfficiency),
    consoleNoiseLevel: round4(signals.consoleNoiseLevel),
    costEfficiency: round4(signals.costEfficiency),
    rungStability: round4(signals.rungStability),
    componentMaturityRate: round4(signals.componentMaturityRate),
    compositeHealthScore: round4(compositeHealthScore),
    hotScreenCount,
  };
}

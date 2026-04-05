import { signalMaturity } from '../../learning/signal-maturation';
import { round4 } from '../../learning/learning-shared';
import { groupBy } from '../../../domain/kernel/collections';
import type { BottleneckWeightCorrelation } from '../../../domain/fitness/types';
import type { ImprovementLoopIteration } from '../../../domain/improvement/types';

export type DogfoodIterationResult = ImprovementLoopIteration;

/** Extract bottleneck signal strengths from a single iteration's characteristics.
 *  Pure function: maps iteration metrics to weighted bottleneck signals.
 *  When learningSignals are present on the iteration, enriches with 7 maturity-dampened
 *  health dimensions (selector flakiness, timing regression, etc.). */
export function iterationSignalStrengths(iteration: DogfoodIterationResult): readonly { readonly signal: string; readonly strength: number }[] {
  const unresolvedRate = iteration.totalStepCount > 0
    ? iteration.unresolvedStepCount / iteration.totalStepCount
    : 0;
  const baseSignals = [
    { signal: 'high-unresolved-rate', strength: unresolvedRate },
    { signal: 'repair-recovery-hotspot', strength: iteration.proposalsActivated > 0 ? 0.3 : 0 },
    { signal: 'translation-fallback-dominant', strength: unresolvedRate > 0.5 ? 0.2 : 0 },
    { signal: 'thin-screen-coverage', strength: unresolvedRate > 0.3 ? 0.1 : 0 },
  ];

  const ls = iteration.learningSignals;
  if (!ls) return baseSignals.filter(({ strength }) => strength > 0);

  const maturity = signalMaturity(iteration.iteration);
  const healthSignals = [
    { signal: 'selector-flakiness', strength: round4(ls.selectorFlakinessRate * maturity) },
    { signal: 'timing-regression', strength: round4(ls.timingRegressionRate * maturity) },
    { signal: 'console-noise', strength: round4(ls.consoleNoiseLevel * maturity) },
    { signal: 'cost-anomaly', strength: round4((1 - ls.costEfficiency) * maturity) },
    { signal: 'rung-degradation', strength: round4((1 - ls.rungStability) * maturity) },
    { signal: 'recovery-inefficiency', strength: round4((1 - ls.recoveryEfficiency) * maturity) },
    { signal: 'component-maturation-stall', strength: round4((1 - ls.componentMaturityRate) * maturity) },
  ];

  return [...baseSignals, ...healthSignals].filter(({ strength }) => strength > 0);
}

/** Zip consecutive items into (current, next) tuples for fold analysis over adjacent pairs. */
export function consecutivePairs<T>(items: readonly T[]): readonly (readonly [T, T])[] {
  return items.slice(0, -1).map((item, index) => [item, items[index + 1]!] as const);
}

export function deriveIterationCorrelations(
  iterations: readonly DogfoodIterationResult[],
): readonly BottleneckWeightCorrelation[] {
  if (iterations.length < 2) {
    return [];
  }

  const observations = consecutivePairs(iterations).flatMap(([current, next]) => {
    const hitRateDelta = next.knowledgeHitRate - current.knowledgeHitRate;
    return iterationSignalStrengths(current)
      .map(({ signal, strength }) => ({ signal, delta: hitRateDelta * strength }));
  });

  const bySignal = groupBy(observations, (o) => o.signal);
  return Object.entries(bySignal).map(([signal, entries]) => ({
    signal,
    weight: 0,
    correlationWithImprovement: round4(
      entries.reduce((sum, e) => sum + e.delta, 0) / entries.length,
    ),
  }));
}

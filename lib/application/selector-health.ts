/**
 * Selector Health — evidence-driven feedback loop.
 *
 * Reads execution evidence (step-level locator outcomes) and computes
 * health metrics per selector: success rate, flakiness score, trend.
 * This closes the gap where evidence is written but never read back
 * into the selector canon.
 *
 * All functions are pure — no side effects, no mutation.
 */

import type { StepExecutionReceipt } from '../domain/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export type SelectorTrend = 'improving' | 'stable' | 'degrading';

export interface SelectorHealthMetrics {
  readonly selectorRef: string;
  readonly successRate: number;
  readonly flakiness: number;
  readonly trend: SelectorTrend;
  readonly totalAttempts: number;
  readonly recentSuccesses: number;
  readonly recentFailures: number;
}

export interface SelectorHealthIndex {
  readonly kind: 'selector-health-index';
  readonly version: 1;
  readonly selectors: readonly SelectorHealthMetrics[];
  readonly updatedAt: string;
}

// ─── Configuration ──────────────────────────────────────────────────────────

export interface SelectorHealthConfig {
  /** Window size for recent history (most recent N observations). Default: 20 */
  readonly recentWindow: number;
  /** Flakiness threshold: fraction of alternating pass/fail in recent window. Default: 0.3 */
  readonly flakinessThreshold: number;
  /** Minimum observations before computing trend. Default: 5 */
  readonly minObservationsForTrend: number;
}

export const DEFAULT_SELECTOR_HEALTH_CONFIG: SelectorHealthConfig = {
  recentWindow: 20,
  flakinessThreshold: 0.3,
  minObservationsForTrend: 5,
};

// ─── Observation extraction ─────────────────────────────────────────────────

export interface SelectorObservation {
  readonly selectorRef: string;
  readonly success: boolean;
  readonly rung: number;
  readonly degraded: boolean;
  readonly runAt: string;
}

/**
 * Extract selector observations from step execution receipts.
 * Each step with a locator strategy produces one observation.
 */
export function extractSelectorObservations(
  steps: readonly StepExecutionReceipt[],
): readonly SelectorObservation[] {
  return steps.flatMap((step) => {
    if (!step.locatorStrategy) return [];
    const selectorRef = `${step.locatorStrategy}:rung${step.locatorRung ?? 0}`;
    return [{
      selectorRef,
      success: step.failure.family === 'none',
      rung: step.locatorRung ?? 0,
      degraded: step.degraded,
      runAt: step.runAt,
    }];
  });
}

// ─── Health computation ─────────────────────────────────────────────────────

/**
 * Compute flakiness score from a sequence of pass/fail observations.
 * Flakiness = fraction of transitions (pass→fail or fail→pass) in the window.
 * High flakiness means the selector alternates unpredictably.
 */
export function computeFlakiness(observations: readonly boolean[]): number {
  if (observations.length < 2) return 0;
  let transitions = 0;
  for (let i = 1; i < observations.length; i++) {
    if (observations[i] !== observations[i - 1]) transitions++;
  }
  return transitions / (observations.length - 1);
}

/**
 * Compute trend from a sequence of success/failure observations.
 * Compares first-half success rate vs second-half success rate.
 */
export function computeTrend(
  observations: readonly boolean[],
  minObservations: number,
): SelectorTrend {
  if (observations.length < minObservations) return 'stable';
  const mid = Math.floor(observations.length / 2);
  const firstHalf = observations.slice(0, mid);
  const secondHalf = observations.slice(mid);
  const firstRate = firstHalf.filter(Boolean).length / firstHalf.length;
  const secondRate = secondHalf.filter(Boolean).length / secondHalf.length;
  const delta = secondRate - firstRate;
  if (delta > 0.1) return 'improving';
  if (delta < -0.1) return 'degrading';
  return 'stable';
}

/**
 * Build selector health metrics from accumulated observations.
 * Groups observations by selectorRef, computes health per selector.
 */
export function buildSelectorHealth(
  observations: readonly SelectorObservation[],
  config?: SelectorHealthConfig,
): readonly SelectorHealthMetrics[] {
  const effectiveConfig = config ?? DEFAULT_SELECTOR_HEALTH_CONFIG;

  // Group by selectorRef, maintaining temporal order
  const bySelector = new Map<string, SelectorObservation[]>();
  for (const obs of observations) {
    const arr = bySelector.get(obs.selectorRef) ?? [];
    arr.push(obs);
    bySelector.set(obs.selectorRef, arr);
  }

  return [...bySelector.entries()].map(([selectorRef, allObs]) => {
    // Sort by runAt for temporal analysis
    const sorted = [...allObs].sort((a, b) => a.runAt.localeCompare(b.runAt));
    const recent = sorted.slice(-effectiveConfig.recentWindow);
    const recentResults = recent.map((o) => o.success);
    const recentSuccesses = recentResults.filter(Boolean).length;
    const recentFailures = recentResults.length - recentSuccesses;

    return {
      selectorRef,
      successRate: sorted.length > 0 ? sorted.filter((o) => o.success).length / sorted.length : 0,
      flakiness: computeFlakiness(recentResults),
      trend: computeTrend(recentResults, effectiveConfig.minObservationsForTrend),
      totalAttempts: sorted.length,
      recentSuccesses,
      recentFailures,
    };
  });
}

/**
 * Merge new observations into an existing health index.
 * Re-computes health from the combined observation set.
 */
export function mergeHealthIndex(
  existing: SelectorHealthIndex | null,
  newObservations: readonly SelectorObservation[],
  config?: SelectorHealthConfig,
): SelectorHealthIndex {
  // For a full implementation, we'd persist raw observations.
  // Here we compute fresh health from the new observations and merge summaries.
  const newHealth = buildSelectorHealth(newObservations, config);
  const now = new Date().toISOString();

  if (!existing) {
    return {
      kind: 'selector-health-index',
      version: 1,
      selectors: newHealth,
      updatedAt: now,
    };
  }

  const merged = new Map<string, SelectorHealthMetrics>();
  for (const s of existing.selectors) {
    merged.set(s.selectorRef, s);
  }
  for (const s of newHealth) {
    const prev = merged.get(s.selectorRef);
    if (prev) {
      const totalAttempts = prev.totalAttempts + s.totalAttempts;
      const totalSuccesses = prev.successRate * prev.totalAttempts + s.successRate * s.totalAttempts;
      merged.set(s.selectorRef, {
        selectorRef: s.selectorRef,
        successRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0,
        flakiness: s.flakiness, // Use most recent flakiness
        trend: s.trend,         // Use most recent trend
        totalAttempts,
        recentSuccesses: s.recentSuccesses,
        recentFailures: s.recentFailures,
      });
    } else {
      merged.set(s.selectorRef, s);
    }
  }

  return {
    kind: 'selector-health-index',
    version: 1,
    selectors: [...merged.values()],
    updatedAt: now,
  };
}

/**
 * Identify degrading or flaky selectors that should trigger proposals.
 */
export function flagProblematicSelectors(
  index: SelectorHealthIndex,
  config?: SelectorHealthConfig,
): readonly SelectorHealthMetrics[] {
  const effectiveConfig = config ?? DEFAULT_SELECTOR_HEALTH_CONFIG;
  return index.selectors.filter((s) =>
    s.trend === 'degrading'
    || s.flakiness > effectiveConfig.flakinessThreshold
    || (s.totalAttempts >= effectiveConfig.minObservationsForTrend && s.successRate < 0.5),
  );
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// The selector health module expressed as an ObservationCollapse<R,O,A,S>.
// This is the design calculus Abstraction 2 applied concretely:
//   extract: StepExecutionReceipt → SelectorObservation
//   aggregate: SelectorObservation → SelectorHealthIndex
//   signal: SelectorHealthIndex → SelectorHealthMetrics[] (problematic ones)

import type { ObservationCollapse } from '../domain/kernel/observation-collapse';

export const selectorHealthCollapse: ObservationCollapse<
  StepExecutionReceipt,
  SelectorObservation,
  SelectorHealthIndex,
  readonly SelectorHealthMetrics[]
> = {
  extract: extractSelectorObservations,
  aggregate: (observations, prior) => mergeHealthIndex(prior, observations),
  signal: flagProblematicSelectors,
};

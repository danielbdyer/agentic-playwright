/**
 * Recovery Strategy Effectiveness Learning.
 *
 * Aggregates recovery attempt outcomes across runs to compute per-strategy,
 * per-failure-family effectiveness scores. These scores enable dynamic
 * reordering of recovery chains — strategies that actually work for a given
 * failure type get tried first.
 *
 * All functions are pure — no side effects, no mutation.
 */

import type { RecoveryFailureFamily, RecoveryStrategyId, RecoveryAttempt } from '../../domain/commitment/recovery-policy';
import type { StepExecutionReceipt } from '../../domain/types';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface StrategyEffectiveness {
  readonly strategyId: RecoveryStrategyId;
  readonly family: RecoveryFailureFamily;
  readonly attempts: number;
  readonly successes: number;
  readonly failures: number;
  readonly skips: number;
  readonly successRate: number;
  readonly meanDurationMs: number;
}

export interface RecoveryEffectivenessIndex {
  readonly kind: 'recovery-effectiveness-index';
  readonly version: 1;
  readonly strategies: readonly StrategyEffectiveness[];
  readonly updatedAt: string;
}

// ─── Pure functions ─────────────────────────────────────────────────────────

/**
 * Extract all recovery attempts from a set of step execution receipts.
 * Only includes steps where recovery was actually attempted (non-empty attempts).
 */
export function extractRecoveryAttempts(
  steps: readonly StepExecutionReceipt[],
): readonly RecoveryAttempt[] {
  return steps.flatMap((step) =>
    step.failure.family !== 'none'
      ? step.recovery.attempts.map((attempt) => ({
          strategyId: attempt.strategyId,
          family: attempt.family ?? step.failure.family as RecoveryFailureFamily,
          attempt: attempt.attempt,
          startedAt: attempt.startedAt,
          durationMs: attempt.durationMs,
          result: attempt.result,
          diagnostics: [...attempt.diagnostics],
        }))
      : [],
  );
}

/**
 * Aggregate recovery attempts into per-strategy, per-family effectiveness scores.
 * Pure fold over the attempt array.
 */
export function aggregateEffectiveness(
  attempts: readonly RecoveryAttempt[],
): readonly StrategyEffectiveness[] {
  // Group by (strategyId, family)
  const groups = new Map<string, {
    strategyId: RecoveryStrategyId;
    family: RecoveryFailureFamily;
    attempts: number;
    successes: number;
    failures: number;
    skips: number;
    totalDurationMs: number;
  }>();

  for (const attempt of attempts) {
    const key = `${attempt.strategyId}:${attempt.family}`;
    const existing = groups.get(key) ?? {
      strategyId: attempt.strategyId,
      family: attempt.family,
      attempts: 0,
      successes: 0,
      failures: 0,
      skips: 0,
      totalDurationMs: 0,
    };
    groups.set(key, {
      ...existing,
      attempts: existing.attempts + 1,
      successes: existing.successes + (attempt.result === 'recovered' ? 1 : 0),
      failures: existing.failures + (attempt.result === 'failed' ? 1 : 0),
      skips: existing.skips + (attempt.result === 'skipped' ? 1 : 0),
      totalDurationMs: existing.totalDurationMs + attempt.durationMs,
    });
  }

  return [...groups.values()].map((g) => ({
    strategyId: g.strategyId,
    family: g.family,
    attempts: g.attempts,
    successes: g.successes,
    failures: g.failures,
    skips: g.skips,
    successRate: g.attempts > 0 ? g.successes / g.attempts : 0,
    meanDurationMs: g.attempts > 0 ? g.totalDurationMs / g.attempts : 0,
  }));
}

/**
 * Merge new effectiveness data into an existing index.
 * Combines attempt counts and recomputes rates. Pure.
 */
export function mergeEffectiveness(
  existing: RecoveryEffectivenessIndex | null,
  newAttempts: readonly RecoveryAttempt[],
): RecoveryEffectivenessIndex {
  const now = new Date().toISOString();
  const newAgg = aggregateEffectiveness(newAttempts);

  if (!existing) {
    return {
      kind: 'recovery-effectiveness-index',
      version: 1,
      strategies: newAgg,
      updatedAt: now,
    };
  }

  // Merge by (strategyId, family) key
  const merged = new Map<string, StrategyEffectiveness>();
  for (const s of existing.strategies) {
    merged.set(`${s.strategyId}:${s.family}`, s);
  }
  for (const s of newAgg) {
    const key = `${s.strategyId}:${s.family}`;
    const prev = merged.get(key);
    if (prev) {
      const totalAttempts = prev.attempts + s.attempts;
      const totalSuccesses = prev.successes + s.successes;
      const totalDuration = prev.meanDurationMs * prev.attempts + s.meanDurationMs * s.attempts;
      merged.set(key, {
        strategyId: s.strategyId,
        family: s.family,
        attempts: totalAttempts,
        successes: totalSuccesses,
        failures: prev.failures + s.failures,
        skips: prev.skips + s.skips,
        successRate: totalAttempts > 0 ? totalSuccesses / totalAttempts : 0,
        meanDurationMs: totalAttempts > 0 ? totalDuration / totalAttempts : 0,
      });
    } else {
      merged.set(key, s);
    }
  }

  return {
    kind: 'recovery-effectiveness-index',
    version: 1,
    strategies: [...merged.values()],
    updatedAt: now,
  };
}

/**
 * Rank strategies for a given failure family by effectiveness.
 * Higher success rate wins; ties broken by lower mean duration.
 * Returns strategy IDs in recommended execution order.
 */
export function rankStrategiesForFamily(
  index: RecoveryEffectivenessIndex,
  family: RecoveryFailureFamily,
): readonly RecoveryStrategyId[] {
  return index.strategies
    .filter((s) => s.family === family && s.attempts > 0)
    .sort((a, b) => {
      // Primary: higher success rate first
      const rateDiff = b.successRate - a.successRate;
      if (Math.abs(rateDiff) > 0.01) return rateDiff;
      // Secondary: lower mean duration first (cheaper strategies preferred)
      return a.meanDurationMs - b.meanDurationMs;
    })
    .map((s) => s.strategyId);
}

/**
 * Compute a single recovery efficiency metric for fitness reporting.
 * Ratio of successful recoveries to total attempts, weighted by strategy cost
 * (duration). Lower cost + higher success = better efficiency.
 */
export function computeRecoveryEfficiency(
  index: RecoveryEffectivenessIndex,
): number {
  const totalAttempts = index.strategies.reduce((sum, s) => sum + s.attempts, 0);
  if (totalAttempts === 0) return 1; // no recovery needed = perfect

  const weightedSuccess = index.strategies.reduce((sum, s) => {
    // Weight inversely by duration: fast successful recoveries are worth more
    const durationWeight = s.meanDurationMs > 0 ? 1000 / (1000 + s.meanDurationMs) : 1;
    return sum + s.successes * durationWeight;
  }, 0);

  const weightedTotal = index.strategies.reduce((sum, s) => {
    const durationWeight = s.meanDurationMs > 0 ? 1000 / (1000 + s.meanDurationMs) : 1;
    return sum + s.attempts * durationWeight;
  }, 0);

  return weightedTotal > 0 ? weightedSuccess / weightedTotal : 1;
}

// ─── ObservationCollapse instance ──────────────────────────────────────────

import type { ObservationCollapse } from '../../domain/kernel/observation-collapse';

export const recoveryEffectivenessCollapse: ObservationCollapse<
  StepExecutionReceipt,
  RecoveryAttempt,
  RecoveryEffectivenessIndex,
  number
> = {
  extract: extractRecoveryAttempts,
  aggregate: (attempts, prior) => mergeEffectiveness(prior, attempts),
  signal: computeRecoveryEfficiency,
};

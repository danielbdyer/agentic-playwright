/**
 * Recovery Strategy Effectiveness — Law Tests
 *
 * Invariants:
 *  1. extractRecoveryAttempts only includes steps with non-none failure family
 *  2. aggregateEffectiveness groups by (strategyId, family)
 *  3. successRate is in [0, 1]
 *  4. mergeEffectiveness from null creates fresh index
 *  5. mergeEffectiveness combines attempt counts correctly
 *  6. rankStrategiesForFamily orders by success rate descending
 *  7. rankStrategiesForFamily filters to requested family only
 *  8. computeRecoveryEfficiency returns 1 when no recovery needed
 *  9. computeRecoveryEfficiency is in [0, 1]
 * 10. aggregateEffectiveness handles empty input
 */

import { expect, test } from '@playwright/test';
import {
  extractRecoveryAttempts,
  aggregateEffectiveness,
  mergeEffectiveness,
  rankStrategiesForFamily,
  computeRecoveryEfficiency,
  type RecoveryEffectivenessIndex,
} from '../lib/application/learning/recovery-effectiveness';
import type { RecoveryAttempt } from '../lib/domain/execution/recovery-policy';
import type { StepExecutionReceipt } from '../lib/domain/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockStepWithRecovery(family: string, attempts: Partial<RecoveryAttempt>[]): StepExecutionReceipt {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: { adoId: '10001', runId: 'run-1' },
    fingerprints: { task: 'fp', knowledge: 'kfp' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: { status: 'approved' },
    stepIndex: 0,
    taskFingerprint: 'fp',
    knowledgeFingerprint: 'kfp',
    runAt: new Date().toISOString(),
    mode: 'default',
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 0, resolutionMs: 0, actionMs: 0, assertionMs: 0, retriesMs: 0, teardownMs: 0, totalMs: 100 },
    cost: { instructionCount: 1, diagnosticCount: 0 },
    budget: { thresholds: {}, status: 'not-configured', breaches: [] },
    failure: { family },
    recovery: {
      policyProfile: 'default',
      attempts: attempts.map((a) => ({
        strategyId: a.strategyId ?? 'bounded-retry-with-backoff',
        family: a.family ?? family,
        attempt: a.attempt ?? 1,
        startedAt: new Date().toISOString(),
        durationMs: a.durationMs ?? 100,
        result: a.result ?? 'failed',
        diagnostics: a.diagnostics ?? [],
      })),
    },
    handshakes: [],
    execution: { status: 'failed', diagnostics: [], consoleMessages: [] },
  } as unknown as StepExecutionReceipt;
}

function mockAttempt(overrides?: Partial<RecoveryAttempt>): RecoveryAttempt {
  return {
    strategyId: overrides?.strategyId ?? 'bounded-retry-with-backoff',
    family: overrides?.family ?? 'environment-runtime-failure',
    attempt: overrides?.attempt ?? 1,
    startedAt: new Date().toISOString(),
    durationMs: overrides?.durationMs ?? 100,
    result: overrides?.result ?? 'recovered',
    diagnostics: overrides?.diagnostics ?? [],
  };
}

// ─── Law 1: extractRecoveryAttempts filters by family ───────────────────────

test('Law 1: extractRecoveryAttempts only includes steps with non-none failure', () => {
  const noFailure = mockStepWithRecovery('none', []);
  const withFailure = mockStepWithRecovery('environment-runtime-failure', [
    { strategyId: 'bounded-retry-with-backoff', result: 'recovered' },
  ]);
  const attempts = extractRecoveryAttempts([noFailure, withFailure]);
  expect(attempts).toHaveLength(1);
  expect(attempts[0]!.strategyId).toBe('bounded-retry-with-backoff');
});

// ─── Law 2: aggregateEffectiveness groups correctly ─────────────────────────

test('Law 2: aggregateEffectiveness groups by (strategyId, family)', () => {
  const attempts = [
    mockAttempt({ strategyId: 'bounded-retry-with-backoff', family: 'environment-runtime-failure', result: 'recovered' }),
    mockAttempt({ strategyId: 'bounded-retry-with-backoff', family: 'environment-runtime-failure', result: 'failed' }),
    mockAttempt({ strategyId: 'force-alternate-locator-rungs', family: 'locator-degradation-failure', result: 'recovered' }),
  ];
  const agg = aggregateEffectiveness(attempts);
  expect(agg).toHaveLength(2); // Two distinct (strategy, family) pairs
  const retryGroup = agg.find((a) => a.strategyId === 'bounded-retry-with-backoff');
  expect(retryGroup!.attempts).toBe(2);
  expect(retryGroup!.successes).toBe(1);
  expect(retryGroup!.failures).toBe(1);
});

// ─── Law 3: successRate bounds ──────────────────────────────────────────────

test('Law 3: successRate is in [0, 1]', () => {
  const attempts = [
    mockAttempt({ result: 'recovered' }),
    mockAttempt({ result: 'failed' }),
    mockAttempt({ result: 'skipped' }),
  ];
  const agg = aggregateEffectiveness(attempts);
  for (const s of agg) {
    expect(s.successRate).toBeGreaterThanOrEqual(0);
    expect(s.successRate).toBeLessThanOrEqual(1);
  }
});

// ─── Law 4: mergeEffectiveness from null ────────────────────────────────────

test('Law 4: mergeEffectiveness from null creates fresh index', () => {
  const attempts = [mockAttempt({ result: 'recovered' })];
  const index = mergeEffectiveness(null, attempts);
  expect(index.kind).toBe('recovery-effectiveness-index');
  expect(index.version).toBe(1);
  expect(index.strategies).toHaveLength(1);
  expect(index.strategies[0]!.successes).toBe(1);
});

// ─── Law 5: mergeEffectiveness combines counts ──────────────────────────────

test('Law 5: mergeEffectiveness combines attempt counts correctly', () => {
  const index1 = mergeEffectiveness(null, [
    mockAttempt({ result: 'recovered' }),
    mockAttempt({ result: 'failed' }),
  ]);
  const index2 = mergeEffectiveness(index1, [
    mockAttempt({ result: 'recovered' }),
  ]);
  expect(index2.strategies[0]!.attempts).toBe(3);
  expect(index2.strategies[0]!.successes).toBe(2);
  expect(index2.strategies[0]!.failures).toBe(1);
});

// ─── Law 6: rankStrategiesForFamily orders by success rate ──────────────────

test('Law 6: rankStrategiesForFamily orders by success rate descending', () => {
  const index: RecoveryEffectivenessIndex = {
    kind: 'recovery-effectiveness-index',
    version: 1,
    strategies: [
      { strategyId: 'bounded-retry-with-backoff', family: 'environment-runtime-failure', attempts: 10, successes: 3, failures: 7, skips: 0, successRate: 0.3, meanDurationMs: 200 },
      { strategyId: 'refresh-runtime', family: 'environment-runtime-failure', attempts: 10, successes: 8, failures: 2, skips: 0, successRate: 0.8, meanDurationMs: 100 },
    ],
    updatedAt: new Date().toISOString(),
  };
  const ranked = rankStrategiesForFamily(index, 'environment-runtime-failure');
  expect(ranked[0]).toBe('refresh-runtime'); // higher success rate
  expect(ranked[1]).toBe('bounded-retry-with-backoff');
});

// ─── Law 7: rankStrategiesForFamily filters to family ───────────────────────

test('Law 7: rankStrategiesForFamily only returns strategies for requested family', () => {
  const index: RecoveryEffectivenessIndex = {
    kind: 'recovery-effectiveness-index',
    version: 1,
    strategies: [
      { strategyId: 'bounded-retry-with-backoff', family: 'environment-runtime-failure', attempts: 10, successes: 5, failures: 5, skips: 0, successRate: 0.5, meanDurationMs: 200 },
      { strategyId: 'force-alternate-locator-rungs', family: 'locator-degradation-failure', attempts: 10, successes: 8, failures: 2, skips: 0, successRate: 0.8, meanDurationMs: 50 },
    ],
    updatedAt: new Date().toISOString(),
  };
  const ranked = rankStrategiesForFamily(index, 'environment-runtime-failure');
  expect(ranked).toHaveLength(1);
  expect(ranked[0]).toBe('bounded-retry-with-backoff');
});

// ─── Law 8: computeRecoveryEfficiency returns 1 when empty ──────────────────

test('Law 8: computeRecoveryEfficiency returns 1 when no recovery attempts', () => {
  const index: RecoveryEffectivenessIndex = {
    kind: 'recovery-effectiveness-index',
    version: 1,
    strategies: [],
    updatedAt: new Date().toISOString(),
  };
  expect(computeRecoveryEfficiency(index)).toBe(1);
});

// ─── Law 9: computeRecoveryEfficiency bounds ────────────────────────────────

test('Law 9: computeRecoveryEfficiency is in [0, 1]', () => {
  const index: RecoveryEffectivenessIndex = {
    kind: 'recovery-effectiveness-index',
    version: 1,
    strategies: [
      { strategyId: 'bounded-retry-with-backoff', family: 'environment-runtime-failure', attempts: 10, successes: 5, failures: 5, skips: 0, successRate: 0.5, meanDurationMs: 200 },
    ],
    updatedAt: new Date().toISOString(),
  };
  const efficiency = computeRecoveryEfficiency(index);
  expect(efficiency).toBeGreaterThanOrEqual(0);
  expect(efficiency).toBeLessThanOrEqual(1);
});

// ─── Law 10: aggregateEffectiveness handles empty ───────────────────────────

test('Law 10: aggregateEffectiveness returns empty array for empty input', () => {
  expect(aggregateEffectiveness([])).toHaveLength(0);
});

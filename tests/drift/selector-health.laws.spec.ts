/**
 * Selector Health — Law Tests
 *
 * Invariants:
 *  1. extractSelectorObservations only includes steps with locator strategy
 *  2. computeFlakiness is in [0, 1]
 *  3. computeFlakiness is 0 for uniform sequences
 *  4. computeFlakiness is 1 for perfectly alternating sequences
 *  5. computeTrend returns 'stable' below minimum observations
 *  6. buildSelectorHealth groups by selectorRef
 *  7. mergeHealthIndex from null creates fresh index
 *  8. mergeHealthIndex preserves existing selectors
 *  9. flagProblematicSelectors identifies degrading selectors
 * 10. successRate is in [0, 1]
 */

import { expect, test } from '@playwright/test';
import {
  extractSelectorObservations,
  computeFlakiness,
  computeTrend,
  buildSelectorHealth,
  mergeHealthIndex,
  flagProblematicSelectors,
  type SelectorObservation,
  type SelectorHealthIndex,
} from '../../product/application/drift/selector-health';
import type { StepExecutionReceipt } from '../../product/domain/execution/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockStep(opts: { locatorStrategy?: string; locatorRung?: number; failed?: boolean }): StepExecutionReceipt {
  return {
    version: 1, stage: 'execution', scope: 'step',
    ids: { adoId: '10001', runId: 'run-1' },
    fingerprints: { task: 'fp', knowledge: 'kfp' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: { status: 'approved' },
    stepIndex: 0, taskFingerprint: 'fp', knowledgeFingerprint: 'kfp',
    runAt: new Date().toISOString(), mode: 'default',
    locatorStrategy: opts.locatorStrategy ?? null,
    locatorRung: opts.locatorRung ?? null,
    degraded: false, preconditionFailures: [], durationMs: 100,
    timing: { setupMs: 0, resolutionMs: 0, actionMs: 0, assertionMs: 0, retriesMs: 0, teardownMs: 0, totalMs: 100 },
    cost: { instructionCount: 1, diagnosticCount: 0 },
    budget: { thresholds: {}, status: 'not-configured', breaches: [] },
    failure: { family: opts.failed ? 'locator-degradation-failure' : 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [], execution: { status: opts.failed ? 'failed' : 'passed', diagnostics: [], consoleMessages: [] },
  } as unknown as StepExecutionReceipt;
}

function obs(selectorRef: string, success: boolean, index: number): SelectorObservation {
  return { selectorRef, success, rung: 1, degraded: false, runAt: `2024-01-01T00:00:${String(index).padStart(2, '0')}Z` };
}

// ─── Law 1 ──────────────────────────────────────────────────────────────────

test('Law 1: extractSelectorObservations only includes steps with locator strategy', () => {
  const withStrategy = mockStep({ locatorStrategy: 'getByTestId', locatorRung: 1 });
  const withoutStrategy = mockStep({});
  const observations = extractSelectorObservations([withStrategy, withoutStrategy]);
  expect(observations).toHaveLength(1);
});

// ─── Law 2 ──────────────────────────────────────────────────────────────────

test('Law 2: computeFlakiness is in [0, 1]', () => {
  expect(computeFlakiness([true, false, true, false])).toBeGreaterThanOrEqual(0);
  expect(computeFlakiness([true, false, true, false])).toBeLessThanOrEqual(1);
  expect(computeFlakiness([])).toBe(0);
  expect(computeFlakiness([true])).toBe(0);
});

// ─── Law 3 ──────────────────────────────────────────────────────────────────

test('Law 3: computeFlakiness is 0 for uniform sequences', () => {
  expect(computeFlakiness([true, true, true, true])).toBe(0);
  expect(computeFlakiness([false, false, false])).toBe(0);
});

// ─── Law 4 ──────────────────────────────────────────────────────────────────

test('Law 4: computeFlakiness is 1 for perfectly alternating sequences', () => {
  expect(computeFlakiness([true, false, true, false, true])).toBe(1);
  expect(computeFlakiness([false, true, false, true])).toBe(1);
});

// ─── Law 5 ──────────────────────────────────────────────────────────────────

test('Law 5: computeTrend returns stable below minimum observations', () => {
  expect(computeTrend([true, false], 5)).toBe('stable');
  expect(computeTrend([], 5)).toBe('stable');
});

// ─── Law 6 ──────────────────────────────────────────────────────────────────

test('Law 6: buildSelectorHealth groups by selectorRef', () => {
  const observations = [
    obs('sel-a', true, 1), obs('sel-a', true, 2),
    obs('sel-b', false, 1), obs('sel-b', true, 2),
  ];
  const health = buildSelectorHealth(observations);
  expect(health).toHaveLength(2);
  expect(health.find((h) => h.selectorRef === 'sel-a')!.successRate).toBe(1);
  expect(health.find((h) => h.selectorRef === 'sel-b')!.successRate).toBe(0.5);
});

// ─── Law 7 ──────────────────────────────────────────────────────────────────

test('Law 7: mergeHealthIndex from null creates fresh index', () => {
  const observations = [obs('sel-a', true, 1)];
  const index = mergeHealthIndex(null, observations);
  expect(index.kind).toBe('selector-health-index');
  expect(index.selectors).toHaveLength(1);
});

// ─── Law 8 ──────────────────────────────────────────────────────────────────

test('Law 8: mergeHealthIndex preserves existing selectors', () => {
  const index1 = mergeHealthIndex(null, [obs('sel-a', true, 1)]);
  const index2 = mergeHealthIndex(index1, [obs('sel-b', true, 1)]);
  const refs = index2.selectors.map((s) => s.selectorRef);
  expect(refs).toContain('sel-a');
  expect(refs).toContain('sel-b');
});

// ─── Law 9 ──────────────────────────────────────────────────────────────────

test('Law 9: flagProblematicSelectors identifies degrading selectors', () => {
  const index: SelectorHealthIndex = {
    kind: 'selector-health-index', version: 1, updatedAt: new Date().toISOString(),
    selectors: [
      { selectorRef: 'healthy', successRate: 0.95, flakiness: 0, trend: 'stable', totalAttempts: 20, recentSuccesses: 19, recentFailures: 1 },
      { selectorRef: 'degrading', successRate: 0.3, flakiness: 0.5, trend: 'degrading', totalAttempts: 20, recentSuccesses: 6, recentFailures: 14 },
    ],
  };
  const problematic = flagProblematicSelectors(index);
  expect(problematic).toHaveLength(1);
  expect(problematic[0]!.selectorRef).toBe('degrading');
});

// ─── Law 10 ─────────────────────────────────────────────────────────────────

test('Law 10: successRate is in [0, 1]', () => {
  const observations = [obs('sel', true, 1), obs('sel', false, 2), obs('sel', true, 3)];
  const health = buildSelectorHealth(observations);
  for (const h of health) {
    expect(h.successRate).toBeGreaterThanOrEqual(0);
    expect(h.successRate).toBeLessThanOrEqual(1);
  }
});

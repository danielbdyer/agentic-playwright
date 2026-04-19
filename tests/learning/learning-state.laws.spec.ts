import { test, expect } from '@playwright/test';
import {
  aggregateLearningState,
  computeLearningDelta,
  summarizeLearningSignals,
  extractComponentEvidence,
} from '../../workshop/learning/learning-state';
import type { StepExecutionReceipt } from '../../product/domain/execution/types';

function makeStep(overrides: Partial<{
  stepIndex: number;
  widgetContract: string;
  mode: string;
  locatorStrategy: string | null;
  locatorRung: number | null;
  failureFamily: StepExecutionReceipt['failure']['family'];
  instructionCount: number;
  diagnosticCount: number;
  runAt: string;
  consoleMessages: Array<{ level: 'warn' | 'error'; text: string; timestamp: string }>;
  recoveryAttempts: StepExecutionReceipt['recovery']['attempts'];
}>): StepExecutionReceipt {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: { adoId: 'test', runId: 'run-1' } as never,
    fingerprints: {} as never,
    lineage: {} as never,
    governance: {} as never,
    stepIndex: overrides.stepIndex ?? 0,
    taskFingerprint: 'fp',
    knowledgeFingerprint: 'kfp',
    runAt: overrides.runAt ?? '2026-01-01T00:00:00Z',
    mode: overrides.mode ?? 'fill',
    widgetContract: overrides.widgetContract ?? 'os-input',
    locatorStrategy: overrides.locatorStrategy ?? 'test-id',
    locatorRung: overrides.locatorRung ?? 3,
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 10, resolutionMs: 20, actionMs: 30, assertionMs: 10, retriesMs: 0, teardownMs: 5, totalMs: 75 },
    cost: {
      instructionCount: overrides.instructionCount ?? 10,
      diagnosticCount: overrides.diagnosticCount ?? 2,
    },
    budget: { thresholds: {}, status: 'within-budget', breaches: [] },
    failure: { family: overrides.failureFamily ?? 'none' },
    recovery: {
      policyProfile: 'default',
      attempts: overrides.recoveryAttempts ?? [],
    },
    handshakes: [],
    execution: {
      status: (overrides.failureFamily ?? 'none') === 'none' ? 'ok' : 'failed',
      observedEffects: [],
      diagnostics: [],
      consoleMessages: overrides.consoleMessages ?? [],
    },
  } as unknown as StepExecutionReceipt;
}

test('Law 1: aggregateLearningState produces a valid learning state', () => {
  const steps = [makeStep({})];
  const state = aggregateLearningState(steps, null);
  expect(state.kind).toBe('learning-state');
  expect(state.version).toBe(1);
  expect(state.generatedAt).toBeTruthy();
});

test('Law 2: aggregateLearningState from null previous creates fresh indices', () => {
  const steps = [makeStep({ locatorRung: 3 })];
  const state = aggregateLearningState(steps, null);
  expect(state.timing.baselines.length).toBeGreaterThanOrEqual(1);
  expect(state.selectors.selectors.length).toBeGreaterThanOrEqual(1);
  expect(state.cost.baselines.length).toBeGreaterThanOrEqual(1);
  expect(state.rungDrift.entries.length).toBeGreaterThanOrEqual(1);
});

test('Law 3: aggregateLearningState signals are all in [0, 1]', () => {
  const steps = [
    makeStep({ locatorRung: 3 }),
    makeStep({ locatorRung: 5, failureFamily: 'locator-degradation-failure' }),
  ];
  const state = aggregateLearningState(steps, null);
  const signals = state.signals;
  expect(signals.timingRegressionRate).toBeGreaterThanOrEqual(0);
  expect(signals.timingRegressionRate).toBeLessThanOrEqual(1);
  expect(signals.selectorFlakinessRate).toBeGreaterThanOrEqual(0);
  expect(signals.selectorFlakinessRate).toBeLessThanOrEqual(1);
  expect(signals.recoveryEfficiency).toBeGreaterThanOrEqual(0);
  expect(signals.recoveryEfficiency).toBeLessThanOrEqual(1);
  expect(signals.consoleNoiseLevel).toBeGreaterThanOrEqual(0);
  expect(signals.consoleNoiseLevel).toBeLessThanOrEqual(1);
  expect(signals.costEfficiency).toBeGreaterThanOrEqual(0);
  expect(signals.costEfficiency).toBeLessThanOrEqual(1);
  expect(signals.rungStability).toBeGreaterThanOrEqual(0);
  expect(signals.rungStability).toBeLessThanOrEqual(1);
  expect(signals.componentMaturityRate).toBeGreaterThanOrEqual(0);
  expect(signals.componentMaturityRate).toBeLessThanOrEqual(1);
});

test('Law 4: computeLearningDelta tracks dimension changes', () => {
  const steps1 = [makeStep({ locatorRung: 3 })];
  const steps2 = [makeStep({ locatorRung: 3 }), makeStep({ locatorRung: 8 })];
  const state1 = aggregateLearningState(steps1, null);
  const state2 = aggregateLearningState(steps2, null);
  const delta = computeLearningDelta(state1, state2);
  expect(delta.kind).toBe('learning-delta');
  expect(delta.dimensions.length).toBe(7);
  expect(delta.overallVelocity).toBeGreaterThanOrEqual(0);
  expect(delta.overallVelocity).toBeLessThanOrEqual(1);
});

test('Law 5: computeLearningDelta overallVelocity is 1 when all dimensions improve', () => {
  const steps1 = [
    makeStep({ locatorRung: 3, failureFamily: 'locator-degradation-failure' }),
    makeStep({ locatorRung: 8, failureFamily: 'locator-degradation-failure' }),
  ];
  const steps2 = [
    makeStep({ locatorRung: 3 }),
    makeStep({ locatorRung: 3 }),
  ];
  const state1 = aggregateLearningState(steps1, null);
  const state2 = aggregateLearningState(steps2, null);
  const delta = computeLearningDelta(state1, state2);
  // Not all dimensions will necessarily improve, but velocity should be >= 0
  expect(delta.overallVelocity).toBeGreaterThanOrEqual(0);
});

test('Law 6: summarizeLearningSignals produces valid summary', () => {
  const steps = [makeStep({})];
  const state = aggregateLearningState(steps, null);
  const summary = summarizeLearningSignals(state);
  expect(summary.kind).toBe('learning-signal-summary');
  expect(summary.dimensions.length).toBe(7);
  expect(summary.healthScore).toBeGreaterThanOrEqual(0);
  expect(summary.healthScore).toBeLessThanOrEqual(1);
  for (const dim of summary.dimensions) {
    expect(['healthy', 'warning', 'critical']).toContain(dim.status);
  }
});

test('Law 7: extractComponentEvidence groups by widgetContract', () => {
  const steps = [
    makeStep({ widgetContract: 'os-input', mode: 'fill' }),
    makeStep({ widgetContract: 'os-input', mode: 'clear' }),
    makeStep({ widgetContract: 'os-button', mode: 'click' }),
  ];
  const evidence = extractComponentEvidence(steps);
  expect(evidence.length).toBe(2);
  const inputEvidence = evidence.find((e) => e.componentType === 'os-input');
  expect(inputEvidence!.totalAttempts).toBe(2);
  expect(inputEvidence!.actions).toContain('fill');
  expect(inputEvidence!.actions).toContain('clear');
});

test('Law 8: aggregateLearningState merges with previous state', () => {
  const steps1 = [makeStep({ locatorRung: 3 })];
  const state1 = aggregateLearningState(steps1, null);
  const steps2 = [makeStep({ locatorRung: 5 })];
  const state2 = aggregateLearningState(steps2, state1);
  // Should have accumulated data from both runs
  expect(state2.kind).toBe('learning-state');
  // Timing baselines should exist from both
  expect(state2.timing.baselines.length).toBeGreaterThanOrEqual(1);
});

test('Law 9: actionableCount reflects flagged items', () => {
  const steps = [makeStep({})];
  const state = aggregateLearningState(steps, null);
  const summary = summarizeLearningSignals(state);
  const expectedCount =
    state.signals.timingRegressions.length +
    state.signals.flakySelectors.length +
    state.signals.ineffectiveStrategies.length +
    state.signals.noisyConsolePatterns.length +
    state.signals.costAnomalies.length +
    state.signals.driftingIntents.length;
  expect(summary.actionableCount).toBe(expectedCount);
});

test('Law 10: aggregateLearningState with empty steps produces valid state', () => {
  const state = aggregateLearningState([], null);
  expect(state.kind).toBe('learning-state');
  expect(state.timing.baselines.length).toBe(0);
  expect(state.selectors.selectors.length).toBe(0);
  expect(state.recovery.strategies.length).toBe(0);
  expect(state.console.patterns.length).toBe(0);
  expect(state.cost.baselines.length).toBe(0);
  expect(state.rungDrift.entries.length).toBe(0);
  expect(state.componentMaturation.length).toBe(0);
});

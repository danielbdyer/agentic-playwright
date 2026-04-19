import { test, expect } from '@playwright/test';
import {
  normalizeConsolePattern,
  extractConsoleObservations,
  aggregateConsolePatterns,
  correlateConsoleWithFailures,
  flagNoisySteps,
} from '../../product/application/drift/console-intelligence';
import type { StepExecutionReceipt } from '../../product/domain/execution/types';

function makeStep(overrides: Partial<{
  stepIndex: number;
  failureFamily: StepExecutionReceipt['failure']['family'];
  consoleMessages: Array<{ level: 'warn' | 'error'; text: string; timestamp: string }>;
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
    runAt: '2026-01-01T00:00:00Z',
    mode: 'fill',
    widgetContract: 'os-input',
    locatorStrategy: null,
    locatorRung: null,
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 10, resolutionMs: 20, actionMs: 30, assertionMs: 10, retriesMs: 0, teardownMs: 5, totalMs: 75 },
    cost: { instructionCount: 5, diagnosticCount: 1 },
    budget: { thresholds: {}, status: 'within-budget', breaches: [] },
    failure: { family: overrides.failureFamily ?? 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [],
    execution: {
      status: (overrides.failureFamily ?? 'none') === 'none' ? 'ok' : 'failed',
      observedEffects: [],
      diagnostics: [],
      consoleMessages: overrides.consoleMessages ?? [],
    },
  } as unknown as StepExecutionReceipt;
}

test('Law 1: normalizeConsolePattern strips URLs', () => {
  const raw = 'Error at https://example.com/main.js:42:10 - something broke';
  const normalized = normalizeConsolePattern(raw);
  expect(normalized).not.toContain('https://');
  expect(normalized).toContain('<URL>');
});

test('Law 2: normalizeConsolePattern strips line:col numbers', () => {
  const raw = 'Error in file:123:45';
  const normalized = normalizeConsolePattern(raw);
  expect(normalized).toContain('<LINE>');
  expect(normalized).toContain('<COL>');
});

test('Law 3: extractConsoleObservations only includes steps with messages', () => {
  const steps = [
    makeStep({ stepIndex: 0, consoleMessages: [{ level: 'error', text: 'fail', timestamp: '2026-01-01T00:00:00Z' }] }),
    makeStep({ stepIndex: 1, consoleMessages: [] }),
    makeStep({ stepIndex: 2 }),
  ];
  const observations = extractConsoleObservations(steps);
  expect(observations.length).toBe(1);
  expect(observations[0]!.stepRef).toBe('step-0');
});

test('Law 4: aggregateConsolePatterns groups by normalized pattern', () => {
  const steps = [
    makeStep({ stepIndex: 0, consoleMessages: [
      { level: 'error', text: 'Error at https://a.com:1:1', timestamp: '2026-01-01T00:00:00Z' },
    ] }),
    makeStep({ stepIndex: 1, consoleMessages: [
      { level: 'error', text: 'Error at https://b.com:2:3', timestamp: '2026-01-01T00:00:01Z' },
    ] }),
  ];
  const obs = extractConsoleObservations(steps);
  const index = aggregateConsolePatterns(obs);
  // Both should normalize to same pattern
  expect(index.patterns.length).toBe(1);
  expect(index.patterns[0]!.occurrences).toBe(2);
  expect(index.patterns[0]!.affectedSteps).toBe(2);
});

test('Law 5: aggregateConsolePatterns returns empty for no observations', () => {
  const index = aggregateConsolePatterns([]);
  expect(index.patterns.length).toBe(0);
});

test('Law 6: correlateConsoleWithFailures computes correct failure correlation', () => {
  const steps = [
    makeStep({ stepIndex: 0, failureFamily: 'locator-degradation-failure', consoleMessages: [
      { level: 'error', text: 'DOM error', timestamp: '2026-01-01T00:00:00Z' },
    ] }),
    makeStep({ stepIndex: 1, failureFamily: 'none', consoleMessages: [
      { level: 'error', text: 'DOM error', timestamp: '2026-01-01T00:00:01Z' },
    ] }),
  ];
  const obs = extractConsoleObservations(steps);
  const correlations = correlateConsoleWithFailures(obs);
  expect(correlations.length).toBe(1);
  expect(correlations[0]!.correlation).toBe(0.5); // 1 failed out of 2 steps
});

test('Law 7: correlateConsoleWithFailures returns 1.0 when all steps with pattern fail', () => {
  const steps = [
    makeStep({ stepIndex: 0, failureFamily: 'environment-runtime-failure', consoleMessages: [
      { level: 'error', text: 'crash', timestamp: '2026-01-01T00:00:00Z' },
    ] }),
    makeStep({ stepIndex: 1, failureFamily: 'precondition-failure', consoleMessages: [
      { level: 'error', text: 'crash', timestamp: '2026-01-01T00:00:01Z' },
    ] }),
  ];
  const obs = extractConsoleObservations(steps);
  const correlations = correlateConsoleWithFailures(obs);
  expect(correlations[0]!.correlation).toBe(1.0);
});

test('Law 8: flagNoisySteps identifies steps with many distinct patterns', () => {
  const messages = Array.from({ length: 8 }, (_, i) => ({
    level: 'error' as const,
    text: `Unique error ${i}`,
    timestamp: '2026-01-01T00:00:00Z',
  }));
  const steps = [makeStep({ stepIndex: 0, consoleMessages: messages })];
  const obs = extractConsoleObservations(steps);
  const index = aggregateConsolePatterns(obs);
  const report = flagNoisySteps(index, obs, { noiseThreshold: 5 });
  expect(report.noisySteps.length).toBe(1);
  expect(report.noisySteps[0]!.distinctPatterns).toBe(8);
  expect(report.noiseRate).toBe(1);
});

test('Law 9: flagNoisySteps returns empty for quiet steps', () => {
  const steps = [makeStep({ stepIndex: 0, consoleMessages: [
    { level: 'error', text: 'one error', timestamp: '2026-01-01T00:00:00Z' },
  ] })];
  const obs = extractConsoleObservations(steps);
  const index = aggregateConsolePatterns(obs);
  const report = flagNoisySteps(index, obs, { noiseThreshold: 5 });
  expect(report.noisySteps.length).toBe(0);
  expect(report.noiseRate).toBe(0);
});

test('Law 10: failureCorrelation is in [0, 1]', () => {
  const steps = [
    makeStep({ stepIndex: 0, failureFamily: 'none', consoleMessages: [
      { level: 'error', text: 'err', timestamp: '2026-01-01T00:00:00Z' },
    ] }),
    makeStep({ stepIndex: 1, failureFamily: 'locator-degradation-failure', consoleMessages: [
      { level: 'warn', text: 'warn', timestamp: '2026-01-01T00:00:01Z' },
    ] }),
  ];
  const obs = extractConsoleObservations(steps);
  const index = aggregateConsolePatterns(obs);
  for (const pattern of index.patterns) {
    expect(pattern.failureCorrelation).toBeGreaterThanOrEqual(0);
    expect(pattern.failureCorrelation).toBeLessThanOrEqual(1);
  }
});

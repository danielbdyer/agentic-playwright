import { test, expect } from '@playwright/test';
import {
  intentRef,
  extractRungObservations,
  mode,
  buildRungHistory,
  detectRungDrift,
  computeRungStability,
} from '../lib/application/rung-drift';
import type { StepExecutionReceipt } from '../lib/domain/types';

function makeStep(overrides: Partial<{
  widgetContract: string;
  mode: string;
  locatorRung: number | null;
  runAt: string;
  failureFamily: StepExecutionReceipt['failure']['family'];
}>): StepExecutionReceipt {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: { adoId: 'test', runId: 'run-1' } as never,
    fingerprints: {} as never,
    lineage: {} as never,
    governance: {} as never,
    stepIndex: 0,
    taskFingerprint: 'fp',
    knowledgeFingerprint: 'kfp',
    runAt: overrides.runAt ?? '2026-01-01T00:00:00Z',
    mode: overrides.mode ?? 'fill',
    widgetContract: overrides.widgetContract ?? 'os-input',
    locatorStrategy: 'test-id',
    locatorRung: overrides.locatorRung ?? null,
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 10, resolutionMs: 20, actionMs: 30, assertionMs: 10, retriesMs: 0, teardownMs: 5, totalMs: 75 },
    cost: { instructionCount: 5, diagnosticCount: 1 },
    budget: { thresholds: {}, status: 'within-budget', breaches: [] },
    failure: { family: overrides.failureFamily ?? 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [],
    execution: { status: 'ok', observedEffects: [], diagnostics: [] },
  } as unknown as StepExecutionReceipt;
}

test('Law 1: intentRef is deterministic', () => {
  const step = makeStep({ widgetContract: 'os-button', mode: 'click' });
  expect(intentRef(step)).toBe('os-button:click');
  expect(intentRef(step)).toBe(intentRef(step));
});

test('Law 2: extractRungObservations only includes steps with locatorRung', () => {
  const steps = [
    makeStep({ locatorRung: 3 }),
    makeStep({ locatorRung: null }),
    makeStep({ locatorRung: 8 }),
  ];
  const obs = extractRungObservations(steps);
  expect(obs.length).toBe(2);
});

test('Law 3: mode returns the most frequent value', () => {
  expect(mode([3, 3, 8, 8, 3])).toBe(3);
  expect(mode([8, 8, 3])).toBe(8);
});

test('Law 4: mode returns lowest value on tie', () => {
  expect(mode([3, 8])).toBe(3);
  expect(mode([5, 2])).toBe(2);
});

test('Law 5: buildRungHistory groups by intentRef', () => {
  const steps = [
    makeStep({ widgetContract: 'os-input', mode: 'fill', locatorRung: 3, runAt: '2026-01-01T00:00:00Z' }),
    makeStep({ widgetContract: 'os-input', mode: 'fill', locatorRung: 3, runAt: '2026-01-01T00:00:01Z' }),
    makeStep({ widgetContract: 'os-button', mode: 'click', locatorRung: 5, runAt: '2026-01-01T00:00:02Z' }),
  ];
  const obs = extractRungObservations(steps);
  const history = buildRungHistory(obs);
  expect(history.entries.length).toBe(2);
  const inputEntry = history.entries.find((e) => e.intentRef === 'os-input:fill');
  expect(inputEntry!.rungHistory.length).toBe(2);
});

test('Law 6: detectRungDrift flags degrading intents', () => {
  // Start at rung 3, drift to rung 8
  const steps = [
    makeStep({ locatorRung: 3, runAt: '2026-01-01T00:00:00Z' }),
    makeStep({ locatorRung: 3, runAt: '2026-01-01T00:00:01Z' }),
    makeStep({ locatorRung: 3, runAt: '2026-01-01T00:00:02Z' }),
    makeStep({ locatorRung: 8, runAt: '2026-01-01T00:00:03Z' }),
    makeStep({ locatorRung: 8, runAt: '2026-01-01T00:00:04Z' }),
    makeStep({ locatorRung: 8, runAt: '2026-01-01T00:00:05Z' }),
  ];
  const obs = extractRungObservations(steps);
  const history = buildRungHistory(obs);
  const report = detectRungDrift(history);
  expect(report.drifts.length).toBe(1);
  expect(report.drifts[0]!.delta).toBeGreaterThan(0);
});

test('Law 7: detectRungDrift returns empty for stable intents', () => {
  const steps = Array.from({ length: 6 }, (_, i) =>
    makeStep({ locatorRung: 3, runAt: `2026-01-01T00:00:0${i}Z` }),
  );
  const obs = extractRungObservations(steps);
  const history = buildRungHistory(obs);
  const report = detectRungDrift(history);
  expect(report.drifts.length).toBe(0);
  expect(report.driftRate).toBe(0);
});

test('Law 8: computeRungStability returns 1 for all stable intents', () => {
  const steps = Array.from({ length: 6 }, (_, i) =>
    makeStep({ locatorRung: 3, runAt: `2026-01-01T00:00:0${i}Z` }),
  );
  const obs = extractRungObservations(steps);
  const history = buildRungHistory(obs);
  expect(computeRungStability(history)).toBe(1);
});

test('Law 9: computeRungStability returns 1 for empty history', () => {
  expect(computeRungStability({ entries: [] })).toBe(1);
});

test('Law 10: driftRate is in [0, 1]', () => {
  const steps = [
    // Intent A: stable at rung 3
    ...Array.from({ length: 4 }, (_, i) =>
      makeStep({ widgetContract: 'a', locatorRung: 3, runAt: `2026-01-01T00:00:0${i}Z` }),
    ),
    // Intent B: degrades from rung 2 to rung 9
    makeStep({ widgetContract: 'b', locatorRung: 2, runAt: '2026-01-01T00:00:00Z' }),
    makeStep({ widgetContract: 'b', locatorRung: 2, runAt: '2026-01-01T00:00:01Z' }),
    makeStep({ widgetContract: 'b', locatorRung: 9, runAt: '2026-01-01T00:00:02Z' }),
    makeStep({ widgetContract: 'b', locatorRung: 9, runAt: '2026-01-01T00:00:03Z' }),
  ];
  const obs = extractRungObservations(steps);
  const history = buildRungHistory(obs);
  const report = detectRungDrift(history);
  expect(report.driftRate).toBeGreaterThanOrEqual(0);
  expect(report.driftRate).toBeLessThanOrEqual(1);
});

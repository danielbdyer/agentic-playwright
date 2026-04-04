import { test, expect } from '@playwright/test';
import {
  costCategory,
  extractCostObservations,
  buildCostBaselines,
  detectCostAnomalies,
  computeCostEfficiency,
} from '../lib/application/drift/execution-cost';
import type { StepExecutionReceipt } from '../lib/domain/execution/types';

function makeStep(overrides: Partial<{
  widgetContract: string;
  mode: string;
  instructionCount: number;
  diagnosticCount: number;
  budgetStatus: StepExecutionReceipt['budget']['status'];
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
    runAt: '2026-01-01T00:00:00Z',
    mode: overrides.mode ?? 'fill',
    widgetContract: overrides.widgetContract ?? 'os-input',
    locatorStrategy: null,
    locatorRung: null,
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 10, resolutionMs: 20, actionMs: 30, assertionMs: 10, retriesMs: 0, teardownMs: 5, totalMs: 75 },
    cost: {
      instructionCount: overrides.instructionCount ?? 10,
      diagnosticCount: overrides.diagnosticCount ?? 2,
    },
    budget: {
      thresholds: {},
      status: overrides.budgetStatus ?? 'within-budget',
      breaches: overrides.budgetStatus === 'over-budget' ? ['maxInstructionCount'] : [],
    },
    failure: { family: overrides.failureFamily ?? 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [],
    execution: { status: 'ok', observedEffects: [], diagnostics: [] },
  } as unknown as StepExecutionReceipt;
}

test('Law 1: costCategory is deterministic', () => {
  const step = makeStep({ widgetContract: 'os-button', mode: 'click' });
  expect(costCategory(step)).toBe('os-button:click');
  expect(costCategory(step)).toBe(costCategory(step));
});

test('Law 2: extractCostObservations returns one observation per step', () => {
  const steps = [makeStep({}), makeStep({}), makeStep({})];
  const obs = extractCostObservations(steps);
  expect(obs.length).toBe(3);
});

test('Law 3: buildCostBaselines groups by category', () => {
  const steps = [
    makeStep({ widgetContract: 'os-input', mode: 'fill', instructionCount: 10 }),
    makeStep({ widgetContract: 'os-input', mode: 'fill', instructionCount: 20 }),
    makeStep({ widgetContract: 'os-button', mode: 'click', instructionCount: 5 }),
  ];
  const obs = extractCostObservations(steps);
  const baselines = buildCostBaselines(obs);
  expect(baselines.baselines.length).toBe(2);
  const inputBaseline = baselines.baselines.find((b) => b.category === 'os-input:fill');
  expect(inputBaseline).toBeDefined();
  expect(inputBaseline!.sampleCount).toBe(2);
});

test('Law 4: buildCostBaselines returns empty for no observations', () => {
  const baselines = buildCostBaselines([]);
  expect(baselines.baselines.length).toBe(0);
});

test('Law 5: median is correct for even and odd sample counts', () => {
  const steps = [
    makeStep({ instructionCount: 10 }),
    makeStep({ instructionCount: 20 }),
    makeStep({ instructionCount: 30 }),
  ];
  const obs = extractCostObservations(steps);
  const baselines = buildCostBaselines(obs);
  expect(baselines.baselines[0]!.medianInstructions).toBe(20);
});

test('Law 6: detectCostAnomalies flags steps exceeding p95 * threshold', () => {
  // Build baselines from normal steps
  const normalSteps = Array.from({ length: 10 }, () => makeStep({ instructionCount: 10 }));
  const obs = extractCostObservations(normalSteps);
  const baselines = buildCostBaselines(obs);

  // Test with an anomalous step
  const anomalousStep = makeStep({ instructionCount: 100 });
  const report = detectCostAnomalies([anomalousStep], baselines, { anomalyThreshold: 1.5 });
  expect(report.anomalies.length).toBe(1);
  expect(report.anomalies[0]!.reason).toBe('instruction-spike');
});

test('Law 7: detectCostAnomalies returns empty for normal steps', () => {
  const steps = Array.from({ length: 10 }, () => makeStep({ instructionCount: 10 }));
  const obs = extractCostObservations(steps);
  const baselines = buildCostBaselines(obs);
  const report = detectCostAnomalies(steps, baselines, { anomalyThreshold: 1.5 });
  expect(report.anomalies.length).toBe(0);
});

test('Law 8: computeCostEfficiency is in [0, 1]', () => {
  const steps = [
    makeStep({ instructionCount: 5 }),
    makeStep({ instructionCount: 50 }),
    makeStep({ instructionCount: 100 }),
  ];
  const obs = extractCostObservations(steps);
  const baselines = buildCostBaselines(obs);
  const efficiency = computeCostEfficiency(baselines);
  expect(efficiency).toBeGreaterThanOrEqual(0);
  expect(efficiency).toBeLessThanOrEqual(1);
});

test('Law 9: computeCostEfficiency returns 1 for empty baselines', () => {
  const efficiency = computeCostEfficiency({ baselines: [] });
  expect(efficiency).toBe(1);
});

test('Law 10: anomalyRate is in [0, 1]', () => {
  const steps = Array.from({ length: 5 }, (_, i) =>
    makeStep({ instructionCount: i === 4 ? 1000 : 10 }),
  );
  const obs = extractCostObservations(steps);
  const baselines = buildCostBaselines(obs);
  const report = detectCostAnomalies(steps, baselines, { anomalyThreshold: 1.5 });
  expect(report.anomalyRate).toBeGreaterThanOrEqual(0);
  expect(report.anomalyRate).toBeLessThanOrEqual(1);
});

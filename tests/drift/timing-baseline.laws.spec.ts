/**
 * Timing Baseline — Law Tests
 *
 * Invariants:
 *  1. median of sorted array is deterministic
 *  2. percentile bounds — p0 = min, p100 = max
 *  3. stddev is non-negative and zero for single-element arrays
 *  4. buildPhaseBaselines produces one entry per timing phase
 *  5. updateTimingBaselines creates baselines from empty state
 *  6. updateTimingBaselines merges without losing categories
 *  7. detectTimingRegressions flags steps exceeding p95 * threshold
 *  8. detectTimingRegressions reports no regressions when within budget
 *  9. regressionRate is in [0, 1]
 * 10. stepCategory is deterministic
 */

import { expect, test } from '@playwright/test';
import {
  median,
  percentile,
  stddev,
  buildPhaseBaselines,
  updateTimingBaselines,
  detectTimingRegressions,
  stepCategory,
  TIMING_PHASES,
  DEFAULT_TIMING_BASELINE_CONFIG,
  type TimingBaselineIndex,
  type TimingPhase,
} from '../../lib/application/drift/timing-baseline';
import type { StepExecutionReceipt } from '../../lib/domain/execution/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

function mockStep(overrides?: Partial<{
  stepIndex: number;
  widgetContract: string;
  mode: string;
  timing: Record<string, number>;
}>): StepExecutionReceipt {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: { adoId: '10001', runId: 'run-1' },
    fingerprints: { task: 'fp', knowledge: 'kfp' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: { status: 'approved' },
    stepIndex: overrides?.stepIndex ?? 0,
    taskFingerprint: 'fp',
    knowledgeFingerprint: 'kfp',
    runAt: new Date().toISOString(),
    mode: overrides?.mode ?? 'default',
    widgetContract: overrides?.widgetContract ?? 'os-button',
    degraded: false,
    preconditionFailures: [],
    durationMs: overrides?.timing?.totalMs ?? 100,
    timing: {
      setupMs: overrides?.timing?.setupMs ?? 10,
      resolutionMs: overrides?.timing?.resolutionMs ?? 20,
      actionMs: overrides?.timing?.actionMs ?? 30,
      assertionMs: overrides?.timing?.assertionMs ?? 25,
      retriesMs: overrides?.timing?.retriesMs ?? 5,
      teardownMs: overrides?.timing?.teardownMs ?? 10,
      totalMs: overrides?.timing?.totalMs ?? 100,
    },
    cost: { instructionCount: 1, diagnosticCount: 0 },
    budget: { thresholds: {}, status: 'not-configured', breaches: [] },
    failure: { family: 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [],
    execution: { status: 'passed', diagnostics: [], consoleMessages: [] },
  } as unknown as StepExecutionReceipt;
}

// ─── Law 1: median determinism ──────────────────────────────────────────────

test('Law 1: median is deterministic for same input', () => {
  const sorted = [1, 2, 3, 4, 5];
  expect(median(sorted)).toBe(3);
  expect(median(sorted)).toBe(3);

  const even = [1, 2, 3, 4];
  expect(median(even)).toBe(2.5);

  expect(median([])).toBe(0);
});

// ─── Law 2: percentile bounds ───────────────────────────────────────────────

test('Law 2: p0 = min, p100 = max for non-empty arrays', () => {
  const sorted = [10, 20, 30, 40, 50];
  expect(percentile(sorted, 0)).toBe(10);
  expect(percentile(sorted, 100)).toBe(50);
  expect(percentile(sorted, 50)).toBe(30);
  expect(percentile([], 50)).toBe(0);
});

// ─── Law 3: stddev non-negative ─────────────────────────────────────────────

test('Law 3: stddev is non-negative, zero for single-element', () => {
  expect(stddev([42])).toBe(0);
  expect(stddev([])).toBe(0);
  expect(stddev([1, 2, 3, 4, 5])).toBeGreaterThan(0);
});

// ─── Law 4: buildPhaseBaselines completeness ────────────────────────────────

test('Law 4: buildPhaseBaselines produces one entry per timing phase', () => {
  const samples = new Map<TimingPhase, readonly number[]>([
    ['setupMs', [10, 20, 30]],
    ['resolutionMs', [5, 10, 15]],
    ['actionMs', [20, 30, 40]],
    ['assertionMs', [15, 25, 35]],
    ['retriesMs', [0, 0, 5]],
    ['teardownMs', [5, 10, 15]],
    ['totalMs', [55, 95, 140]],
  ]);
  const baselines = buildPhaseBaselines(samples);
  expect(baselines).toHaveLength(TIMING_PHASES.length);
  for (const phase of TIMING_PHASES) {
    expect(baselines.find((b) => b.phase === phase)).toBeDefined();
  }
});

// ─── Law 5: updateTimingBaselines from empty ────────────────────────────────

test('Law 5: updateTimingBaselines creates baselines from empty state', () => {
  const steps = [mockStep({ widgetContract: 'os-button' }), mockStep({ widgetContract: 'os-input' })];
  const result = updateTimingBaselines(null, steps);

  expect(result.kind).toBe('timing-baseline-index');
  expect(result.version).toBe(1);
  expect(result.baselines.length).toBeGreaterThanOrEqual(1);
  expect(result.baselines.every((b) => b.phases.length === TIMING_PHASES.length)).toBe(true);
});

// ─── Law 6: merge preserves categories ──────────────────────────────────────

test('Law 6: updateTimingBaselines merges without losing categories', () => {
  const steps1 = [mockStep({ widgetContract: 'os-button' })];
  const index1 = updateTimingBaselines(null, steps1);

  const steps2 = [mockStep({ widgetContract: 'os-input' })];
  const index2 = updateTimingBaselines(index1, steps2);

  const categories = index2.baselines.map((b) => b.stepCategory);
  expect(categories).toContain('os-button:default');
  expect(categories).toContain('os-input:default');
});

// ─── Law 7: regression detection flags over-threshold ───────────────────────

test('Law 7: detectTimingRegressions flags steps exceeding p95 * threshold', () => {
  // Build baselines with known p95
  const normalSteps = Array.from({ length: 10 }, () => mockStep({ timing: { actionMs: 30, totalMs: 100, setupMs: 10, resolutionMs: 20, assertionMs: 25, retriesMs: 5, teardownMs: 10 } }));
  const baselines = updateTimingBaselines(null, normalSteps);

  // A step with 10x the normal action time
  const slowStep = mockStep({ timing: { actionMs: 500, totalMs: 600, setupMs: 10, resolutionMs: 20, assertionMs: 25, retriesMs: 5, teardownMs: 10 } });
  const report = detectTimingRegressions([slowStep], baselines);

  expect(report.regressions.length).toBeGreaterThan(0);
  expect(report.regressions.some((r) => r.phase === 'actionMs')).toBe(true);
  expect(report.regressions.some((r) => r.phase === 'totalMs')).toBe(true);
});

// ─── Law 8: no regressions within budget ────────────────────────────────────

test('Law 8: no regressions when steps are within normal range', () => {
  const normalSteps = Array.from({ length: 10 }, () => mockStep());
  const baselines = updateTimingBaselines(null, normalSteps);

  const report = detectTimingRegressions([mockStep()], baselines);
  expect(report.regressions).toHaveLength(0);
});

// ─── Law 9: regressionRate bounds ───────────────────────────────────────────

test('Law 9: regressionRate is in [0, 1]', () => {
  const baselines: TimingBaselineIndex = {
    kind: 'timing-baseline-index',
    version: 1,
    baselines: [],
    updatedAt: new Date().toISOString(),
  };
  const report = detectTimingRegressions([], baselines);
  expect(report.regressionRate).toBeGreaterThanOrEqual(0);
  expect(report.regressionRate).toBeLessThanOrEqual(1);
});

// ─── Law 10: stepCategory determinism ───────────────────────────────────────

test('Law 10: stepCategory is deterministic', () => {
  const step = mockStep({ widgetContract: 'os-button', mode: 'default' });
  expect(stepCategory(step)).toBe('os-button:default');
  expect(stepCategory(step)).toBe('os-button:default');
});

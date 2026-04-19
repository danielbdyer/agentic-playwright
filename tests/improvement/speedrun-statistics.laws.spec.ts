/**
 * Law-style tests for speedrun timing statistics and regression detection.
 *
 * Tests pure functions — no I/O, no mocks, deterministic assertions.
 */
import { test, expect } from '@playwright/test';
import {
  mean,
  standardDeviation,
  percentile,
  computePhaseBaseline,
  computeAllBaselines,
  deriveBudget,
  deriveAllBudgets,
  detectRegression,
  detectAllRegressions,
  extractTimingSamples,
  formatBaselineSummary,
  formatRegressionReport,
  DEFAULT_BUDGET_MULTIPLIERS,
  type PhaseTimingSample,
  type PhaseTimingBaseline,
} from '../../product/domain/projection/speedrun-statistics';

// ─── Core statistics laws ───

test('mean of empty array is 0', () => {
  expect(mean([])).toBe(0);
});

test('mean of single value is that value', () => {
  expect(mean([42])).toBe(42);
});

test('mean of symmetric values equals the center', () => {
  expect(mean([10, 20, 30])).toBe(20);
});

test('standard deviation of fewer than 2 values is 0', () => {
  expect(standardDeviation([])).toBe(0);
  expect(standardDeviation([42])).toBe(0);
});

test('standard deviation of identical values is 0', () => {
  expect(standardDeviation([5, 5, 5, 5])).toBe(0);
});

test('standard deviation of [2, 4, 4, 4, 5, 5, 7, 9] is approximately 2.14', () => {
  const sd = standardDeviation([2, 4, 4, 4, 5, 5, 7, 9]);
  expect(sd).toBeCloseTo(2.138, 2);
});

test('percentile of empty array is 0', () => {
  expect(percentile([], 99)).toBe(0);
});

test('p50 of sorted values returns the median', () => {
  expect(percentile([10, 20, 30, 40, 50], 50)).toBe(30);
});

test('p99 of 100 sequential values returns near-maximum', () => {
  const values = Array.from({ length: 100 }, (_, i) => i + 1);
  expect(percentile(values, 99)).toBe(99);
});

test('p99 of a single value returns that value', () => {
  expect(percentile([42], 99)).toBe(42);
});

// ─── Phase baseline laws ───

const makeSamples = (phase: string, durations: number[]): PhaseTimingSample[] =>
  durations.map((durationMs, i) => ({
    phase: phase as PhaseTimingSample['phase'],
    durationMs,
    seed: 'test-seed',
    wallClockMs: Date.now() + i * 1000,
  }));

test('baseline for a phase with no samples has zero counts', () => {
  const baseline = computePhaseBaseline('generate', []);
  expect(baseline.sampleCount).toBe(0);
  expect(baseline.meanMs).toBe(0);
  expect(baseline.stddevMs).toBe(0);
  expect(baseline.p99Ms).toBe(0);
});

test('baseline captures min and max correctly', () => {
  const samples = makeSamples('iterate', [100, 200, 300, 400, 500]);
  const baseline = computePhaseBaseline('iterate', samples);
  expect(baseline.minMs).toBe(100);
  expect(baseline.maxMs).toBe(500);
  expect(baseline.meanMs).toBe(300);
  expect(baseline.sampleCount).toBe(5);
});

test('baseline only includes samples for the requested phase', () => {
  const iterSamples = makeSamples('iterate', [100, 200, 300]);
  const genSamples = makeSamples('generate', [5000, 6000]);
  const allSamples = [...iterSamples, ...genSamples];

  const iterBaseline = computePhaseBaseline('iterate', allSamples);
  expect(iterBaseline.sampleCount).toBe(3);
  expect(iterBaseline.meanMs).toBe(200);

  const genBaseline = computePhaseBaseline('generate', allSamples);
  expect(genBaseline.sampleCount).toBe(2);
  expect(genBaseline.meanMs).toBe(5500);
});

test('computeAllBaselines returns only phases with samples', () => {
  const samples = makeSamples('iterate', [100, 200]);
  const baselines = computeAllBaselines(samples);
  expect(baselines.length).toBe(1);
  expect(baselines[0]!.phase).toBe('iterate');
});

// ─── Budget derivation laws ───

test('budget floor prevents unreasonably low timeouts', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'generate',
    sampleCount: 10,
    meanMs: 100,
    stddevMs: 10,
    p99Ms: 150,
    minMs: 80,
    maxMs: 200,
  };
  const budget = deriveBudget(baseline);
  // p99 + 3σ = 150 + 30 = 180, but floor is 10000
  expect(budget.timeoutMs).toBe(DEFAULT_BUDGET_MULTIPLIERS.floorMs);
  expect(budget.warningMs).toBe(DEFAULT_BUDGET_MULTIPLIERS.floorMs);
});

test('budget scales with p99 and stddev for slow phases', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'iterate',
    sampleCount: 20,
    meanMs: 60_000,
    stddevMs: 10_000,
    p99Ms: 90_000,
    minMs: 40_000,
    maxMs: 95_000,
  };
  const budget = deriveBudget(baseline);
  // warning = p99 + 1σ = 90000 + 10000 = 100000
  expect(budget.warningMs).toBe(100_000);
  // timeout = p99 + 3σ = 90000 + 30000 = 120000
  expect(budget.timeoutMs).toBe(120_000);
  expect(budget.expectedMs).toBe(60_000);
});

test('deriveAllBudgets produces one budget per baseline', () => {
  const baselines: PhaseTimingBaseline[] = [
    { phase: 'generate', sampleCount: 5, meanMs: 5000, stddevMs: 500, p99Ms: 6000, minMs: 4000, maxMs: 6500 },
    { phase: 'iterate', sampleCount: 5, meanMs: 30000, stddevMs: 5000, p99Ms: 45000, minMs: 20000, maxMs: 50000 },
  ];
  const budgets = deriveAllBudgets(baselines);
  expect(budgets.length).toBe(2);
  expect(budgets[0]!.phase).toBe('generate');
  expect(budgets[1]!.phase).toBe('iterate');
});

// ─── Regression detection laws ───

test('no regression when current timing is within baseline', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'iterate',
    sampleCount: 20,
    meanMs: 30_000,
    stddevMs: 5_000,
    p99Ms: 45_000,
    minMs: 20_000,
    maxMs: 50_000,
  };
  const signal = detectRegression(baseline, 32_000);
  expect(signal.severity).toBe('none');
  expect(signal.phase).toBe('iterate');
});

test('warning when current timing is 2σ above baseline', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'iterate',
    sampleCount: 20,
    meanMs: 30_000,
    stddevMs: 5_000,
    p99Ms: 45_000,
    minMs: 20_000,
    maxMs: 50_000,
  };
  // 30000 + 2.5 * 5000 = 42500
  const signal = detectRegression(baseline, 42_500);
  expect(signal.severity).toBe('warning');
  expect(signal.zScore).toBe(2.5);
});

test('regression when current timing is 3σ above baseline', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'iterate',
    sampleCount: 20,
    meanMs: 30_000,
    stddevMs: 5_000,
    p99Ms: 45_000,
    minMs: 20_000,
    maxMs: 50_000,
  };
  // 30000 + 4 * 5000 = 50000
  const signal = detectRegression(baseline, 50_000);
  expect(signal.severity).toBe('regression');
  expect(signal.zScore).toBe(4);
});

test('minimum delta prevents false positives on fast phases', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'fitness',
    sampleCount: 10,
    meanMs: 200,
    stddevMs: 50,
    p99Ms: 350,
    minMs: 100,
    maxMs: 400,
  };
  // 500ms is technically 6σ above, but delta is only 300ms < 1000ms minimum
  const signal = detectRegression(baseline, 500);
  expect(signal.severity).toBe('none');
});

test('detectAllRegressions processes multiple phases', () => {
  const baselines: PhaseTimingBaseline[] = [
    { phase: 'generate', sampleCount: 10, meanMs: 5000, stddevMs: 500, p99Ms: 6500, minMs: 4000, maxMs: 7000 },
    { phase: 'iterate', sampleCount: 10, meanMs: 30000, stddevMs: 5000, p99Ms: 45000, minMs: 20000, maxMs: 50000 },
  ];
  const currentTimings = new Map<'generate' | 'compile' | 'iterate' | 'fitness' | 'complete', number>([
    ['generate', 5200], // within baseline
    ['iterate', 50000], // 4σ above = regression
  ]);
  const signals = detectAllRegressions(baselines, currentTimings);
  expect(signals.length).toBe(2);
  expect(signals[0]!.severity).toBe('none');
  expect(signals[1]!.severity).toBe('regression');
});

test('zero stddev does not produce NaN z-scores', () => {
  const baseline: PhaseTimingBaseline = {
    phase: 'iterate',
    sampleCount: 5,
    meanMs: 30_000,
    stddevMs: 0,
    p99Ms: 30_000,
    minMs: 30_000,
    maxMs: 30_000,
  };
  const signal = detectRegression(baseline, 35_000);
  expect(signal.zScore).toBe(0);
  expect(Number.isNaN(signal.zScore)).toBe(false);
});

// ─── Sample extraction laws ───

test('extractTimingSamples filters out null durations', () => {
  const events = [
    { phase: 'generate' as const, phaseDurationMs: 5000, seed: 's1', wallClockMs: 1000 },
    { phase: 'iterate' as const, phaseDurationMs: null, seed: 's1', wallClockMs: 2000, iteration: 1 },
    { phase: 'iterate' as const, phaseDurationMs: 30000, seed: 's1', wallClockMs: 3000, iteration: 1 },
  ];
  const samples = extractTimingSamples(events);
  expect(samples.length).toBe(2);
  expect(samples[0]!.durationMs).toBe(5000);
  expect(samples[1]!.durationMs).toBe(30000);
});

// ─── Formatting laws ───

test('formatBaselineSummary includes all phases', () => {
  const baselines: PhaseTimingBaseline[] = [
    { phase: 'generate', sampleCount: 5, meanMs: 5000, stddevMs: 500, p99Ms: 6000, minMs: 4000, maxMs: 6500 },
    { phase: 'iterate', sampleCount: 5, meanMs: 30000, stddevMs: 5000, p99Ms: 45000, minMs: 20000, maxMs: 50000 },
  ];
  const summary = formatBaselineSummary(baselines);
  expect(summary).toContain('generate');
  expect(summary).toContain('iterate');
  expect(summary).toContain('n=5');
});

test('formatRegressionReport with no regressions', () => {
  const signals = [{ phase: 'iterate' as const, severity: 'none' as const, currentMs: 30000, baselineMeanMs: 30000, baselineStddevMs: 5000, zScore: 0, message: 'ok' }];
  const report = formatRegressionReport(signals);
  expect(report).toContain('No timing regressions');
});

test('formatRegressionReport includes regression details', () => {
  const signals = [
    { phase: 'iterate' as const, severity: 'regression' as const, currentMs: 50000, baselineMeanMs: 30000, baselineStddevMs: 5000, zScore: 4, message: 'iterate: REGRESSION 50000ms is 4.0σ above baseline' },
  ];
  const report = formatRegressionReport(signals);
  expect(report).toContain('REGRESSION');
  expect(report).toContain('iterate');
});

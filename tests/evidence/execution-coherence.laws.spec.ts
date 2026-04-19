import { test, expect } from '@playwright/test';
import {
  buildExecutionCoherence,
  extractHotScreens,
  extractStrongestCorrelations,
} from '../../product/application/drift/execution-coherence';
import type { LearningState } from '../../workshop/learning/learning-state';

function makeLearningState(overrides?: Partial<{
  rungEntries: LearningState['rungDrift']['entries'];
  timingRegressions: LearningState['signals']['timingRegressions'];
  costAnomalies: LearningState['signals']['costAnomalies'];
  noisyConsolePatterns: LearningState['signals']['noisyConsolePatterns'];
}>): LearningState {
  return {
    kind: 'learning-state',
    version: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    timing: { kind: 'timing-baseline-index', version: 1, baselines: [], updatedAt: '2026-01-01T00:00:00Z' },
    selectors: { kind: 'selector-health-index', version: 1, selectors: [], updatedAt: '2026-01-01T00:00:00Z' },
    recovery: { kind: 'recovery-effectiveness-index', version: 1, strategies: [], updatedAt: '2026-01-01T00:00:00Z' },
    console: { patterns: [] },
    cost: { baselines: [] },
    rungDrift: {
      entries: overrides?.rungEntries ?? [],
    },
    componentMaturation: [],
    signals: {
      timingRegressionRate: 0,
      selectorFlakinessRate: 0,
      recoveryEfficiency: 1,
      consoleNoiseLevel: 0,
      costEfficiency: 1,
      rungStability: 1,
      componentMaturityRate: 0,
      timingRegressions: overrides?.timingRegressions ?? [],
      flakySelectors: [],
      ineffectiveStrategies: [],
      noisyConsolePatterns: overrides?.noisyConsolePatterns ?? [],
      costAnomalies: overrides?.costAnomalies ?? [],
      driftingIntents: [],
    },
  };
}

function makeRungEntry(intentRef: string, direction: 'improving' | 'stable' | 'degrading') {
  return {
    intentRef,
    rungHistory: [3, 5],
    modalRung: 3,
    currentRung: 5,
    driftDirection: direction as 'improving' | 'stable' | 'degrading',
  };
}

function makeTimingRegression(stepCategory: string) {
  return {
    stepIndex: 0,
    stepCategory,
    phase: 'resolutionMs' as const,
    actual: 500,
    p95: 200,
    ratio: 2.5,
  };
}

function makeCostAnomaly(category: string) {
  return {
    category,
    medianInstructions: 10,
    p95Instructions: 30,
    medianDiagnostics: 2,
    p95Diagnostics: 5,
    sampleCount: 10,
  };
}

function makeConsolePattern(pattern: string) {
  return {
    pattern,
    occurrences: 5,
    affectedSteps: 3,
    failureCorrelation: 0.8,
    firstSeen: '2026-01-01T00:00:00Z',
    lastSeen: '2026-01-02T00:00:00Z',
  };
}

test('Law 1: buildExecutionCoherence produces valid report', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState(),
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('execution-coherence-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: compositeHealthScore is in [0, 1]', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
    }),
  });
  expect(report.compositeHealthScore).toBeGreaterThanOrEqual(0);
  expect(report.compositeHealthScore).toBeLessThanOrEqual(1);
});

test('Law 3: each screen health profile has scores in [0, 1]', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
        makeRungEntry('ClaimSearch.Button:click', 'stable'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
    }),
  });
  for (const profile of report.screenHealth) {
    expect(profile.rungDriftScore).toBeGreaterThanOrEqual(0);
    expect(profile.rungDriftScore).toBeLessThanOrEqual(1);
    expect(profile.timingScore).toBeGreaterThanOrEqual(0);
    expect(profile.timingScore).toBeLessThanOrEqual(1);
    expect(profile.costScore).toBeGreaterThanOrEqual(0);
    expect(profile.costScore).toBeLessThanOrEqual(1);
    expect(profile.consoleScore).toBeGreaterThanOrEqual(0);
    expect(profile.consoleScore).toBeLessThanOrEqual(1);
    expect(profile.compositeScore).toBeGreaterThanOrEqual(0);
    expect(profile.compositeScore).toBeLessThanOrEqual(1);
  }
});

test('Law 4: hotScreens only includes screens with 2+ signal types', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
      costAnomalies: [
        makeCostAnomaly('ClaimSearch.Button:click'),
      ],
    }),
  });
  for (const screen of report.hotScreens) {
    const profile = report.screenHealth.find((p) => p.screen === screen);
    expect(profile!.signalCount).toBeGreaterThanOrEqual(2);
  }
});

test('Law 5: empty learning state produces healthy report', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState(),
  });
  expect(report.compositeHealthScore).toBe(1);
  expect(report.hotScreens.length).toBe(0);
  expect(report.screenHealth.length).toBe(0);
});

test('Law 6: signal correlations have strength in [0, 1]', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
    }),
  });
  for (const corr of report.signalCorrelations) {
    expect(corr.strength).toBeGreaterThanOrEqual(0);
    expect(corr.strength).toBeLessThanOrEqual(1);
    expect(corr.coOccurrenceRate).toBeGreaterThanOrEqual(0);
    expect(corr.coOccurrenceRate).toBeLessThanOrEqual(1);
  }
});

test('Law 7: screenHealth is sorted by compositeScore ascending (worst first)', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
        makeRungEntry('ClaimSearch.Button:click', 'stable'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
    }),
  });
  for (let i = 1; i < report.screenHealth.length; i++) {
    expect(report.screenHealth[i]!.compositeScore)
      .toBeGreaterThanOrEqual(report.screenHealth[i - 1]!.compositeScore);
  }
});

test('Law 8: extractHotScreens limits to N items', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('A.X:fill', 'degrading'),
        makeRungEntry('B.Y:click', 'degrading'),
        makeRungEntry('C.Z:fill', 'degrading'),
      ],
      timingRegressions: [
        makeTimingRegression('A.X:fill'),
        makeTimingRegression('B.Y:click'),
        makeTimingRegression('C.Z:fill'),
      ],
    }),
  });
  const top2 = extractHotScreens(report, 2);
  expect(top2.length).toBeLessThanOrEqual(2);
});

test('Law 9: extractStrongestCorrelations limits to N items', () => {
  const report = buildExecutionCoherence({
    learningState: makeLearningState({
      rungEntries: [makeRungEntry('A.X:fill', 'degrading')],
      timingRegressions: [makeTimingRegression('A.X:fill')],
    }),
  });
  const top1 = extractStrongestCorrelations(report, 1);
  expect(top1.length).toBeLessThanOrEqual(1);
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    learningState: makeLearningState({
      rungEntries: [
        makeRungEntry('PolicySearch.Number:fill', 'degrading'),
      ],
      timingRegressions: [
        makeTimingRegression('PolicySearch.Number:fill'),
      ],
    }),
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildExecutionCoherence(input);
  const r2 = buildExecutionCoherence(input);
  expect(r1.compositeHealthScore).toBe(r2.compositeHealthScore);
  expect(r1.hotScreens.length).toBe(r2.hotScreens.length);
  expect(r1.screenHealth.length).toBe(r2.screenHealth.length);
  expect(r1.signalCorrelations.length).toBe(r2.signalCorrelations.length);
});

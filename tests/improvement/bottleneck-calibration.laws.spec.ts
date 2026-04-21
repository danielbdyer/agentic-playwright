/**
 * Bottleneck Weight Calibration — Law Tests
 *
 * Pure function invariants for the self-calibrating bottleneck weight system.
 * These are the "gradient signal" tests: they verify the math that drives
 * the recursive improvement loop's self-tuning behavior.
 *
 * Tested functions:
 *   - calibrateWeightsFromCorrelations (learning-bottlenecks.ts)
 *   - deriveIterationCorrelations (dogfood.ts)
 *   - iterationSignalStrengths (dogfood.ts)
 *   - consecutivePairs (dogfood.ts)
 */

import { expect, test } from '@playwright/test';
import { calibrateWeightsFromCorrelations } from '../../product/application/learning/learning-bottlenecks';
import { deriveIterationCorrelations, iterationSignalStrengths, consecutivePairs } from '../../workshop/orchestration/dogfood';
import { DEFAULT_PIPELINE_CONFIG } from '../../product/domain/attention/pipeline-config';
import type { BottleneckWeights } from '../../product/domain/attention/pipeline-config';
import type { BottleneckWeightCorrelation } from '../../workshop/metrics/types';
import type { ImprovementLoopIteration } from '../../product/domain/improvement/types';

// ─── Helpers ───

function iter(overrides: Partial<ImprovementLoopIteration> = {}): ImprovementLoopIteration {
  return {
    iteration: 1,
    scenarioIds: ['WI:1001'],
    proposalsGenerated: 2,
    proposalsActivated: 2,
    proposalsBlocked: 0,
    knowledgeHitRate: 0.5,
    unresolvedStepCount: 3,
    totalStepCount: 10,
    instructionCount: 100,
    ...overrides,
  };
}

function weightSum(w: BottleneckWeights): number {
  return w.repairDensity + w.translationRate + w.unresolvedRate + w.inverseFragmentShare;
}

function weightMin(w: BottleneckWeights): number {
  return Math.min(w.repairDensity, w.translationRate, w.unresolvedRate, w.inverseFragmentShare);
}

function correlation(signal: string, value: number): BottleneckWeightCorrelation {
  return { signal, weight: 0, correlationWithImprovement: value };
}

const BASE = DEFAULT_PIPELINE_CONFIG.bottleneckWeights;

// ─── Invariant 1: Weight Sum Preservation ───

test.describe('Invariant 1: Weight sum = 1.0 ± 0.01', () => {
  test('preserved after single positive correlation', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('high-unresolved-rate', 0.15),
    ]);
    expect(Math.abs(weightSum(calibrated) - 1.0)).toBeLessThan(0.01);
  });

  test('preserved with mixed positive and negative correlations', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', 0.2),
      correlation('translation-fallback-dominant', -0.1),
      correlation('high-unresolved-rate', 0.05),
      correlation('thin-screen-coverage', -0.15),
    ]);
    expect(Math.abs(weightSum(calibrated) - 1.0)).toBeLessThan(0.01);
  });

  test('preserved after 10 cumulative calibrations', () => {
    const correlations = [correlation('high-unresolved-rate', 0.08)];
    let weights = BASE;
    for (let i = 0; i < 10; i++) {
      weights = calibrateWeightsFromCorrelations(weights, correlations);
    }
    expect(Math.abs(weightSum(weights) - 1.0)).toBeLessThan(0.01);
  });
});

// ─── Invariant 2: Non-Negativity & Floor ───

test.describe('Invariant 2: No weight below 0.05 floor', () => {
  test('floor maintained with strong negative correlation', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('thin-screen-coverage', -0.5),
    ]);
    expect(weightMin(calibrated)).toBeGreaterThanOrEqual(0.05);
  });

  test('floor maintained after cumulative negative drift', () => {
    const correlations = [correlation('thin-screen-coverage', -0.3)];
    let weights = BASE;
    for (let i = 0; i < 20; i++) {
      weights = calibrateWeightsFromCorrelations(weights, correlations);
    }
    expect(weightMin(weights)).toBeGreaterThanOrEqual(0.05);
  });
});

// ─── Invariant 3: Determinism ───

test.describe('Invariant 3: Determinism', () => {
  test('same inputs produce same outputs', () => {
    const correlations = [
      correlation('repair-recovery-hotspot', 0.12),
      correlation('high-unresolved-rate', -0.05),
    ];
    const a = calibrateWeightsFromCorrelations(BASE, correlations);
    const b = calibrateWeightsFromCorrelations(BASE, correlations);
    expect(a).toEqual(b);
  });

  test('correlation order does not affect output', () => {
    const forward = [
      correlation('repair-recovery-hotspot', 0.1),
      correlation('translation-fallback-dominant', 0.2),
    ];
    const reversed = [...forward].reverse();
    const a = calibrateWeightsFromCorrelations(BASE, forward);
    const b = calibrateWeightsFromCorrelations(BASE, reversed);
    expect(a).toEqual(b);
  });
});

// ─── Invariant 4-5: Signal Direction Semantics ───

test.describe('Signal direction semantics', () => {
  test('positive correlation increases corresponding weight', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', 0.2),
    ]);
    expect(calibrated.repairDensity).toBeGreaterThan(BASE.repairDensity);
  });

  test('negative correlation decreases corresponding weight', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', -0.2),
    ]);
    expect(calibrated.repairDensity).toBeLessThan(BASE.repairDensity);
  });

  test('magnitude scales with learning rate', () => {
    const slow = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', 0.2),
    ], 0.05);
    const fast = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', 0.2),
    ], 0.2);
    // Fast learning rate should produce larger adjustment
    const slowDelta = Math.abs(slow.repairDensity - BASE.repairDensity);
    const fastDelta = Math.abs(fast.repairDensity - BASE.repairDensity);
    expect(fastDelta).toBeGreaterThan(slowDelta);
  });
});

// ─── Invariant 6: Zero Correlation Preservation ───

test.describe('Invariant 6: Zero correlations preserve weights', () => {
  test('all-zero correlations return base weights unchanged', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, [
      correlation('repair-recovery-hotspot', 0),
      correlation('translation-fallback-dominant', 0),
      correlation('high-unresolved-rate', 0),
      correlation('thin-screen-coverage', 0),
    ]);
    expect(calibrated).toEqual(BASE);
  });

  test('empty correlations return base weights unchanged', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, []);
    expect(calibrated).toEqual(BASE);
  });
});

// ─── Invariant 8: deriveIterationCorrelations ───

test.describe('deriveIterationCorrelations', () => {
  test('single iteration returns empty correlations', () => {
    const result = deriveIterationCorrelations([iter()]);
    expect(result).toEqual([]);
  });

  test('two iterations with improvement produce positive correlations', () => {
    const iterations = [
      iter({ knowledgeHitRate: 0.4, unresolvedStepCount: 5, totalStepCount: 10 }),
      iter({ knowledgeHitRate: 0.7, unresolvedStepCount: 2, totalStepCount: 10 }),
    ];
    const correlations = deriveIterationCorrelations(iterations);
    expect(correlations.length).toBeGreaterThan(0);
    // Hit rate improved → at least one positive correlation
    expect(correlations.some((c) => c.correlationWithImprovement > 0)).toBe(true);
  });

  test('two iterations with regression produce negative correlations', () => {
    const iterations = [
      iter({ knowledgeHitRate: 0.7, unresolvedStepCount: 5, totalStepCount: 10 }),
      iter({ knowledgeHitRate: 0.4, unresolvedStepCount: 5, totalStepCount: 10 }),
    ];
    const correlations = deriveIterationCorrelations(iterations);
    expect(correlations.length).toBeGreaterThan(0);
    // Hit rate dropped → negative correlations
    expect(correlations.some((c) => c.correlationWithImprovement < 0)).toBe(true);
  });

  test('stagnation (equal hit rates) produces zero-valued correlations', () => {
    const iterations = [
      iter({ knowledgeHitRate: 0.5, unresolvedStepCount: 0, totalStepCount: 10, proposalsActivated: 0 }),
      iter({ knowledgeHitRate: 0.5, unresolvedStepCount: 0, totalStepCount: 10, proposalsActivated: 0 }),
    ];
    const correlations = deriveIterationCorrelations(iterations);
    // With 0 unresolved and 0 proposals, no signal strengths → no observations
    expect(correlations).toEqual([]);
  });

  test('three iterations produce averaged correlations', () => {
    const iterations = [
      iter({ knowledgeHitRate: 0.3, unresolvedStepCount: 5, totalStepCount: 10 }),
      iter({ knowledgeHitRate: 0.5, unresolvedStepCount: 3, totalStepCount: 10 }),
      iter({ knowledgeHitRate: 0.6, unresolvedStepCount: 2, totalStepCount: 10 }),
    ];
    const correlations = deriveIterationCorrelations(iterations);
    // Two pairs: (0.3→0.5) and (0.5→0.6), both positive
    expect(correlations.length).toBeGreaterThan(0);
    expect(correlations.every((c) => c.correlationWithImprovement >= 0)).toBe(true);
  });
});

// ─── Invariant 10: iterationSignalStrengths ───

test.describe('iterationSignalStrengths', () => {
  test('high unresolved rate produces unresolved signal', () => {
    const signals = iterationSignalStrengths(
      iter({ unresolvedStepCount: 8, totalStepCount: 10 }),
    );
    const unresolvedSignal = signals.find((s) => s.signal === 'high-unresolved-rate');
    expect(unresolvedSignal).toBeDefined();
    expect(unresolvedSignal!.strength).toBeCloseTo(0.8, 1);
  });

  test('zero unresolved produces no unresolved signal', () => {
    const signals = iterationSignalStrengths(
      iter({ unresolvedStepCount: 0, totalStepCount: 10, proposalsActivated: 0 }),
    );
    expect(signals).toEqual([]);
  });

  test('proposals activated produces repair signal', () => {
    const signals = iterationSignalStrengths(
      iter({ proposalsActivated: 5, unresolvedStepCount: 0, totalStepCount: 10 }),
    );
    const repairSignal = signals.find((s) => s.signal === 'repair-recovery-hotspot');
    expect(repairSignal).toBeDefined();
    expect(repairSignal!.strength).toBe(0.3);
  });
});

// ─── consecutivePairs utility ───

test.describe('consecutivePairs', () => {
  test('empty array returns empty', () => {
    expect(consecutivePairs([])).toEqual([]);
  });

  test('single element returns empty', () => {
    expect(consecutivePairs([1])).toEqual([]);
  });

  test('two elements return one pair', () => {
    expect(consecutivePairs([1, 2])).toEqual([[1, 2]]);
  });

  test('four elements return three pairs', () => {
    expect(consecutivePairs([1, 2, 3, 4])).toEqual([[1, 2], [2, 3], [3, 4]]);
  });
});

// ─── End-to-End: calibration from iteration data ───

test.describe('End-to-end calibration from iteration data', () => {
  test('improvement iterations calibrate weights toward active signals', () => {
    const iterations = [
      iter({ iteration: 1, knowledgeHitRate: 0.3, unresolvedStepCount: 7, totalStepCount: 10 }),
      iter({ iteration: 2, knowledgeHitRate: 0.5, unresolvedStepCount: 5, totalStepCount: 10 }),
      iter({ iteration: 3, knowledgeHitRate: 0.6, unresolvedStepCount: 3, totalStepCount: 10 }),
    ];
    const correlations = deriveIterationCorrelations(iterations);
    const calibrated = calibrateWeightsFromCorrelations(BASE, correlations);

    // All invariants hold
    expect(Math.abs(weightSum(calibrated) - 1.0)).toBeLessThan(0.01);
    expect(weightMin(calibrated)).toBeGreaterThanOrEqual(0.05);

    // High unresolved rate correlated with improvement → weight increased
    expect(calibrated.unresolvedRate).toBeGreaterThanOrEqual(BASE.unresolvedRate);
  });
});

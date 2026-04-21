/**
 * Simplex Invariant — Law Tests
 *
 * Algebraic invariants for bottleneck weight calibration:
 *   - Simplex preservation: sum(weights) = 1.0 +/- 0.01
 *   - Non-negative: all components >= 0
 *   - Idempotent normalization: zero correlations => same weights
 *   - Monotone response: positive correlation increases relative weight
 *
 * Tested function:
 *   - calibrateWeightsFromCorrelations (learning-bottlenecks.ts)
 */

import { expect, test } from '@playwright/test';
import { mulberry32 , LAW_SEED_COUNT } from '../support/random';
import { calibrateWeightsFromCorrelations } from '../../product/application/learning/learning-bottlenecks';
import { DEFAULT_PIPELINE_CONFIG } from '../../product/domain/attention/pipeline-config';
import type { BottleneckWeights } from '../../product/domain/attention/pipeline-config';
import type { BottleneckWeightCorrelation } from '../../product/domain/fitness/types';

// ─── Helpers ───

const BASE = DEFAULT_PIPELINE_CONFIG.bottleneckWeights;

const SIGNALS: readonly string[] = [
  'repair-recovery-hotspot',
  'translation-fallback-dominant',
  'high-unresolved-rate',
  'thin-screen-coverage',
];

const WEIGHT_KEYS: readonly (keyof BottleneckWeights)[] = [
  'repairDensity',
  'translationRate',
  'unresolvedRate',
  'inverseFragmentShare',
];

function weightSum(w: BottleneckWeights): number {
  return w.repairDensity + w.translationRate + w.unresolvedRate + w.inverseFragmentShare;
}

function weightValues(w: BottleneckWeights): readonly number[] {
  return WEIGHT_KEYS.map((k) => w[k]);
}

function correlation(signal: string, value: number): BottleneckWeightCorrelation {
  return { signal, weight: 0, correlationWithImprovement: value };
}

function randomCorrelations(next: () => number): readonly BottleneckWeightCorrelation[] {
  return SIGNALS.map((signal) => correlation(signal, (next() - 0.5) * 2));
}

function randomWeights(next: () => number): BottleneckWeights {
  const raw = WEIGHT_KEYS.map(() => 0.05 + next() * 0.9);
  const sum = raw.reduce((s, v) => s + v, 0);
  return {
    repairDensity: raw[0]! / sum,
    translationRate: raw[1]! / sum,
    unresolvedRate: raw[2]! / sum,
    inverseFragmentShare: raw[3]! / sum,
  };
}

// ─── Law 1: Simplex preservation ───

test.describe('Law 1: Simplex preservation — sum = 1.0 +/- 0.01', () => {
  test('preserved across 20 random correlation vectors', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const correlations = randomCorrelations(next);
      const calibrated = calibrateWeightsFromCorrelations(BASE, correlations);
      expect(Math.abs(weightSum(calibrated) - 1.0)).toBeLessThan(0.01);
    }
  });

  test('preserved with random base weights and random correlations (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 1000);
      const base = randomWeights(next);
      const correlations = randomCorrelations(next);
      const calibrated = calibrateWeightsFromCorrelations(base, correlations);
      expect(Math.abs(weightSum(calibrated) - 1.0)).toBeLessThan(0.01);
    }
  });

  test('preserved after 20 cumulative calibrations', () => {
    let weights = BASE;
    for (let i = 0; i < 20; i++) {
      const next = mulberry32(i + 2000);
      const correlations = randomCorrelations(next);
      weights = calibrateWeightsFromCorrelations(weights, correlations);
      expect(Math.abs(weightSum(weights) - 1.0)).toBeLessThan(0.01);
    }
  });
});

// ─── Law 2: Non-negative ───

test.describe('Law 2: Non-negative — all components >= 0', () => {
  test('non-negative across 20 random correlation vectors', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed);
      const correlations = randomCorrelations(next);
      const calibrated = calibrateWeightsFromCorrelations(BASE, correlations);
      for (const v of weightValues(calibrated)) {
        expect(v).toBeGreaterThanOrEqual(0);
      }
    }
  });

  test('non-negative even with extreme negative correlations', () => {
    const extreme = SIGNALS.map((signal) => correlation(signal, -1.0));
    const calibrated = calibrateWeightsFromCorrelations(BASE, extreme);
    for (const v of weightValues(calibrated)) {
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });
});

// ─── Law 3: Idempotent normalization ───

test.describe('Law 3: Idempotent normalization — zero correlations preserve weights', () => {
  test('all-zero correlations return base weights unchanged', () => {
    const zeros = SIGNALS.map((signal) => correlation(signal, 0));
    const calibrated = calibrateWeightsFromCorrelations(BASE, zeros);
    expect(calibrated).toEqual(BASE);
  });

  test('empty correlations return base weights unchanged', () => {
    const calibrated = calibrateWeightsFromCorrelations(BASE, []);
    expect(calibrated).toEqual(BASE);
  });

  test('idempotent with random base weights and zero correlations (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 3000);
      const base = randomWeights(next);
      const zeros = SIGNALS.map((signal) => correlation(signal, 0));
      const calibrated = calibrateWeightsFromCorrelations(base, zeros);
      expect(calibrated).toEqual(base);
    }
  });
});

// ─── Law 4: Monotone response ───

test.describe('Law 4: Monotone response — positive correlation increases relative weight', () => {
  for (let i = 0; i < SIGNALS.length; i++) {
    const signal = SIGNALS[i]!;
    const weightKey = WEIGHT_KEYS[i]!;

    test(`positive correlation for ${signal} increases ${weightKey}`, () => {
      const correlations = [correlation(signal, 0.3)];
      const calibrated = calibrateWeightsFromCorrelations(BASE, correlations);
      expect(calibrated[weightKey]).toBeGreaterThan(BASE[weightKey]);
    });

    test(`negative correlation for ${signal} decreases ${weightKey}`, () => {
      const correlations = [correlation(signal, -0.3)];
      const calibrated = calibrateWeightsFromCorrelations(BASE, correlations);
      expect(calibrated[weightKey]).toBeLessThan(BASE[weightKey]);
    });
  }

  test('stronger positive correlation produces larger increase (20 seeds)', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed++) {
      const next = mulberry32(seed + 4000);
      const signalIdx = Math.floor(next() * SIGNALS.length);
      const signal = SIGNALS[signalIdx]!;
      const weightKey = WEIGHT_KEYS[signalIdx]!;

      const weak = calibrateWeightsFromCorrelations(BASE, [correlation(signal, 0.1)]);
      const strong = calibrateWeightsFromCorrelations(BASE, [correlation(signal, 0.5)]);

      expect(strong[weightKey]).toBeGreaterThanOrEqual(weak[weightKey]);
    }
  });
});

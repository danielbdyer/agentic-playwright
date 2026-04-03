/**
 * Signal Maturation — law-style tests.
 *
 * Verifies the saturation curve, dampening behavior, degradation counting,
 * and summary construction.
 */

import { test, expect } from '@playwright/test';
import {
  signalMaturity,
  dampenSignalStrength,
  countDegradingSignals,
  buildLearningSignalsSummary,
} from '../lib/application/signal-maturation';
import type { LearningSignalsSummary } from '../lib/domain/types';

// ─── Helpers ───

function healthySignals(): LearningSignalsSummary {
  return {
    timingRegressionRate: 0,
    selectorFlakinessRate: 0,
    recoveryEfficiency: 1,
    consoleNoiseLevel: 0,
    costEfficiency: 1,
    rungStability: 1,
    componentMaturityRate: 1,
    compositeHealthScore: 1,
    hotScreenCount: 0,
  };
}

function unhealthySignals(): LearningSignalsSummary {
  return {
    timingRegressionRate: 0.8,
    selectorFlakinessRate: 0.6,
    recoveryEfficiency: 0.2,
    consoleNoiseLevel: 0.5,
    costEfficiency: 0.3,
    rungStability: 0.3,
    componentMaturityRate: 0.2,
    compositeHealthScore: 0.2,
    hotScreenCount: 5,
  };
}

// ─── Laws ───

test.describe('signal-maturation', () => {
  test.describe('signalMaturity', () => {
    test('law: maturity is strictly monotonically increasing with iteration', () => {
      const values = Array.from({ length: 20 }, (_, i) => signalMaturity(i + 1));
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThan(values[i - 1]!);
      }
    });

    test('law: maturity is always in (0, 1) for positive iterations', () => {
      for (let i = 1; i <= 100; i++) {
        const m = signalMaturity(i);
        expect(m).toBeGreaterThan(0);
        expect(m).toBeLessThan(1);
      }
    });

    test('law: maturity at half-saturation iteration (3) is approximately 0.5', () => {
      expect(signalMaturity(3)).toBeCloseTo(0.5, 1);
    });

    test('law: iteration 0 or negative yields 0 maturity', () => {
      expect(signalMaturity(0)).toBe(0);
      expect(signalMaturity(-1)).toBe(0);
    });

    test('law: specific known values match the saturation curve', () => {
      // maturity(n) = 1 - 1/(1 + n/3)
      // n=1: 1 - 1/(1 + 1/3) = 1 - 3/4 = 0.25
      expect(signalMaturity(1)).toBeCloseTo(0.25, 2);
      // n=5: 1 - 1/(1 + 5/3) = 1 - 3/8 = 0.625
      expect(signalMaturity(5)).toBeCloseTo(0.625, 2);
      // n=10: 1 - 1/(1 + 10/3) = 1 - 3/13 ≈ 0.769
      expect(signalMaturity(10)).toBeCloseTo(0.769, 2);
    });
  });

  test.describe('dampenSignalStrength', () => {
    test('law: dampened strength ≤ original strength', () => {
      for (let iter = 1; iter <= 20; iter++) {
        const dampened = dampenSignalStrength(0.8, iter);
        expect(dampened).toBeLessThanOrEqual(0.8);
      }
    });

    test('law: dampened strength increases monotonically with iteration for fixed strength', () => {
      const values = Array.from({ length: 10 }, (_, i) => dampenSignalStrength(0.8, i + 1));
      for (let i = 1; i < values.length; i++) {
        expect(values[i]).toBeGreaterThanOrEqual(values[i - 1]!);
      }
    });

    test('law: zero strength stays zero regardless of iteration', () => {
      for (let iter = 1; iter <= 10; iter++) {
        expect(dampenSignalStrength(0, iter)).toBe(0);
      }
    });

    test('law: at iteration 1, strength 0.8 → 0.2', () => {
      expect(dampenSignalStrength(0.8, 1)).toBeCloseTo(0.2, 1);
    });
  });

  test.describe('countDegradingSignals', () => {
    test('law: healthy signals have 0 degrading dimensions', () => {
      expect(countDegradingSignals(healthySignals())).toBe(0);
    });

    test('law: fully unhealthy signals have 7 degrading dimensions', () => {
      expect(countDegradingSignals(unhealthySignals())).toBe(7);
    });

    test('law: count is bounded by [0, 7]', () => {
      const count = countDegradingSignals(healthySignals());
      expect(count).toBeGreaterThanOrEqual(0);
      expect(count).toBeLessThanOrEqual(7);
    });

    test('law: borderline values — lower-is-better at exactly 0.3 is not degrading', () => {
      const signals = { ...healthySignals(), timingRegressionRate: 0.3 };
      expect(countDegradingSignals(signals)).toBe(0);
    });

    test('law: borderline values — higher-is-better at exactly 0.5 is not degrading', () => {
      const signals = { ...healthySignals(), recoveryEfficiency: 0.5 };
      expect(countDegradingSignals(signals)).toBe(0);
    });
  });

  test.describe('buildLearningSignalsSummary', () => {
    test('law: output has all 9 fields', () => {
      const summary = buildLearningSignalsSummary(
        {
          timingRegressionRate: 0.1,
          selectorFlakinessRate: 0.2,
          recoveryEfficiency: 0.8,
          consoleNoiseLevel: 0.1,
          costEfficiency: 0.9,
          rungStability: 0.7,
          componentMaturityRate: 0.6,
        },
        0.75,
        2,
      );

      expect(summary).toHaveProperty('timingRegressionRate');
      expect(summary).toHaveProperty('selectorFlakinessRate');
      expect(summary).toHaveProperty('recoveryEfficiency');
      expect(summary).toHaveProperty('consoleNoiseLevel');
      expect(summary).toHaveProperty('costEfficiency');
      expect(summary).toHaveProperty('rungStability');
      expect(summary).toHaveProperty('componentMaturityRate');
      expect(summary).toHaveProperty('compositeHealthScore');
      expect(summary).toHaveProperty('hotScreenCount');
    });

    test('law: values are rounded to 4 decimal places', () => {
      const summary = buildLearningSignalsSummary(
        {
          timingRegressionRate: 0.123456789,
          selectorFlakinessRate: 0,
          recoveryEfficiency: 1,
          consoleNoiseLevel: 0,
          costEfficiency: 1,
          rungStability: 1,
          componentMaturityRate: 1,
        },
        0.999999,
        0,
      );

      const str = summary.timingRegressionRate.toString();
      const decimals = str.includes('.') ? str.split('.')[1]!.length : 0;
      expect(decimals).toBeLessThanOrEqual(4);
    });

    test('law: compositeHealthScore and hotScreenCount pass through', () => {
      const summary = buildLearningSignalsSummary(
        {
          timingRegressionRate: 0,
          selectorFlakinessRate: 0,
          recoveryEfficiency: 1,
          consoleNoiseLevel: 0,
          costEfficiency: 1,
          rungStability: 1,
          componentMaturityRate: 1,
        },
        0.85,
        3,
      );
      expect(summary.compositeHealthScore).toBeCloseTo(0.85, 2);
      expect(summary.hotScreenCount).toBe(3);
    });
  });
});

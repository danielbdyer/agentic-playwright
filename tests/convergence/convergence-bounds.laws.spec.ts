/**
 * Law-style tests for fixed-point convergence bounds.
 *
 * Laws verified:
 * - Lyapunov evaluate is non-negative for valid metrics
 * - Lyapunov evaluate maps perfect state to 0
 * - Lyapunov isDecreasing is correct for various deltas
 * - knowledgeHitRateLyapunov reflects hit rate improvement
 * - compositeLyapunov combines metrics with correct weighting
 * - deriveTerminationBound handles edge cases and produces correct values
 * - isMonotonicallyDecreasing detects monotone and non-monotone sequences
 * - isFixedPoint detects convergence in a window
 * - estimateRateOfDecrease computes correct averages
 */

import { expect, test } from '@playwright/test';
import {
  knowledgeHitRateLyapunov,
  compositeLyapunov,
  deriveTerminationBound,
  isMonotonicallyDecreasing,
  isFixedPoint,
  estimateRateOfDecrease,
  type StabilityMetrics,
} from '../../product/domain/projection/convergence-bounds';

// ─── Fixtures ───

function createMetrics(overrides: Partial<StabilityMetrics> = {}): StabilityMetrics {
  return {
    knowledgeHitRate: 0.5,
    proposalYield: 0.5,
    translationPrecision: 0.5,
    convergenceVelocity: 0.1,
    ...overrides,
  };
}

function perfectMetrics(): StabilityMetrics {
  return createMetrics({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
    convergenceVelocity: 1,
  });
}

function zeroMetrics(): StabilityMetrics {
  return createMetrics({
    knowledgeHitRate: 0,
    proposalYield: 0,
    translationPrecision: 0,
    convergenceVelocity: 0,
  });
}

// ─── Law: knowledgeHitRateLyapunov evaluate is non-negative ───

test('knowledgeHitRateLyapunov evaluate is non-negative for rate in [0,1]', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const rates = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
  for (const rate of rates) {
    const energy = lyapunov.evaluate(createMetrics({ knowledgeHitRate: rate }));
    expect(energy).toBeGreaterThanOrEqual(0);
  }
});

test('knowledgeHitRateLyapunov evaluate is 0 at perfect hit rate', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const energy = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 1 }));
  expect(energy).toBe(0);
});

test('knowledgeHitRateLyapunov evaluate is 1 at zero hit rate', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const energy = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0 }));
  expect(energy).toBe(1);
});

test('knowledgeHitRateLyapunov evaluate equals 1 - hitRate', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const rates = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1];
  for (const rate of rates) {
    const energy = lyapunov.evaluate(createMetrics({ knowledgeHitRate: rate }));
    expect(energy).toBeCloseTo(1 - rate, 10);
  }
});

// ─── Law: knowledgeHitRateLyapunov is monotonically decreasing with hitRate ───

test('knowledgeHitRateLyapunov energy decreases as hitRate increases', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const rates = [0.1, 0.3, 0.5, 0.7, 0.9];
  const energies = rates.map((r) => lyapunov.evaluate(createMetrics({ knowledgeHitRate: r })));
  for (let i = 1; i < energies.length; i++) {
    expect(energies[i]!).toBeLessThan(energies[i - 1]!);
  }
});

// ─── Law: knowledgeHitRateLyapunov isDecreasing correctness ───

test('isDecreasing is true when prev > current + epsilon', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.isDecreasing(0.8, 0.5, 0.01)).toBe(true);
});

test('isDecreasing is false when prev == current', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.isDecreasing(0.5, 0.5, 0.01)).toBe(false);
});

test('isDecreasing is false when prev < current', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.isDecreasing(0.3, 0.5, 0.01)).toBe(false);
});

test('isDecreasing is false when decrease is within epsilon', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.isDecreasing(0.5, 0.499, 0.01)).toBe(false);
});

test('isDecreasing is true when decrease barely exceeds epsilon', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.isDecreasing(0.5, 0.489, 0.01)).toBe(true);
});

// ─── Law: compositeLyapunov is non-negative ───

test('compositeLyapunov evaluate is non-negative for metrics in [0,1]', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const metrics = [
    zeroMetrics(),
    createMetrics({ knowledgeHitRate: 0.5, proposalYield: 0.3, translationPrecision: 0.7 }),
    perfectMetrics(),
  ];
  for (const m of metrics) {
    expect(lyapunov.evaluate(m)).toBeGreaterThanOrEqual(0);
  }
});

test('compositeLyapunov evaluate is 0 at perfect metrics', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  expect(lyapunov.evaluate(perfectMetrics())).toBeCloseTo(0, 10);
});

test('compositeLyapunov evaluate is 1 at zero metrics', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  expect(lyapunov.evaluate(zeroMetrics())).toBeCloseTo(1, 10);
});

// ─── Law: compositeLyapunov respects weights ───

test('compositeLyapunov with only knowledgeHitRate weight matches knowledgeHitRateLyapunov', () => {
  const composite = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 0,
    translationPrecision: 0,
  });
  const simple = knowledgeHitRateLyapunov();
  const testMetrics = [
    createMetrics({ knowledgeHitRate: 0.3 }),
    createMetrics({ knowledgeHitRate: 0.7 }),
    createMetrics({ knowledgeHitRate: 1.0 }),
  ];
  for (const m of testMetrics) {
    expect(composite.evaluate(m)).toBeCloseTo(simple.evaluate(m), 10);
  }
});

test('compositeLyapunov with equal weights is average of individual energies', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const m = createMetrics({ knowledgeHitRate: 0.6, proposalYield: 0.4, translationPrecision: 0.8 });
  const expected = ((1 - 0.6) + (1 - 0.4) + (1 - 0.8)) / 3;
  expect(lyapunov.evaluate(m)).toBeCloseTo(expected, 10);
});

test('compositeLyapunov with unequal weights biases toward heavier metric', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 10,
    proposalYield: 0,
    translationPrecision: 0,
  });
  // Only knowledgeHitRate matters
  const m1 = createMetrics({ knowledgeHitRate: 0.9, proposalYield: 0.1, translationPrecision: 0.1 });
  const m2 = createMetrics({ knowledgeHitRate: 0.1, proposalYield: 0.9, translationPrecision: 0.9 });
  expect(lyapunov.evaluate(m1)).toBeLessThan(lyapunov.evaluate(m2));
});

// ─── Law: deriveTerminationBound correctness ───

test('deriveTerminationBound returns 0 when already converged', () => {
  expect(deriveTerminationBound(0.1, 0.5, 0.5)).toBe(0);
  expect(deriveTerminationBound(0.1, 0.3, 0.5)).toBe(0);
});

test('deriveTerminationBound returns Infinity when rate is 0', () => {
  expect(deriveTerminationBound(0, 1.0, 0.5)).toBe(Infinity);
});

test('deriveTerminationBound returns Infinity when rate is negative', () => {
  expect(deriveTerminationBound(-0.1, 1.0, 0.5)).toBe(Infinity);
});

test('deriveTerminationBound uses ceiling division', () => {
  // (1.0 - 0.0) / 0.3 = 3.33... => ceil = 4
  expect(deriveTerminationBound(0.3, 1.0, 0.0)).toBe(4);
});

test('deriveTerminationBound exact division', () => {
  // (1.0 - 0.0) / 0.5 = 2.0 => ceil = 2
  expect(deriveTerminationBound(0.5, 1.0, 0.0)).toBe(2);
});

test('deriveTerminationBound with small gap', () => {
  // (0.1 - 0.0) / 0.05 = 2.0
  expect(deriveTerminationBound(0.05, 0.1, 0.0)).toBe(2);
});

test('deriveTerminationBound is non-negative for valid inputs', () => {
  const rates = [0.01, 0.1, 0.5, 1.0];
  const initials = [0.1, 0.5, 1.0];
  const targets = [0.0, 0.05, 0.1];
  for (const rate of rates) {
    for (const initial of initials) {
      for (const target of targets) {
        const bound = deriveTerminationBound(rate, initial, target);
        expect(bound).toBeGreaterThanOrEqual(0);
      }
    }
  }
});

test('deriveTerminationBound decreases with faster rate', () => {
  const slow = deriveTerminationBound(0.1, 1.0, 0.0);
  const fast = deriveTerminationBound(0.5, 1.0, 0.0);
  expect(fast).toBeLessThanOrEqual(slow);
});

test('deriveTerminationBound increases with larger gap', () => {
  const small = deriveTerminationBound(0.1, 0.5, 0.3);
  const large = deriveTerminationBound(0.1, 1.0, 0.0);
  expect(large).toBeGreaterThanOrEqual(small);
});

// ─── Law: isMonotonicallyDecreasing correctness ───

test('isMonotonicallyDecreasing is true for empty array', () => {
  expect(isMonotonicallyDecreasing([], 0)).toBe(true);
});

test('isMonotonicallyDecreasing is true for single element', () => {
  expect(isMonotonicallyDecreasing([0.5], 0)).toBe(true);
});

test('isMonotonicallyDecreasing is true for strictly decreasing sequence', () => {
  expect(isMonotonicallyDecreasing([1.0, 0.8, 0.6, 0.4, 0.2], 0)).toBe(true);
});

test('isMonotonicallyDecreasing is true for constant sequence with epsilon=0', () => {
  expect(isMonotonicallyDecreasing([0.5, 0.5, 0.5], 0)).toBe(true);
});

test('isMonotonicallyDecreasing is false for increasing sequence with epsilon=0', () => {
  expect(isMonotonicallyDecreasing([0.2, 0.4, 0.6], 0)).toBe(false);
});

test('isMonotonicallyDecreasing tolerates increase within epsilon', () => {
  // 0.5 -> 0.505 is an increase of 0.005, within epsilon of 0.01
  expect(isMonotonicallyDecreasing([0.5, 0.505, 0.49], 0.01)).toBe(true);
});

test('isMonotonicallyDecreasing rejects increase beyond epsilon', () => {
  // 0.5 -> 0.52 is an increase of 0.02, beyond epsilon of 0.01
  expect(isMonotonicallyDecreasing([0.5, 0.52], 0.01)).toBe(false);
});

test('isMonotonicallyDecreasing with large epsilon accepts anything', () => {
  expect(isMonotonicallyDecreasing([0.1, 0.5, 0.9], 1.0)).toBe(true);
});

test('isMonotonicallyDecreasing with long decreasing sequence', () => {
  const values = Array.from({ length: 100 }, (_, i) => 1.0 - i * 0.01);
  expect(isMonotonicallyDecreasing(values, 0)).toBe(true);
});

test('isMonotonicallyDecreasing with single violation returns false', () => {
  expect(isMonotonicallyDecreasing([1.0, 0.8, 0.9, 0.6], 0)).toBe(false);
});

// ─── Law: isFixedPoint correctness ───

test('isFixedPoint returns false when fewer values than windowSize', () => {
  expect(isFixedPoint([0.5, 0.5], 3, 0.01)).toBe(false);
});

test('isFixedPoint returns true for constant window', () => {
  expect(isFixedPoint([0.8, 0.6, 0.5, 0.5, 0.5], 3, 0.01)).toBe(true);
});

test('isFixedPoint returns false when window has large spread', () => {
  expect(isFixedPoint([0.8, 0.6, 0.4], 3, 0.01)).toBe(false);
});

test('isFixedPoint only considers last windowSize values', () => {
  // Last 3 values: [0.5, 0.5, 0.5] — fixed point
  expect(isFixedPoint([1.0, 0.8, 0.5, 0.5, 0.5], 3, 0.01)).toBe(true);
});

test('isFixedPoint with epsilon=0 requires exact equality', () => {
  expect(isFixedPoint([0.5, 0.5, 0.5], 3, 0)).toBe(true);
  expect(isFixedPoint([0.5, 0.5, 0.500001], 3, 0)).toBe(false);
});

test('isFixedPoint with window=1 is always true if enough values', () => {
  expect(isFixedPoint([0.1, 0.5, 0.9], 1, 0)).toBe(true);
});

test('isFixedPoint with window=2 checks last 2 values', () => {
  expect(isFixedPoint([0.1, 0.5, 0.5], 2, 0.01)).toBe(true);
  expect(isFixedPoint([0.1, 0.5, 0.9], 2, 0.01)).toBe(false);
});

// ─── Law: estimateRateOfDecrease correctness ───

test('estimateRateOfDecrease returns 0 for empty array', () => {
  expect(estimateRateOfDecrease([])).toBe(0);
});

test('estimateRateOfDecrease returns 0 for single value', () => {
  expect(estimateRateOfDecrease([0.5])).toBe(0);
});

test('estimateRateOfDecrease returns 0 for increasing sequence', () => {
  expect(estimateRateOfDecrease([0.1, 0.3, 0.5])).toBe(0);
});

test('estimateRateOfDecrease returns 0 for constant sequence', () => {
  expect(estimateRateOfDecrease([0.5, 0.5, 0.5])).toBe(0);
});

test('estimateRateOfDecrease computes correct rate for uniform decrease', () => {
  // Each step decreases by 0.2
  const rate = estimateRateOfDecrease([1.0, 0.8, 0.6, 0.4]);
  expect(rate).toBeCloseTo(0.2, 10);
});

test('estimateRateOfDecrease averages only decreasing pairs', () => {
  // Decreasing pairs: (1.0, 0.8) = 0.2, (0.9, 0.7) = 0.2 — skip (0.8, 0.9) increase
  const rate = estimateRateOfDecrease([1.0, 0.8, 0.9, 0.7]);
  expect(rate).toBeCloseTo(0.2, 10);
});

test('estimateRateOfDecrease is non-negative', () => {
  const sequences = [
    [1.0, 0.5],
    [0.5, 1.0],
    [0.5, 0.5],
    [1.0, 0.8, 0.9, 0.7, 0.6],
  ];
  for (const seq of sequences) {
    expect(estimateRateOfDecrease(seq)).toBeGreaterThanOrEqual(0);
  }
});

test('estimateRateOfDecrease for single decrease step', () => {
  const rate = estimateRateOfDecrease([1.0, 0.6]);
  expect(rate).toBeCloseTo(0.4, 10);
});

// ─── Law: Lyapunov function composition is pure ───

test('knowledgeHitRateLyapunov produces same result for same input', () => {
  const l1 = knowledgeHitRateLyapunov();
  const l2 = knowledgeHitRateLyapunov();
  const m = createMetrics({ knowledgeHitRate: 0.7 });
  expect(l1.evaluate(m)).toBe(l2.evaluate(m));
});

test('compositeLyapunov produces same result for same input', () => {
  const weights = { knowledgeHitRate: 2, proposalYield: 1, translationPrecision: 1 };
  const l1 = compositeLyapunov(weights);
  const l2 = compositeLyapunov(weights);
  const m = createMetrics({ knowledgeHitRate: 0.6, proposalYield: 0.4, translationPrecision: 0.8 });
  expect(l1.evaluate(m)).toBe(l2.evaluate(m));
});

// ─── Law: Lyapunov energy tracks improvement correctly ───

test('improving knowledge hit rate decreases knowledgeHitRateLyapunov energy', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const before = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.5 }));
  const after = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.8 }));
  expect(after).toBeLessThan(before);
  expect(lyapunov.isDecreasing(before, after, 0.001)).toBe(true);
});

test('worsening knowledge hit rate increases knowledgeHitRateLyapunov energy', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const before = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.8 }));
  const after = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.5 }));
  expect(after).toBeGreaterThan(before);
  expect(lyapunov.isDecreasing(before, after, 0.001)).toBe(false);
});

// ─── Law: Convergence scenario — full trajectory ───

test('full convergence trajectory: energy decreases, then fixed point', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const trajectory = [0.3, 0.5, 0.7, 0.85, 0.9, 0.92, 0.92, 0.92].map((r) =>
    lyapunov.evaluate(createMetrics({ knowledgeHitRate: r })),
  );

  // Energy should be monotonically decreasing (with tolerance)
  expect(isMonotonicallyDecreasing(trajectory, 0.001)).toBe(true);

  // Last 3 values form a fixed point
  expect(isFixedPoint(trajectory, 3, 0.01)).toBe(true);

  // Rate of decrease from first 5 values
  const earlyRate = estimateRateOfDecrease(trajectory.slice(0, 5));
  expect(earlyRate).toBeGreaterThan(0);

  // Termination bound from early rate predicts convergence
  const bound = deriveTerminationBound(earlyRate, trajectory[0]!, 0);
  expect(bound).toBeGreaterThan(0);
  expect(Number.isFinite(bound)).toBe(true);
});

// ─── Law: deriveTerminationBound matches actual iteration count ───

test('deriveTerminationBound bounds actual convergence for uniform decrease', () => {
  const rate = 0.1;
  const initial = 1.0;
  const target = 0.0;
  const bound = deriveTerminationBound(rate, initial, target); // ceil(10) = 10

  // Simulate: after `bound` iterations at rate 0.1, we should reach target
  const finalValue = initial - bound * rate;
  expect(finalValue).toBeLessThanOrEqual(target);
});

// ─── Law: compositeLyapunov isDecreasing matches knowledgeHitRateLyapunov ───

test('compositeLyapunov isDecreasing has same semantics as knowledgeHitRate version', () => {
  const simple = knowledgeHitRateLyapunov();
  const composite = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const testCases: ReadonlyArray<readonly [number, number, number]> = [
    [0.8, 0.5, 0.01],
    [0.5, 0.5, 0.01],
    [0.3, 0.5, 0.01],
    [0.5, 0.489, 0.01],
  ];
  for (const [prev, current, epsilon] of testCases) {
    expect(composite.isDecreasing(prev, current, epsilon)).toBe(
      simple.isDecreasing(prev, current, epsilon),
    );
  }
});

// ─── Law: knowledgeHitRateLyapunov ignores other metrics ───

test('knowledgeHitRateLyapunov is independent of proposalYield', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const m1 = createMetrics({ knowledgeHitRate: 0.5, proposalYield: 0.1 });
  const m2 = createMetrics({ knowledgeHitRate: 0.5, proposalYield: 0.9 });
  expect(lyapunov.evaluate(m1)).toBe(lyapunov.evaluate(m2));
});

test('knowledgeHitRateLyapunov is independent of translationPrecision', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const m1 = createMetrics({ knowledgeHitRate: 0.5, translationPrecision: 0.1 });
  const m2 = createMetrics({ knowledgeHitRate: 0.5, translationPrecision: 0.9 });
  expect(lyapunov.evaluate(m1)).toBe(lyapunov.evaluate(m2));
});

test('knowledgeHitRateLyapunov is independent of convergenceVelocity', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  const m1 = createMetrics({ knowledgeHitRate: 0.5, convergenceVelocity: 0 });
  const m2 = createMetrics({ knowledgeHitRate: 0.5, convergenceVelocity: 1 });
  expect(lyapunov.evaluate(m1)).toBe(lyapunov.evaluate(m2));
});

// ─── Law: compositeLyapunov symmetry with equal weights ───

test('compositeLyapunov with equal weights is symmetric in metric order', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const m1 = createMetrics({ knowledgeHitRate: 0.3, proposalYield: 0.7, translationPrecision: 0.5 });
  const m2 = createMetrics({ knowledgeHitRate: 0.7, proposalYield: 0.5, translationPrecision: 0.3 });
  // Same set of values {0.3, 0.5, 0.7} => same weighted average
  expect(lyapunov.evaluate(m1)).toBeCloseTo(lyapunov.evaluate(m2), 10);
});

// ─── Law: compositeLyapunov energy is bounded in [0, 1] for metrics in [0, 1] ───

test('compositeLyapunov energy is in [0, 1] for metrics in [0, 1]', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 3,
    proposalYield: 2,
    translationPrecision: 1,
  });
  const testSets: ReadonlyArray<Partial<StabilityMetrics>> = [
    { knowledgeHitRate: 0, proposalYield: 0, translationPrecision: 0 },
    { knowledgeHitRate: 1, proposalYield: 1, translationPrecision: 1 },
    { knowledgeHitRate: 0.5, proposalYield: 0.5, translationPrecision: 0.5 },
    { knowledgeHitRate: 0, proposalYield: 1, translationPrecision: 0.5 },
    { knowledgeHitRate: 1, proposalYield: 0, translationPrecision: 0 },
  ];
  for (const overrides of testSets) {
    const energy = lyapunov.evaluate(createMetrics(overrides));
    expect(energy).toBeGreaterThanOrEqual(0);
    expect(energy).toBeLessThanOrEqual(1);
  }
});

// ─── Law: deriveTerminationBound is monotonic in rate ───

test('deriveTerminationBound is non-increasing as rate increases', () => {
  const rates = [0.01, 0.05, 0.1, 0.2, 0.5];
  const bounds = rates.map((r) => deriveTerminationBound(r, 1.0, 0.0));
  for (let i = 1; i < bounds.length; i++) {
    expect(bounds[i]!).toBeLessThanOrEqual(bounds[i - 1]!);
  }
});

// ─── Law: deriveTerminationBound is non-decreasing as gap increases ───

test('deriveTerminationBound is non-decreasing as initial-target gap increases', () => {
  const gaps = [0.1, 0.3, 0.5, 0.8, 1.0];
  const bounds = gaps.map((gap) => deriveTerminationBound(0.1, gap, 0.0));
  for (let i = 1; i < bounds.length; i++) {
    expect(bounds[i]!).toBeGreaterThanOrEqual(bounds[i - 1]!);
  }
});

// ─── Law: isMonotonicallyDecreasing with epsilon=0 is strict non-increasing ───

test('isMonotonicallyDecreasing with epsilon=0 is strict non-increasing check', () => {
  expect(isMonotonicallyDecreasing([1.0, 1.0, 1.0], 0)).toBe(true); // equal is OK
  expect(isMonotonicallyDecreasing([1.0, 0.9, 0.9], 0)).toBe(true);
  expect(isMonotonicallyDecreasing([1.0, 1.0001, 0.9], 0)).toBe(false);
});

// ─── Law: isFixedPoint requires sufficient window ───

test('isFixedPoint with empty array returns false for any windowSize > 0', () => {
  expect(isFixedPoint([], 1, 0)).toBe(false);
  expect(isFixedPoint([], 3, 0.01)).toBe(false);
});

test('isFixedPoint with exact windowSize values returns true if flat', () => {
  expect(isFixedPoint([0.5, 0.5, 0.5], 3, 0.01)).toBe(true);
});

// ─── Law: estimateRateOfDecrease with mixed behavior ───

test('estimateRateOfDecrease with alternating up/down averages only decreases', () => {
  // Pairs: (1.0, 0.5)=0.5 decrease, (0.5, 0.8)=increase, (0.8, 0.3)=0.5 decrease
  const rate = estimateRateOfDecrease([1.0, 0.5, 0.8, 0.3]);
  expect(rate).toBeCloseTo(0.5, 10);
});

test('estimateRateOfDecrease with two values returns the decrease', () => {
  expect(estimateRateOfDecrease([0.9, 0.7])).toBeCloseTo(0.2, 10);
});

test('estimateRateOfDecrease with large decreasing sequence', () => {
  const values = Array.from({ length: 50 }, (_, i) => 1.0 - i * 0.02);
  const rate = estimateRateOfDecrease(values);
  expect(rate).toBeCloseTo(0.02, 5);
});

// ─── Law: deriveTerminationBound with rate=1 gives exact gap as bound ───

test('deriveTerminationBound with rate=1 returns ceiling of gap', () => {
  expect(deriveTerminationBound(1, 3.5, 0)).toBe(4);
  expect(deriveTerminationBound(1, 5.0, 0)).toBe(5);
  expect(deriveTerminationBound(1, 0.1, 0)).toBe(1);
});

// ─── Law: compositeLyapunov improving all metrics decreases energy ───

test('compositeLyapunov energy decreases when all metrics improve', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const before = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.3, proposalYield: 0.3, translationPrecision: 0.3 }));
  const after = lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.7, proposalYield: 0.7, translationPrecision: 0.7 }));
  expect(after).toBeLessThan(before);
});

// ─── Law: Lyapunov triangle — composite bounds ───

test('compositeLyapunov energy is between min and max individual energies', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 1,
    proposalYield: 1,
    translationPrecision: 1,
  });
  const m = createMetrics({ knowledgeHitRate: 0.8, proposalYield: 0.2, translationPrecision: 0.5 });
  const energy = lyapunov.evaluate(m);
  const individualEnergies = [1 - 0.8, 1 - 0.2, 1 - 0.5];
  expect(energy).toBeGreaterThanOrEqual(Math.min(...individualEnergies));
  expect(energy).toBeLessThanOrEqual(Math.max(...individualEnergies));
});

// ─── Law: deriveTerminationBound identity — rate=gap yields bound=1 ───

test('deriveTerminationBound returns 1 when rate equals gap', () => {
  expect(deriveTerminationBound(0.5, 0.5, 0)).toBe(1);
  expect(deriveTerminationBound(0.3, 0.3, 0)).toBe(1);
});

// ─── Law: isMonotonicallyDecreasing is reflexive for single-step sequences ───

test('isMonotonicallyDecreasing is true for any two-element non-increasing pair', () => {
  expect(isMonotonicallyDecreasing([0.8, 0.3], 0)).toBe(true);
  expect(isMonotonicallyDecreasing([0.5, 0.5], 0)).toBe(true);
});

// ─── Law: isFixedPoint with large window on short sequence returns false ───

test('isFixedPoint with windowSize > values.length returns false', () => {
  expect(isFixedPoint([0.5, 0.5], 5, 0.01)).toBe(false);
});

// ─── Law: estimateRateOfDecrease ignores zero-decreases ───

test('estimateRateOfDecrease ignores pairs where values are equal', () => {
  // (1.0, 1.0) = 0 (not counted), (1.0, 0.5) = 0.5
  const rate = estimateRateOfDecrease([1.0, 1.0, 0.5]);
  expect(rate).toBeCloseTo(0.5, 10);
});

// ─── Law: compositeLyapunov with zero total weight edge ───

test('compositeLyapunov with single nonzero weight reduces to that metric', () => {
  const lyapunov = compositeLyapunov({
    knowledgeHitRate: 0,
    proposalYield: 5,
    translationPrecision: 0,
  });
  const m = createMetrics({ proposalYield: 0.7 });
  expect(lyapunov.evaluate(m)).toBeCloseTo(1 - 0.7, 10);
});

// ─── Law: knowledgeHitRateLyapunov at boundary values ───

test('knowledgeHitRateLyapunov at 0.5 returns 0.5', () => {
  const lyapunov = knowledgeHitRateLyapunov();
  expect(lyapunov.evaluate(createMetrics({ knowledgeHitRate: 0.5 }))).toBeCloseTo(0.5, 10);
});

// ─── Law: isMonotonicallyDecreasing with two elements edge ───

test('isMonotonicallyDecreasing increasing two-element pair returns false', () => {
  expect(isMonotonicallyDecreasing([0.3, 0.8], 0)).toBe(false);
});

// ─── Law: deriveTerminationBound with very small rate gives large bound ───

test('deriveTerminationBound with tiny rate gives large bound', () => {
  const bound = deriveTerminationBound(0.001, 1.0, 0);
  expect(bound).toBe(1000);
});

// ─── Law: isFixedPoint detects near-convergence ───

test('isFixedPoint with epsilon exceeding spread returns true', () => {
  // Window: [0.5, 0.505] => spread = 0.005, epsilon = 0.01
  expect(isFixedPoint([0.5, 0.505], 2, 0.01)).toBe(true);
});

test('isFixedPoint with epsilon just below spread returns false', () => {
  expect(isFixedPoint([0.5, 0.52], 2, 0.01)).toBe(false);
});

// ─── Law: estimateRateOfDecrease with single large drop ───

test('estimateRateOfDecrease captures large single drop correctly', () => {
  const rate = estimateRateOfDecrease([1.0, 0.0]);
  expect(rate).toBeCloseTo(1.0, 10);
});

import { expect, test } from '@playwright/test';
import {
  compoundingObligation,
  DIRECT_TRAJECTORY_SAMPLES,
  leastSquaresSlope,
  MIN_TRAJECTORY_SAMPLES,
  trajectoryDirection,
  trajectoryMeasurementClass,
  trajectoryRisk,
  type CompoundingTrajectory,
} from '../../workshop/metrics/compounding';

const ascending: CompoundingTrajectory = {
  samples: [
    { maturity: 1, value: 0.2 },
    { maturity: 2, value: 0.4 },
    { maturity: 3, value: 0.6 },
    { maturity: 4, value: 0.8 },
  ],
  direction: 'higher-is-better',
};

const descending: CompoundingTrajectory = {
  samples: [
    { maturity: 1, value: 0.8 },
    { maturity: 2, value: 0.5 },
    { maturity: 3, value: 0.2 },
  ],
  direction: 'higher-is-better',
};

const flat: CompoundingTrajectory = {
  samples: [
    { maturity: 1, value: 0.5 },
    { maturity: 2, value: 0.5 },
    { maturity: 3, value: 0.5 },
  ],
  direction: 'higher-is-better',
};

// ─── Slope ─────────────────────────────────────────────────────────

test('leastSquaresSlope: perfect linear ascending → +0.2 per maturity step', () => {
  expect(leastSquaresSlope(ascending.samples)).toBeCloseTo(0.2, 12);
});

test('leastSquaresSlope: flat → 0', () => {
  expect(leastSquaresSlope(flat.samples)).toBeCloseTo(0, 12);
});

test('leastSquaresSlope: empty → 0', () => {
  expect(leastSquaresSlope([])).toBe(0);
});

// ─── Direction ─────────────────────────────────────────────────────

test('ascending trajectory in higher-is-better direction → ascending', () => {
  expect(trajectoryDirection(ascending)).toBe('ascending');
});

test('descending trajectory in higher-is-better direction → descending', () => {
  expect(trajectoryDirection(descending)).toBe('descending');
});

test('flat trajectory → flat', () => {
  expect(trajectoryDirection(flat)).toBe('flat');
});

test('ascending in lower-is-better direction is reported as descending', () => {
  // novelty: rising values are bad
  const noveltyRising: CompoundingTrajectory = {
    samples: [{ maturity: 1, value: 0.2 }, { maturity: 2, value: 0.5 }, { maturity: 3, value: 0.7 }],
    direction: 'lower-is-better',
  };
  expect(trajectoryDirection(noveltyRising)).toBe('descending');
});

test('insufficient samples → insufficient-data', () => {
  expect(trajectoryDirection({ samples: [{ maturity: 1, value: 0.5 }], direction: 'higher-is-better' })).toBe('insufficient-data');
  expect(trajectoryDirection({ samples: [], direction: 'higher-is-better' })).toBe('insufficient-data');
});

// ─── Risk + measurement class ──────────────────────────────────────

test('trajectoryRisk: ascending=0, flat=0.5, descending=0.9, insufficient=0.5', () => {
  expect(trajectoryRisk('ascending')).toBe(0);
  expect(trajectoryRisk('flat')).toBe(0.5);
  expect(trajectoryRisk('descending')).toBe(0.9);
  expect(trajectoryRisk('insufficient-data')).toBe(0.5);
});

test('measurementClass graduates with sample count', () => {
  expect(trajectoryMeasurementClass({ samples: [], direction: 'higher-is-better' })).toBe('derived');
  expect(trajectoryMeasurementClass({ samples: [{ maturity: 1, value: 0 }], direction: 'higher-is-better' })).toBe('derived');
  expect(trajectoryMeasurementClass({ samples: [
    { maturity: 1, value: 0 }, { maturity: 2, value: 0.1 },
  ], direction: 'higher-is-better' })).toBe('heuristic-proxy');
  expect(trajectoryMeasurementClass({ samples: [
    { maturity: 1, value: 0 }, { maturity: 2, value: 0.1 }, { maturity: 3, value: 0.2 },
  ], direction: 'higher-is-better' })).toBe('direct');
});

test('MIN/DIRECT thresholds are sane invariants', () => {
  expect(MIN_TRAJECTORY_SAMPLES).toBeLessThan(DIRECT_TRAJECTORY_SAMPLES);
  expect(MIN_TRAJECTORY_SAMPLES).toBeGreaterThanOrEqual(2);
});

// ─── Obligation builder ────────────────────────────────────────────

test('ascending trajectory → healthy obligation with score 1', () => {
  const obligation = compoundingObligation({
    obligation: 'compounding-economics',
    propertyRefs: ['C', 'M'],
    trajectory: ascending,
    metricName: 'meanReuse',
  });
  expect(obligation.status).toBe('healthy');
  expect(obligation.score).toBe(1);
  expect(obligation.evidence).toContain('ascending');
});

test('descending trajectory → critical obligation with score ≈0.1', () => {
  const obligation = compoundingObligation({
    obligation: 'compounding-economics',
    propertyRefs: ['C', 'M'],
    trajectory: descending,
    metricName: 'meanReuse',
  });
  expect(obligation.status).toBe('critical');
  expect(obligation.score).toBeCloseTo(0.1, 4);
});

test('flat trajectory → watch obligation with score 0.5', () => {
  const obligation = compoundingObligation({
    obligation: 'compounding-economics',
    propertyRefs: ['C', 'M'],
    trajectory: flat,
    metricName: 'meanReuse',
  });
  expect(obligation.status).toBe('watch');
  expect(obligation.score).toBe(0.5);
});

test('insufficient samples → watch (proxy) status', () => {
  const obligation = compoundingObligation({
    obligation: 'compounding-economics',
    propertyRefs: ['C', 'M'],
    trajectory: { samples: [{ maturity: 1, value: 0.5 }], direction: 'higher-is-better' },
    metricName: 'meanReuse',
  });
  expect(obligation.status).toBe('watch');
  expect(obligation.evidence).toContain('insufficient-data');
});

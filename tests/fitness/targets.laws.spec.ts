import { expect, test } from '@playwright/test';
import {
  ALIGNMENT_TARGETS,
  checkTarget,
  hasCriticalFloorViolation,
  targetsByMetric,
  violatedFloors,
  type MetricTarget,
} from '../../lib/domain/fitness/targets';

// ─── checkTarget ──────────────────────────────────────────────────

test('checkTarget: undefined value → unknown', () => {
  const target: MetricTarget = {
    metric: 'effectiveHitRate',
    floor: 0.4,
    direction: 'higher-is-better',
    severity: 'critical-floor',
    rationale: 'test',
  };
  expect(checkTarget(target, undefined)).toBe('unknown');
});

test('checkTarget: NaN → unknown', () => {
  const target = ALIGNMENT_TARGETS[0]!;
  expect(checkTarget(target, NaN)).toBe('unknown');
});

test('checkTarget higher-is-better: at floor → meeting', () => {
  const target: MetricTarget = {
    metric: 'effectiveHitRate',
    floor: 0.4,
    direction: 'higher-is-better',
    severity: 'critical-floor',
    rationale: 'test',
  };
  expect(checkTarget(target, 0.4)).toBe('meeting');
  expect(checkTarget(target, 0.5)).toBe('meeting');
  expect(checkTarget(target, 0.39)).toBe('below-floor');
});

test('checkTarget lower-is-better: at floor → meeting', () => {
  const target: MetricTarget = {
    metric: 'ambiguityRate',
    floor: 0.4,
    direction: 'lower-is-better',
    severity: 'soft',
    rationale: 'test',
  };
  expect(checkTarget(target, 0.4)).toBe('meeting');
  expect(checkTarget(target, 0.3)).toBe('meeting');
  expect(checkTarget(target, 0.41)).toBe('below-floor');
});

// ─── violatedFloors ───────────────────────────────────────────────

test('violatedFloors: empty when everything meets', () => {
  const metrics = {
    effectiveHitRate: 0.7,
    ambiguityRate: 0.1,
    suspensionRate: 0.05,
    degradedLocatorRate: 0.05,
    proposalYield: 0.9,
    recoverySuccessRate: 0.95,
    m5Ratio: 1.5,
    c6HitRate: 0.7,
  };
  expect(violatedFloors(metrics)).toEqual([]);
});

test('violatedFloors: reports each below-floor target', () => {
  const metrics = {
    effectiveHitRate: 0.2, // below critical floor 0.4
    ambiguityRate: 0.6,    // above soft floor 0.4
  };
  const violations = violatedFloors(metrics);
  expect(violations.length).toBe(2);
  expect(violations.some((v) => v.metric === 'effectiveHitRate')).toBe(true);
  expect(violations.some((v) => v.metric === 'ambiguityRate')).toBe(true);
});

test('violatedFloors: missing metrics are not violations (unknown)', () => {
  // No metrics provided at all
  expect(violatedFloors({})).toEqual([]);
});

// ─── hasCriticalFloorViolation ────────────────────────────────────

test('hasCriticalFloorViolation: true only when a critical-floor metric is below floor', () => {
  // effectiveHitRate is critical-floor; ambiguityRate is soft
  const onlyCriticalBad = { effectiveHitRate: 0.2, ambiguityRate: 0.1 };
  expect(hasCriticalFloorViolation(onlyCriticalBad)).toBe(true);

  const onlySoftBad = { effectiveHitRate: 0.7, ambiguityRate: 0.6 };
  expect(hasCriticalFloorViolation(onlySoftBad)).toBe(false);

  const allFine = { effectiveHitRate: 0.7, ambiguityRate: 0.1 };
  expect(hasCriticalFloorViolation(allFine)).toBe(false);
});

test('hasCriticalFloorViolation: empty metrics → false (unknown ≠ violation)', () => {
  expect(hasCriticalFloorViolation({})).toBe(false);
});

// ─── ALIGNMENT_TARGETS structural invariants ─────────────────────

test('ALIGNMENT_TARGETS: at least one critical-floor target', () => {
  const critical = ALIGNMENT_TARGETS.filter((t) => t.severity === 'critical-floor');
  expect(critical.length).toBeGreaterThan(0);
});

test('ALIGNMENT_TARGETS: every target has a non-empty rationale', () => {
  for (const target of ALIGNMENT_TARGETS) {
    expect(target.rationale.length).toBeGreaterThan(0);
  }
});

test('ALIGNMENT_TARGETS: every floor is in [0, 10] (sanity)', () => {
  for (const target of ALIGNMENT_TARGETS) {
    expect(target.floor).toBeGreaterThanOrEqual(0);
    expect(target.floor).toBeLessThanOrEqual(10);
  }
});

test('targetsByMetric: round-trip lookup', () => {
  const map = targetsByMetric();
  expect(map.effectiveHitRate?.metric).toBe('effectiveHitRate');
  expect(map.m5Ratio?.metric).toBe('m5Ratio');
  expect(map.c6HitRate?.metric).toBe('c6HitRate');
});

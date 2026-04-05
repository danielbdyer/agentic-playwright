import { expect, test } from '@playwright/test';
import {
  BINDING_COLORS,
  CONFIDENCE_THRESHOLD,
  computeBreakdown,
  classifyStep,
  computeScenarioDistribution,
  computeAggregateDistribution,
  formatBreakdown,
  stackedBarSegments,
  isWellBound,
  trendArrow,
  trendColor,
  type BindingKind,
  type StepBinding,
} from '../../lib/domain/projection/binding-distribution';

const makeBinding = (kind: BindingKind, confidence: number): StepBinding => ({
  adoId: 'test-1', stepIndex: 0, kind, confidence,
  resolutionRung: kind === 'bound' ? 0 : null,
  element: kind === 'bound' ? 'el1' : null,
  screen: 'screen1',
});

test.describe('BindingDistribution laws', () => {

  test('Law 1: exactly 3 binding kinds with colors', () => {
    const kinds: BindingKind[] = ['bound', 'deferred', 'unbound'];
    kinds.forEach((kind) => {
      expect(BINDING_COLORS[kind]).toMatch(/^#[0-9a-f]{6}$/i);
    });
  });

  test('Law 2: computeBreakdown sums to 1 for non-zero input', () => {
    const bd = computeBreakdown(7, 2, 1);
    expect(bd.bound + bd.deferred + bd.unbound).toBeCloseTo(1.0, 5);
  });

  test('Law 3: computeBreakdown returns zeros for zero input', () => {
    const bd = computeBreakdown(0, 0, 0);
    expect(bd.bound).toBe(0);
    expect(bd.deferred).toBe(0);
    expect(bd.unbound).toBe(0);
  });

  test('Law 4: classifyStep downgrades low-confidence bound to deferred', () => {
    expect(classifyStep('bound', 0.5)).toBe('deferred');
    expect(classifyStep('bound', CONFIDENCE_THRESHOLD)).toBe('bound');
  });

  test('Law 5: classifyStep preserves deferred and unbound', () => {
    expect(classifyStep('deferred', 0.9)).toBe('deferred');
    expect(classifyStep('unbound', 0.1)).toBe('unbound');
  });

  test('Law 6: computeScenarioDistribution counts correctly', () => {
    const bindings = [
      makeBinding('bound', 0.9),
      makeBinding('bound', 0.8),
      makeBinding('deferred', 0.5),
      makeBinding('unbound', 0.1),
    ];
    const dist = computeScenarioDistribution('test-1', bindings);
    expect(dist.totalSteps).toBe(4);
    expect(dist.boundCount).toBe(2);
    expect(dist.deferredCount).toBe(1);
    expect(dist.unboundCount).toBe(1);
  });

  test('Law 7: scenario breakdown sums to 1', () => {
    const bindings = [
      makeBinding('bound', 0.9),
      makeBinding('deferred', 0.5),
      makeBinding('unbound', 0.1),
    ];
    const dist = computeScenarioDistribution('test-1', bindings);
    expect(dist.breakdown.bound + dist.breakdown.deferred + dist.breakdown.unbound)
      .toBeCloseTo(1.0, 5);
  });

  test('Law 8: computeAggregateDistribution sums across scenarios', () => {
    const s1 = computeScenarioDistribution('s1', [
      makeBinding('bound', 0.9), makeBinding('bound', 0.8),
    ]);
    const s2 = computeScenarioDistribution('s2', [
      makeBinding('unbound', 0.1),
    ]);
    const agg = computeAggregateDistribution([s1, s2]);
    expect(agg.totalSteps).toBe(3);
    expect(agg.totalBound).toBe(2);
    expect(agg.totalUnbound).toBe(1);
  });

  test('Law 9: aggregate trend detecting improvement', () => {
    const s = computeScenarioDistribution('s1', [makeBinding('bound', 0.9)]);
    const agg = computeAggregateDistribution([s], 0.5);
    expect(agg.trend).toBe('improving');
  });

  test('Law 10: aggregate trend detecting degradation', () => {
    const s = computeScenarioDistribution('s1', [makeBinding('unbound', 0.1)]);
    const agg = computeAggregateDistribution([s], 0.9);
    expect(agg.trend).toBe('degrading');
  });

  test('Law 11: aggregate trend detecting stability', () => {
    const s = computeScenarioDistribution('s1', [makeBinding('bound', 0.9)]);
    const agg = computeAggregateDistribution([s], 1.0);
    expect(agg.trend).toBe('stable');
  });

  test('Law 12: formatBreakdown produces human-readable string', () => {
    const str = formatBreakdown({ bound: 0.72, deferred: 0.2, unbound: 0.08 });
    expect(str).toContain('72%');
    expect(str).toContain('bound');
    expect(str).toContain('deferred');
    expect(str).toContain('unbound');
  });

  test('Law 13: stackedBarSegments returns 3 segments with correct colors', () => {
    const segs = stackedBarSegments({ bound: 0.7, deferred: 0.2, unbound: 0.1 });
    expect(segs).toHaveLength(3);
    expect(segs[0]!.color).toBe(BINDING_COLORS.bound);
    expect(segs[1]!.color).toBe(BINDING_COLORS.deferred);
    expect(segs[2]!.color).toBe(BINDING_COLORS.unbound);
  });

  test('Law 14: isWellBound returns true for 70%+ bound', () => {
    const good = computeScenarioDistribution('s1', [
      makeBinding('bound', 0.9), makeBinding('bound', 0.8),
      makeBinding('bound', 0.9), makeBinding('unbound', 0.1),
    ]);
    expect(isWellBound(good)).toBe(true);

    const bad = computeScenarioDistribution('s2', [
      makeBinding('bound', 0.9), makeBinding('unbound', 0.1),
      makeBinding('unbound', 0.1), makeBinding('unbound', 0.1),
    ]);
    expect(isWellBound(bad)).toBe(false);
  });

  test('Law 15: trendArrow returns arrow characters', () => {
    expect(trendArrow('improving')).toBe('↑');
    expect(trendArrow('stable')).toBe('→');
    expect(trendArrow('degrading')).toBe('↓');
  });

  test('Law 16: trendColor returns hex colors', () => {
    expect(trendColor('improving')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(trendColor('stable')).toMatch(/^#[0-9a-f]{6}$/i);
    expect(trendColor('degrading')).toMatch(/^#[0-9a-f]{6}$/i);
  });
});

/**
 * Memory Maturity Trajectory Laws (Phase B item 8)
 *
 * Asserts the trajectory algebra is deterministic, monotone-aware,
 * and produces correct slopes for known point sequences.
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 8
 */
import { describe, test, expect } from 'vitest';
import { computeMemoryMaturity, ZERO_MATURITY } from '../../workshop/metrics/memory-maturity';
import type { MemoryMaturityCounts } from '../../workshop/metrics/memory-maturity';
import {
  EMPTY_TRAJECTORY,
  appendPoint,
  trajectoryFrom,
  trajectorySlope,
  cohortSlice,
  cohortIds,
  isComparableAt,
  latestMaturity,
  latestHitRate,
  type MemoryMaturityPoint,
} from '../../workshop/metrics/memory-maturity-trajectory';

function makePoint(overrides: Partial<MemoryMaturityPoint> & { effectiveHitRate: number }): MemoryMaturityPoint {
  const counts: MemoryMaturityCounts = {
    approvedElements: (overrides as { approvedElements?: number }).approvedElements ?? 0,
    promotedPatterns: 0,
    approvedRouteVariants: 0,
  };
  return {
    cohortId: overrides.cohortId ?? 'test-cohort',
    observedAt: overrides.observedAt ?? '2026-01-01T00:00:00.000Z',
    maturity: overrides.maturity ?? computeMemoryMaturity(counts),
    counts,
    effectiveHitRate: overrides.effectiveHitRate,
    iteration: overrides.iteration,
    runId: overrides.runId,
  };
}

describe('Memory maturity trajectory laws', () => {
  // ─── Law 1: Empty trajectory slope is zero ──────────────────

  test('Law 1: empty trajectory has slope 0', () => {
    expect(trajectorySlope(EMPTY_TRAJECTORY)).toBe(0);
  });

  // ─── Law 2: Single-point trajectory slope is zero ───────────

  test('Law 2: single-point trajectory has slope 0', () => {
    const t = trajectoryFrom([makePoint({ effectiveHitRate: 0.5 })]);
    expect(trajectorySlope(t)).toBe(0);
  });

  // ─── Law 3: Determinism ─────────────────────────────────────

  test('Law 3: same point sequence produces same slope', () => {
    const points = [
      makePoint({ effectiveHitRate: 0.3, maturity: computeMemoryMaturity({ approvedElements: 5, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.6, maturity: computeMemoryMaturity({ approvedElements: 15, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-02T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.8, maturity: computeMemoryMaturity({ approvedElements: 30, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-03T00:00:00Z' }),
    ];
    const a = trajectorySlope(trajectoryFrom(points));
    const b = trajectorySlope(trajectoryFrom(points));
    expect(a).toBe(b);
  });

  // ─── Law 4: Monotone positive input → positive slope ────────

  test('Law 4: increasing maturity with increasing hit rate produces positive slope', () => {
    const t = trajectoryFrom([
      makePoint({ effectiveHitRate: 0.2, maturity: computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.5, maturity: computeMemoryMaturity({ approvedElements: 10, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-02T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.9, maturity: computeMemoryMaturity({ approvedElements: 50, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(trajectorySlope(t)).toBeGreaterThan(0);
  });

  // ─── Law 5: Monotone negative input → negative slope ────────

  test('Law 5: increasing maturity with decreasing hit rate produces negative slope', () => {
    const t = trajectoryFrom([
      makePoint({ effectiveHitRate: 0.9, maturity: computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.5, maturity: computeMemoryMaturity({ approvedElements: 10, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-02T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.2, maturity: computeMemoryMaturity({ approvedElements: 50, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(trajectorySlope(t)).toBeLessThan(0);
  });

  // ─── Law 6: before == after → zero impact (flat) ───────────

  test('Law 6: constant hit rate across maturity levels produces ~zero slope', () => {
    const t = trajectoryFrom([
      makePoint({ effectiveHitRate: 0.5, maturity: computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.5, maturity: computeMemoryMaturity({ approvedElements: 50, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(Math.abs(trajectorySlope(t))).toBeLessThan(0.001);
  });

  // ─── Law 7: Cohort comparability ────────────────────────────

  test('Law 7: isComparableAt returns true for same cohort, false for different', () => {
    const a = makePoint({ cohortId: 'cohort-A', effectiveHitRate: 0.5 });
    const b = makePoint({ cohortId: 'cohort-A', effectiveHitRate: 0.6 });
    const c = makePoint({ cohortId: 'cohort-B', effectiveHitRate: 0.7 });
    expect(isComparableAt(a, b)).toBe(true);
    expect(isComparableAt(a, c)).toBe(false);
  });

  // ─── Law 8: Cohort slicing ──────────────────────────────────

  test('Law 8: cohortSlice returns only points for the specified cohort', () => {
    const t = trajectoryFrom([
      makePoint({ cohortId: 'A', effectiveHitRate: 0.3, observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ cohortId: 'B', effectiveHitRate: 0.5, observedAt: '2026-01-02T00:00:00Z' }),
      makePoint({ cohortId: 'A', effectiveHitRate: 0.7, observedAt: '2026-01-03T00:00:00Z' }),
    ]);
    const sliceA = cohortSlice(t, 'A');
    expect(sliceA.points.length).toBe(2);
    expect(sliceA.points.every(p => p.cohortId === 'A')).toBe(true);
  });

  // ─── Law 9: Distinct cohort IDs ─────────────────────────────

  test('Law 9: cohortIds returns sorted distinct cohort identities', () => {
    const t = trajectoryFrom([
      makePoint({ cohortId: 'B', effectiveHitRate: 0.3, observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ cohortId: 'A', effectiveHitRate: 0.5, observedAt: '2026-01-02T00:00:00Z' }),
      makePoint({ cohortId: 'B', effectiveHitRate: 0.7, observedAt: '2026-01-03T00:00:00Z' }),
    ]);
    expect(cohortIds(t)).toEqual(['A', 'B']);
  });

  // ─── Law 10: appendPoint is immutable ───────────────────────

  test('Law 10: appendPoint does not mutate the original trajectory', () => {
    const original = EMPTY_TRAJECTORY;
    const extended = appendPoint(original, makePoint({ effectiveHitRate: 0.5 }));
    expect(original.points.length).toBe(0);
    expect(extended.points.length).toBe(1);
  });

  // ─── Law 11: latestMaturity and latestHitRate ───────────────

  test('Law 11: latestMaturity returns ZERO_MATURITY for empty, last value for non-empty', () => {
    expect(latestMaturity(EMPTY_TRAJECTORY)).toBe(ZERO_MATURITY);
    const t = trajectoryFrom([
      makePoint({ effectiveHitRate: 0.3, maturity: computeMemoryMaturity({ approvedElements: 5, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-01T00:00:00Z' }),
      makePoint({ effectiveHitRate: 0.7, maturity: computeMemoryMaturity({ approvedElements: 20, promotedPatterns: 0, approvedRouteVariants: 0 }), observedAt: '2026-01-02T00:00:00Z' }),
    ]);
    expect(latestMaturity(t)).toBe(computeMemoryMaturity({ approvedElements: 20, promotedPatterns: 0, approvedRouteVariants: 0 }));
    expect(latestHitRate(t)).toBe(0.7);
  });
});

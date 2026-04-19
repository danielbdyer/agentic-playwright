import { expect, test } from '@playwright/test';
import {
  compareMaturity,
  computeMemoryMaturity,
  emptyMemoryMaturityCounts,
  maturityDelta,
  memoryMaturityEntryCount,
  ZERO_MATURITY,
} from '../../workshop/metrics/memory-maturity';

// ─── Identity / baseline ───────────────────────────────────────────

test('M(empty) === 0 — baseline at t=0', () => {
  expect(computeMemoryMaturity(emptyMemoryMaturityCounts)).toBe(0);
  expect(ZERO_MATURITY).toBe(0);
});

test('memoryMaturityEntryCount on empty counts is 0', () => {
  expect(memoryMaturityEntryCount(emptyMemoryMaturityCounts)).toBe(0);
});

// ─── Log-scale identities ──────────────────────────────────────────

test('log-scale: M with 1 entry === log2(2) === 1', () => {
  const m = computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 });
  expect(m).toBeCloseTo(1, 12);
});

test('log-scale: M with 3 entries === log2(4) === 2', () => {
  const m = computeMemoryMaturity({ approvedElements: 3, promotedPatterns: 0, approvedRouteVariants: 0 });
  expect(m).toBeCloseTo(2, 12);
});

test('doubling total entry count adds exactly 1 to M', () => {
  const small = computeMemoryMaturity({ approvedElements: 7, promotedPatterns: 0, approvedRouteVariants: 0 });
  // 7 entries → log2(8) = 3. 15 entries → log2(16) = 4. Doubling (7 → 15
  // means n+1 → 2(n+1)) adds exactly 1.
  const doubled = computeMemoryMaturity({ approvedElements: 15, promotedPatterns: 0, approvedRouteVariants: 0 });
  expect(doubled - small).toBeCloseTo(1, 12);
});

// ─── Monotonicity ──────────────────────────────────────────────────

test('monotonicity: adding any approved entry strictly increases M', () => {
  const before = computeMemoryMaturity({ approvedElements: 5, promotedPatterns: 2, approvedRouteVariants: 1 });
  const afterElement = computeMemoryMaturity({ approvedElements: 6, promotedPatterns: 2, approvedRouteVariants: 1 });
  const afterPattern = computeMemoryMaturity({ approvedElements: 5, promotedPatterns: 3, approvedRouteVariants: 1 });
  const afterRoute = computeMemoryMaturity({ approvedElements: 5, promotedPatterns: 2, approvedRouteVariants: 2 });
  expect(afterElement).toBeGreaterThan(before);
  expect(afterPattern).toBeGreaterThan(before);
  expect(afterRoute).toBeGreaterThan(before);
});

test('M is symmetric across primitive sources (only the total matters)', () => {
  const a = computeMemoryMaturity({ approvedElements: 4, promotedPatterns: 0, approvedRouteVariants: 0 });
  const b = computeMemoryMaturity({ approvedElements: 0, promotedPatterns: 4, approvedRouteVariants: 0 });
  const c = computeMemoryMaturity({ approvedElements: 0, promotedPatterns: 0, approvedRouteVariants: 4 });
  const split = computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 2, approvedRouteVariants: 1 });
  expect(a).toBe(b);
  expect(b).toBe(c);
  expect(c).toBe(split);
});

// ─── Comparison + delta ────────────────────────────────────────────

test('compareMaturity is total order on the underlying scalar', () => {
  const small = computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 });
  const large = computeMemoryMaturity({ approvedElements: 100, promotedPatterns: 0, approvedRouteVariants: 0 });
  expect(compareMaturity(small, large)).toBe(-1);
  expect(compareMaturity(large, small)).toBe(1);
  expect(compareMaturity(small, small)).toBe(0);
});

test('maturityDelta is positive when later > earlier', () => {
  const earlier = computeMemoryMaturity({ approvedElements: 3, promotedPatterns: 0, approvedRouteVariants: 0 });
  const later = computeMemoryMaturity({ approvedElements: 7, promotedPatterns: 0, approvedRouteVariants: 0 });
  expect(maturityDelta(earlier, later)).toBeGreaterThan(0);
  expect(maturityDelta(later, earlier)).toBeLessThan(0);
});

test('maturityDelta is exactly the log ratio for doubling', () => {
  const earlier = computeMemoryMaturity({ approvedElements: 1, promotedPatterns: 0, approvedRouteVariants: 0 });
  const later = computeMemoryMaturity({ approvedElements: 3, promotedPatterns: 0, approvedRouteVariants: 0 });
  // 1 entry → log2(2) = 1; 3 entries → log2(4) = 2. Delta = 1 (one doubling).
  expect(maturityDelta(earlier, later)).toBeCloseTo(1, 12);
});

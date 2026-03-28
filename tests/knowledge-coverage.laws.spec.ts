/**
 * Knowledge Coverage — Law Tests (W3.9)
 *
 * Verifies coverage computation, thin-screen detection, and convergence:
 *   - Empty screen has zero coverage
 *   - Coverage is monotonically increasing with more knowledge
 *   - Thin screens are those below threshold
 *   - Aggregate coverage is weighted mean
 *   - Full coverage = converged
 *   - Coverage score is bounded [0, 1]
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import {
  aggregateCoverage,
  computeScreenCoverage,
  findThinScreens,
  isCoverageConverged,
  type KnowledgeCoverage,
} from '../lib/domain/knowledge-coverage';
import { mulberry32, randomWord } from './support/random';

// ─── Helpers ───

function randomScreenCoverage(next: () => number): KnowledgeCoverage {
  const elementCount = Math.floor(next() * 20);
  const hintCount = Math.floor(next() * (elementCount + 5));
  const postureCount = Math.floor(next() * (elementCount + 5));
  return computeScreenCoverage(
    randomWord(next),
    elementCount,
    hintCount,
    postureCount,
  );
}

function randomCoverages(next: () => number, count: number): readonly KnowledgeCoverage[] {
  return Array.from({ length: count }, (_, i) => {
    const c = randomScreenCoverage(next);
    return { ...c, screenId: `screen-${i}-${c.screenId}` };
  });
}

// ─── Law 1: Empty screen has zero coverage ───

test('empty screen has zero coverage (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const screenId = randomWord(next);
    const hintCount = Math.floor(next() * 10);
    const postureCount = Math.floor(next() * 10);

    const coverage = computeScreenCoverage(screenId, 0, hintCount, postureCount);
    expect(coverage.coverageScore).toBe(0);
  }
});

// ─── Law 2: Coverage is monotonically increasing with more knowledge ───

test('coverage is monotonically increasing with more hints and postures (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const screenId = randomWord(next);
    const elementCount = 1 + Math.floor(next() * 20);

    // Monotonically add hints
    let prevScore = 0;
    for (let hints = 0; hints <= elementCount; hints += 1) {
      const coverage = computeScreenCoverage(screenId, elementCount, hints, 0);
      expect(coverage.coverageScore).toBeGreaterThanOrEqual(prevScore);
      prevScore = coverage.coverageScore;
    }

    // Monotonically add postures with full hints
    prevScore = 0;
    for (let postures = 0; postures <= elementCount; postures += 1) {
      const coverage = computeScreenCoverage(screenId, elementCount, elementCount, postures);
      expect(coverage.coverageScore).toBeGreaterThanOrEqual(prevScore);
      prevScore = coverage.coverageScore;
    }
  }
});

// ─── Law 3: Thin screens are those below threshold ───

test('thin screens are exactly those below threshold (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const coverages = randomCoverages(next, 2 + Math.floor(next() * 8));
    const threshold = next();

    const thin = findThinScreens(coverages, threshold);
    const expectedThin = coverages.filter((c) => c.coverageScore < threshold);

    expect(thin.length).toBe(expectedThin.length);
    for (const t of thin) {
      expect(t.coverageScore).toBeLessThan(threshold);
    }
    // All non-thin screens are at or above threshold
    const nonThin = coverages.filter((c) => c.coverageScore >= threshold);
    for (const nt of nonThin) {
      expect(thin.find((t) => t.screenId === nt.screenId)).toBeUndefined();
    }
  }
});

// ─── Law 4: Aggregate coverage is weighted mean ───

test('aggregate coverage is weighted mean by element count (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const coverages = randomCoverages(next, 2 + Math.floor(next() * 8));

    const totalElements = coverages.reduce((s, c) => s + c.elementCount, 0);
    if (totalElements === 0) {
      expect(aggregateCoverage(coverages)).toBe(0);
      continue;
    }

    const expectedWeightedMean =
      coverages.reduce((s, c) => s + c.coverageScore * c.elementCount, 0) / totalElements;

    expect(aggregateCoverage(coverages)).toBeCloseTo(expectedWeightedMean, 12);
  }
});

// ─── Law 5: Full coverage = converged ───

test('full coverage screens are converged at any threshold <= 1 (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const count = 1 + Math.floor(next() * 5);
    const coverages = Array.from({ length: count }, () => {
      const elementCount = 1 + Math.floor(next() * 10);
      return computeScreenCoverage(
        randomWord(next),
        elementCount,
        elementCount,  // full hints
        elementCount,  // full postures
      );
    });

    // Full coverage should give score of 1.0
    for (const c of coverages) {
      expect(c.coverageScore).toBeCloseTo(1.0, 10);
    }

    const threshold = next(); // 0–1
    expect(isCoverageConverged(coverages, threshold)).toBe(true);
  }
});

// ─── Law 6: Coverage score is bounded [0, 1] ───

test('coverage score is bounded [0, 1] (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const coverages = randomCoverages(next, 3 + Math.floor(next() * 10));

    for (const c of coverages) {
      expect(c.coverageScore).toBeGreaterThanOrEqual(0);
      expect(c.coverageScore).toBeLessThanOrEqual(1);
    }

    const agg = aggregateCoverage(coverages);
    expect(agg).toBeGreaterThanOrEqual(0);
    expect(agg).toBeLessThanOrEqual(1);
  }
});

// ─── Edge: empty coverages array ───

test('aggregate of empty array is 0', () => {
  expect(aggregateCoverage([])).toBe(0);
});

test('empty coverages are converged at threshold 0', () => {
  expect(isCoverageConverged([], 0)).toBe(true);
});

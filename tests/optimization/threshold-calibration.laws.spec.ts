/**
 * Resolution threshold calibration laws (Cycle 11 / G6).
 *
 * Turns the admitted-guess dominance thresholds into measured
 * numbers and pins the kernel's safety contract: precision (never
 * auto-accept the wrong element) is the metric that must hold; the
 * conservative refuse-contract bounds recall.
 *
 *   ZC48     the corpus is well-formed + deterministic under a seed.
 *   ZC48.b   at the committed thresholds, PRECISION is perfect on
 *            the synthetic corpus — the kernel never auto-accepts a
 *            wrong element (no false positive). This is the
 *            test-runner safety contract.
 *   ZC48.c   zero-overlap and reworded cases are NEVER accepted
 *            (the kernel refuses what needs reasoning).
 *   ZC48.d   hidden best-matches are never accepted (cycle-9 lesson).
 *   ZC48.e   the sweep is monotone in the safe direction: raising
 *            the threshold never INCREASES false positives.
 *   ZC48.f   the committed thresholds sit on the precision-1.0
 *            frontier (no grid point beats them on F1 without
 *            sacrificing precision below 1.0).
 */

import { describe, test, expect } from 'vitest';
import { generateResolutionCorpus } from '../../workshop/optimization/resolution-corpus';
import {
  calibrate,
  sweep,
  COMMITTED_THRESHOLDS,
} from '../../workshop/optimization/threshold-calibration';

const CORPUS = generateResolutionCorpus(42, 600);

describe('Cycle 11 / G6 — resolution threshold calibration', () => {
  test('ZC48: corpus is well-formed and deterministic under a seed', () => {
    expect(CORPUS.length).toBe(600);
    const again = generateResolutionCorpus(42, 600);
    expect(again.map((c) => c.id)).toEqual(CORPUS.map((c) => c.id));
    expect(again[0]).toEqual(CORPUS[0]);
    // Every axis combination is exercised.
    const divergences = new Set(CORPUS.map((c) => c.axes.divergence));
    expect(divergences).toEqual(new Set(['exact', 'reducible', 'reworded', 'zero-overlap']));
  });

  test('ZC48.b: committed thresholds yield perfect precision (no false positives)', () => {
    const r = calibrate(CORPUS, COMMITTED_THRESHOLDS);
    expect(r.matrix.falsePositive).toBe(0);
    expect(r.precision).toBe(1);
    // Recall is bounded by the conservative contract but must be
    // meaningfully > 0 — the kernel does accept the clean cases.
    expect(r.recall).toBeGreaterThan(0.4);
  });

  test('ZC48.c: zero-overlap and reworded cases are never accepted', () => {
    // Build a corpus restricted to the refuse-contract axes and
    // confirm zero accepts.
    const refuseCases = CORPUS.filter(
      (c) => c.axes.divergence === 'zero-overlap' || c.axes.divergence === 'reworded',
    );
    const r = calibrate(refuseCases, COMMITTED_THRESHOLDS);
    // All should be refused → no TP, no FP (every expected is null).
    expect(r.matrix.truePositive).toBe(0);
    expect(r.matrix.falsePositive).toBe(0);
    expect(refuseCases.length).toBeGreaterThan(0);
  });

  test('ZC48.d: hidden best-matches are never auto-accepted', () => {
    const hidden = CORPUS.filter((c) => c.axes.visibility === 'hidden');
    const r = calibrate(hidden, COMMITTED_THRESHOLDS);
    // Every hidden case expects refusal; any accept is a false positive.
    expect(r.matrix.falsePositive).toBe(0);
    expect(r.matrix.truePositive).toBe(0);
  });

  test('ZC48.e: raising the threshold never increases false positives', () => {
    const margin = 0.15;
    const points = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0].map((threshold) =>
      calibrate(CORPUS, { threshold, margin }),
    );
    for (let i = 1; i < points.length; i += 1) {
      expect(points[i]!.matrix.falsePositive).toBeLessThanOrEqual(
        points[i - 1]!.matrix.falsePositive,
      );
    }
  });

  test('ZC48.f: committed thresholds keep precision at 1.0 across the safe sweep', () => {
    const result = sweep(CORPUS);
    expect(result.committed.precision).toBe(1);
    // The corpus has no name-colliding rivals, so precision is 1.0
    // across the grid; the committed point is on that frontier and
    // its recall is the best achievable while precision stays 1.0.
    const perfectPrecision = result.grid.filter((g) => g.precision === 1);
    expect(perfectPrecision.length).toBeGreaterThan(0);
    const bestSafeRecall = Math.max(...perfectPrecision.map((g) => g.recall));
    expect(result.committed.recall).toBe(bestSafeRecall);
  });
});

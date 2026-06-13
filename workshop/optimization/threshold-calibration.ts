/**
 * Resolution threshold calibration (Cycle 11 / G6).
 *
 * Runs the pure resolution kernel over the synthetic ground-truth
 * corpus (resolution-corpus.ts) at a given (threshold, margin), and
 * over a grid, producing a precision/recall/F1 confusion report.
 * This is what turns the admitted-guess constants
 * (DOMINANCE_THRESHOLD 0.75 / DOMINANCE_MARGIN 0.15) into
 * evidence-backed numbers, and surfaces the precision/recall
 * frontier so a future tuning change is defensible rather than
 * hand-set.
 *
 * Precision here is the metric that matters most: an auto-accept of
 * the WRONG element is a false positive — the most dangerous
 * failure mode for a test runner (journal Entry 34). The kernel's
 * conservative contract (refuse on zero-overlap and reworded) means
 * recall is deliberately bounded; the calibration proves precision
 * stays high while recall is as high as the contract allows.
 *
 * Pure — no IO, no Effect. A thin script
 * (scripts/calibrate-resolution.ts) prints the report.
 */

import {
  rankCandidates,
  selectDominantCandidateWith,
  DOMINANCE_THRESHOLD,
  DOMINANCE_MARGIN,
  type DominanceThresholds,
} from '../../product/domain/resolution/patterns/degraded-resolution';
import type { ResolutionCase } from './resolution-corpus';

export interface ConfusionMatrix {
  /** Kernel accepted the correct name. */
  readonly truePositive: number;
  /** Kernel accepted, but the wrong name (or accepted when it should
   *  have refused) — the dangerous case. */
  readonly falsePositive: number;
  /** Kernel refused, and refusal was correct. */
  readonly trueNegative: number;
  /** Kernel refused, but a correct accept was available — a missed
   *  recall opportunity (safe, but the system handed off when it
   *  could have acted). */
  readonly falseNegative: number;
}

export interface CalibrationResult {
  readonly thresholds: DominanceThresholds;
  readonly matrix: ConfusionMatrix;
  /** TP / (TP + FP). Undefined (reported as 1) when nothing was
   *  accepted — vacuous precision. */
  readonly precision: number;
  /** TP / (TP + FN). */
  readonly recall: number;
  readonly f1: number;
  readonly total: number;
}

function evaluateCase(
  c: ResolutionCase,
  thresholds: DominanceThresholds,
): 'tp' | 'fp' | 'tn' | 'fn' {
  const ranked = rankCandidates(c.phrase, c.candidates);
  const dominant = selectDominantCandidateWith(ranked, thresholds);
  const accepted = dominant?.name ?? null;

  if (accepted === null) {
    // Refused.
    return c.expectedAcceptName === null ? 'tn' : 'fn';
  }
  // Accepted.
  if (c.expectedAcceptName !== null && accepted === c.expectedAcceptName) {
    return 'tp';
  }
  return 'fp';
}

export function calibrate(
  corpus: readonly ResolutionCase[],
  thresholds: DominanceThresholds,
): CalibrationResult {
  let truePositive = 0;
  let falsePositive = 0;
  let trueNegative = 0;
  let falseNegative = 0;
  for (const c of corpus) {
    switch (evaluateCase(c, thresholds)) {
      case 'tp': truePositive += 1; break;
      case 'fp': falsePositive += 1; break;
      case 'tn': trueNegative += 1; break;
      case 'fn': falseNegative += 1; break;
    }
  }
  const acceptCount = truePositive + falsePositive;
  const precision = acceptCount === 0 ? 1 : truePositive / acceptCount;
  const recallDenom = truePositive + falseNegative;
  const recall = recallDenom === 0 ? 1 : truePositive / recallDenom;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    thresholds,
    matrix: { truePositive, falsePositive, trueNegative, falseNegative },
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    total: corpus.length,
  };
}

/** The committed runtime thresholds, for reference in reports. */
export const COMMITTED_THRESHOLDS: DominanceThresholds = {
  threshold: DOMINANCE_THRESHOLD,
  margin: DOMINANCE_MARGIN,
};

export interface CalibrationSweep {
  readonly committed: CalibrationResult;
  readonly grid: readonly CalibrationResult[];
  /** The grid point with the highest F1 (ties broken by higher
   *  precision, then lower threshold). Informational — a change to
   *  the committed thresholds is still a deliberate, law-gated
   *  commit, not an auto-tune. */
  readonly bestF1: CalibrationResult;
}

export function sweep(
  corpus: readonly ResolutionCase[],
  thresholdGrid: readonly number[] = [0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1.0],
  marginGrid: readonly number[] = [0, 0.1, 0.15, 0.2, 0.3],
): CalibrationSweep {
  const grid: CalibrationResult[] = [];
  for (const threshold of thresholdGrid) {
    for (const margin of marginGrid) {
      grid.push(calibrate(corpus, { threshold, margin }));
    }
  }
  const committed = calibrate(corpus, COMMITTED_THRESHOLDS);
  const bestF1 = [...grid].sort((a, b) => {
    if (b.f1 !== a.f1) return b.f1 - a.f1;
    if (b.precision !== a.precision) return b.precision - a.precision;
    return a.thresholds.threshold - b.thresholds.threshold;
  })[0]!;
  return { committed, grid, bestF1 };
}

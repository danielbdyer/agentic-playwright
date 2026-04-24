/**
 * Z11a.6 — real intervention-fidelity evaluator + confirmation-rate
 * extended to CompilationReceipts.
 *
 *   ZC43     interventionFidelity over zero-handoff evidence →
 *            inconclusive (empty judgment).
 *   ZC43.b   interventionFidelity with all handoffs valid → confirmed.
 *   ZC43.c   interventionFidelity with some invalid → refuted
 *            when cycleRate < atLeast.
 *   ZC43.d   confirmationRate extended to compilation receipts:
 *            resolvable case resolvedStepCount/total >= atLeast
 *            → confirmed (1 contribution per case, not per step).
 *   ZC43.e   Empty evidence → inconclusive under both kinds.
 */

import { describe, test, expect } from 'vitest';
import { confirmationFromPrediction } from '../../workshop/compounding/application/confirmation-judgments';
import type { HypothesisEvidence } from '../../workshop/compounding/application/filter-evidence';
import type { CompilationReceiptLike } from '../../workshop/compounding/application/ports';
import type { Prediction } from '../../workshop/compounding/domain/prediction';

function cr(
  artifactId: string,
  overrides: Partial<CompilationReceiptLike['payload']>,
): CompilationReceiptLike {
  return {
    fingerprints: { artifact: artifactId },
    payload: {
      adoId: '90001',
      corpus: 'resolvable',
      hypothesisId: null,
      totalStepCount: 4,
      resolvedStepCount: 4,
      needsHumanStepCount: 0,
      blockedStepCount: 0,
      handoffsEmitted: 0,
      handoffsWithValidMissingContext: 0,
      ...overrides,
    },
  };
}

function evidence(
  compilationReceipts: readonly CompilationReceiptLike[],
): HypothesisEvidence {
  return { probeReceipts: [], scenarioReceipts: [], compilationReceipts };
}

const FIDELITY_80: Prediction = { kind: 'intervention-fidelity', atLeast: 0.8, overCycles: 3 };
const RATE_90: Prediction = { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 3 };

describe('Z11a.6 — intervention-fidelity evaluator', () => {
  test('ZC43: zero-handoff evidence → inconclusive', () => {
    const receipts = [cr('sha256:r1', { handoffsEmitted: 0, handoffsWithValidMissingContext: 0 })];
    const j = confirmationFromPrediction(FIDELITY_80, evidence(receipts));
    expect(j.outcome).toBe('inconclusive');
    expect(j.confirmedCount).toBe(0);
    expect(j.refutedCount).toBe(0);
  });

  test('ZC43.b: all handoffs valid → confirmed', () => {
    const receipts = [
      cr('sha256:r1', { corpus: 'needs-human', handoffsEmitted: 3, handoffsWithValidMissingContext: 3 }),
      cr('sha256:r2', { corpus: 'needs-human', handoffsEmitted: 4, handoffsWithValidMissingContext: 4 }),
    ];
    const j = confirmationFromPrediction(FIDELITY_80, evidence(receipts));
    expect(j.outcome).toBe('confirmed');
    expect(j.cycleRate).toBe(1);
    expect(j.confirmedCount).toBe(7);
    expect(j.refutedCount).toBe(0);
  });

  test('ZC43.c: cycleRate below atLeast → refuted', () => {
    // 3 valid / 5 emitted = 0.6 < 0.8.
    const receipts = [
      cr('sha256:r1', { corpus: 'needs-human', handoffsEmitted: 5, handoffsWithValidMissingContext: 3 }),
    ];
    const j = confirmationFromPrediction(FIDELITY_80, evidence(receipts));
    expect(j.outcome).toBe('refuted');
    expect(j.cycleRate).toBeCloseTo(0.6);
  });

  test('ZC43.d: confirmation-rate counts each compilation receipt per-case, not per-step', () => {
    const receipts = [
      cr('sha256:r1', { totalStepCount: 4, resolvedStepCount: 4 }),  // 1.0 ≥ 0.9 → confirmed
      cr('sha256:r2', { totalStepCount: 4, resolvedStepCount: 3 }),  // 0.75 < 0.9 → refuted
    ];
    const j = confirmationFromPrediction(RATE_90, evidence(receipts));
    // 1 confirmed + 1 refuted → cycleRate 0.5 < 0.9 → refuted overall.
    expect(j.confirmedCount).toBe(1);
    expect(j.refutedCount).toBe(1);
    expect(j.cycleRate).toBe(0.5);
    expect(j.outcome).toBe('refuted');
  });

  test('ZC43.e: empty compilation evidence → inconclusive for both prediction kinds', () => {
    const j1 = confirmationFromPrediction(FIDELITY_80, evidence([]));
    expect(j1.outcome).toBe('inconclusive');

    const j2 = confirmationFromPrediction(RATE_90, evidence([]));
    expect(j2.outcome).toBe('inconclusive');
  });
});

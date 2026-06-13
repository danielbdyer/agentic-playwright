/**
 * Public-AUT → compounding-evidence adapter laws (Cycle 11 / G1).
 *
 * Pins the honest mapping from a public-AUT case result to the
 * CompilationReceipt summary the compounding evaluators fold over.
 * These are the load-bearing G1 laws: they prove the empirical
 * cohort can be judged by the existing confirmation-rate and
 * intervention-fidelity evaluators WITHOUT a parallel evaluator,
 * and that the mapping uses the honest G4 denominators (no navigate
 * gimmes).
 *
 *   ZC45     totalSteps/resolvedCount use domTarget* (honest
 *            denominators), not stepCount/stepsMatched.
 *   ZC45.b   handoffsWithValidContextCount == handoffsWithEvidence
 *            (the cycle-10 evidence-carrying-handoff bridge).
 *   ZC45.c   misses = needsHumanCount = handoffsEmittedCount =
 *            domTargetSteps − domTargetMatched; blocked = 0.
 *   ZC45.d   corpus is always 'public-aut'; adoId/contentHash carry
 *            through.
 *   ZC45.e   a fully-resolved case feeds confirmation-rate as a
 *            confirmed receipt; a fully-missed case as refuted —
 *            the existing evaluator, unchanged.
 *   ZC45.f   intervention-fidelity reads handoff counts: a case
 *            whose every miss carried evidence scores cycleRate 1.0.
 */

import { describe, test, expect } from 'vitest';
import { publicAutCaseToCompilationSummary } from '../../workshop/customer-backlog/application/public-aut-evidence';
import type { PublicAutCaseResult } from '../../workshop/customer-backlog/application/public-aut-runner';
import { confirmationFromPrediction } from '../../workshop/compounding/application/confirmation-judgments';
import type { HypothesisEvidence } from '../../workshop/compounding/application/filter-evidence';
import type { CompilationReceiptLike } from '../../workshop/compounding/application/ports';

function caseResult(over: Partial<PublicAutCaseResult>): PublicAutCaseResult {
  return {
    aut: 'todomvc',
    autUrl: 'https://todomvc.com/examples/react/dist/',
    partition: 'training',
    adoId: '91001',
    adoContentHash: 'sha256:fixture',
    title: 'demo',
    stepCount: 3,
    stepOutcomes: [],
    preconditionOutcomes: [],
    preconditionsRan: 0,
    preconditionsSucceeded: 0,
    stepsMatched: 3,
    handoffsEmitted: 0,
    falsePositives: 0,
    verifiedMatches: 0,
    unverifiedSteps: 0,
    domTargetSteps: 2,
    domTargetMatched: 2,
    handoffsWithEvidence: 0,
    elapsedMs: 1234,
    receiptPath: '/dev/null',
    cohortRole: 'training',
    substrateVersion: 'floor-a6-degraded-ladder',
    runStartedAt: '2026-06-13T00:00:00.000Z',
    ...over,
  };
}

/** Lift a summary into the CompilationReceiptLike evidence shape the
 *  evaluators consume, tagged with a hypothesis id. */
function asCompilationEvidence(
  result: PublicAutCaseResult,
  hypothesisId: string,
): CompilationReceiptLike {
  const s = publicAutCaseToCompilationSummary(result);
  return {
    payload: {
      adoId: s.adoId,
      corpus: s.corpus as 'resolvable' | 'needs-human',
      hypothesisId,
      totalStepCount: s.totalSteps,
      resolvedStepCount: s.resolvedCount,
      needsHumanStepCount: s.needsHumanCount,
      blockedStepCount: s.blockedCount,
      handoffsEmitted: s.handoffsEmittedCount,
      handoffsWithValidMissingContext: s.handoffsWithValidContextCount,
    },
    fingerprints: { artifact: `fp:${s.adoId}` },
  };
}

function evidenceOf(receipts: readonly CompilationReceiptLike[]): HypothesisEvidence {
  return { probeReceipts: [], scenarioReceipts: [], compilationReceipts: receipts };
}

describe('Cycle 11 / G1 — public-AUT compounding-evidence adapter', () => {
  test('ZC45: totalSteps/resolvedCount use honest domTarget denominators', () => {
    // stepCount 6 / stepsMatched 4 would be the dishonest headline;
    // the adapter uses domTargetSteps 3 / domTargetMatched 2.
    const s = publicAutCaseToCompilationSummary(
      caseResult({ stepCount: 6, stepsMatched: 4, domTargetSteps: 3, domTargetMatched: 2 }),
    );
    expect(s.totalSteps).toBe(3);
    expect(s.resolvedCount).toBe(2);
  });

  test('ZC45.b: handoffsWithValidContextCount bridges from handoffsWithEvidence', () => {
    const s = publicAutCaseToCompilationSummary(
      caseResult({ domTargetSteps: 3, domTargetMatched: 1, handoffsWithEvidence: 2 }),
    );
    expect(s.handoffsWithValidContextCount).toBe(2);
  });

  test('ZC45.c: misses derive needsHuman + handoffsEmitted; blocked is 0', () => {
    const s = publicAutCaseToCompilationSummary(
      caseResult({ domTargetSteps: 5, domTargetMatched: 2 }),
    );
    expect(s.needsHumanCount).toBe(3);
    expect(s.handoffsEmittedCount).toBe(3);
    expect(s.blockedCount).toBe(0);
  });

  test('ZC45.d: corpus is public-aut; adoId carries through', () => {
    const s = publicAutCaseToCompilationSummary(caseResult({ adoId: '91301' }));
    expect(s.corpus).toBe('public-aut');
    expect(s.adoId).toBe('91301');
    expect(s.perStepOutcomes).toEqual([]);
  });

  test('ZC45.e: confirmation-rate judges a public-AUT receipt unchanged', () => {
    const resolved = asCompilationEvidence(
      caseResult({ domTargetSteps: 3, domTargetMatched: 3 }),
      'H1',
    );
    const missed = asCompilationEvidence(
      caseResult({ adoId: '91002', domTargetSteps: 3, domTargetMatched: 0, handoffsWithEvidence: 0 }),
      'H1',
    );

    const confirmedJ = confirmationFromPrediction(
      { kind: 'confirmation-rate', atLeast: 0.66, overCycles: 1 },
      evidenceOf([resolved]),
    );
    expect(confirmedJ.outcome).toBe('confirmed');

    const refutedJ = confirmationFromPrediction(
      { kind: 'confirmation-rate', atLeast: 0.66, overCycles: 1 },
      evidenceOf([missed]),
    );
    expect(refutedJ.outcome).toBe('refuted');
  });

  test('ZC45.f: intervention-fidelity reads the handoff-with-evidence bridge', () => {
    // 3 misses, all carrying evidence → fidelity 3/3 = 1.0 → confirmed.
    const allEvidenced = asCompilationEvidence(
      caseResult({ domTargetSteps: 4, domTargetMatched: 1, handoffsWithEvidence: 3 }),
      'H2',
    );
    const j = confirmationFromPrediction(
      { kind: 'intervention-fidelity', atLeast: 0.9, overCycles: 1 },
      evidenceOf([allEvidenced]),
    );
    expect(j.outcome).toBe('confirmed');
    expect(j.cycleRate).toBe(1);

    // 3 misses, only 1 carrying evidence → fidelity 1/3 ≈ 0.33 → refuted.
    const mostlyEmpty = asCompilationEvidence(
      caseResult({ adoId: '91003', domTargetSteps: 4, domTargetMatched: 1, handoffsWithEvidence: 1 }),
      'H2',
    );
    const j2 = confirmationFromPrediction(
      { kind: 'intervention-fidelity', atLeast: 0.9, overCycles: 1 },
      evidenceOf([mostlyEmpty]),
    );
    expect(j2.outcome).toBe('refuted');
  });
});

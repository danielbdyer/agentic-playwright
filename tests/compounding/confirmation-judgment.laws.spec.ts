/**
 * Z5a — pure derivation laws (filter + judgments + evaluate + build).
 *
 * Per docs/v2-compounding-engine-plan.md §9.5:
 *   ZC15 filterEvidenceForHypothesis returns only receipts whose
 *        payload.hypothesisId matches.
 *   ZC16 confirmation-rate prediction: given 10 receipts, 9
 *        confirming → rate 0.9; atLeast 0.9 → confirmed; 0.95 →
 *        refuted.
 *   ZC17 receipt-family-shift prediction: from='not-visible'
 *        to='matched'; ≥1 matching transition → confirmed; else
 *        refuted.
 *   ZC18 coverage-growth prediction: fromRatio 0.5 → toRatio 0.9;
 *        9/10 passing → confirmed; 5/10 → refuted.
 *   ZC19 regression-freedom prediction: all listed ids pass →
 *        confirmed; any fails → refuted.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  filterEvidenceForHypothesis,
} from '../../workshop/compounding/application/filter-evidence';
import {
  confirmationFromPrediction,
  type Judgment,
} from '../../workshop/compounding/application/confirmation-judgments';
import { evaluateHypothesis } from '../../workshop/compounding/application/evaluate-hypothesis';
import { buildHypothesisReceipt } from '../../workshop/compounding/application/build-hypothesis-receipt';
import {
  hypothesisId,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import type { Prediction } from '../../workshop/compounding/domain/prediction';
import type {
  ProbeReceiptLike,
  ScenarioReceiptLike,
} from '../../workshop/compounding/application/ports';

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');

function baseHypothesis(): Hypothesis {
  return {
    id: hypothesisId('h-1'),
    description: 'test',
    schemaVersion: 1,
    cohort: {
      kind: 'probe-surface',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    },
    prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 1 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test',
    createdAt: PINNED_NOW.toISOString(),
  };
}

function pr(params: {
  readonly hypothesisId: string | null;
  readonly artifact: string;
  readonly completedAsExpected?: boolean;
  readonly verb?: string;
  readonly facetKind?: string;
  readonly expectedClass?: string;
  readonly expectedErr?: string | null;
  readonly observedClass?: string;
  readonly observedErr?: string | null;
  readonly probeId?: string;
}): ProbeReceiptLike {
  const completedAsExpected = params.completedAsExpected ?? true;
  return {
    payload: {
      probeId: params.probeId ?? `probe:${params.artifact}`,
      verb: params.verb ?? 'observe',
      fixtureName: params.artifact,
      hypothesisId: params.hypothesisId,
      outcome: {
        expected: {
          classification: params.expectedClass ?? 'matched',
          errorFamily: params.expectedErr ?? null,
        },
        observed: {
          classification: params.observedClass ?? (completedAsExpected ? 'matched' : 'failed'),
          errorFamily:
            params.observedErr !== undefined
              ? params.observedErr
              : completedAsExpected
                ? null
                : 'not-visible',
        },
        completedAsExpected,
      },
      cohort: {
        verb: params.verb ?? 'observe',
        facetKind: params.facetKind ?? 'element',
        errorFamily: null,
      },
    },
    fingerprints: { artifact: params.artifact },
  };
}

function sr(params: {
  readonly hypothesisId: string | null;
  readonly artifact: string;
  readonly verdict?: string;
  readonly scenarioId?: string;
}): ScenarioReceiptLike {
  return {
    payload: {
      scenarioId: params.scenarioId ?? params.artifact,
      hypothesisId: params.hypothesisId,
      verdict: params.verdict ?? 'trajectory-holds',
    },
    fingerprints: { artifact: params.artifact },
  };
}

describe('Z5a — filterEvidenceForHypothesis (ZC15)', () => {
  test('ZC15.a: returns only probe + scenario receipts whose hypothesisId matches', () => {
    const h = baseHypothesis();
    const probes = [
      pr({ hypothesisId: 'h-1', artifact: 'fp:1' }),
      pr({ hypothesisId: 'h-2', artifact: 'fp:2' }),
      pr({ hypothesisId: null, artifact: 'fp:3' }),
      pr({ hypothesisId: 'h-1', artifact: 'fp:4' }),
    ];
    const scenarios = [
      sr({ hypothesisId: 'h-1', artifact: 'sr:1' }),
      sr({ hypothesisId: null, artifact: 'sr:2' }),
    ];
    const evidence = filterEvidenceForHypothesis(h, probes, scenarios);
    expect(evidence.probeReceipts.map((r) => r.fingerprints.artifact)).toEqual(['fp:1', 'fp:4']);
    expect(evidence.scenarioReceipts.map((r) => r.fingerprints.artifact)).toEqual(['sr:1']);
  });

  test('ZC15.b: empty probes + scenarios yields empty evidence', () => {
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), [], []);
    expect(evidence.probeReceipts).toEqual([]);
    expect(evidence.scenarioReceipts).toEqual([]);
  });
});

describe('Z5a — confirmationFromPrediction (ZC16 — confirmation-rate)', () => {
  test('ZC16: 9/10 confirming at atLeast 0.9 → confirmed', () => {
    const probes = [
      ...Array.from({ length: 9 }, (_, i) => pr({ hypothesisId: 'h-1', artifact: `fp:p${i}`, completedAsExpected: true })),
      pr({ hypothesisId: 'h-1', artifact: 'fp:p9', completedAsExpected: false }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 1 };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.confirmedCount).toBe(9);
    expect(j.refutedCount).toBe(1);
    expect(j.cycleRate).toBeCloseTo(0.9);
    expect(j.outcome).toBe('confirmed');
  });

  test('ZC16.b: 9/10 confirming at atLeast 0.95 → refuted', () => {
    const probes = [
      ...Array.from({ length: 9 }, (_, i) => pr({ hypothesisId: 'h-1', artifact: `fp:q${i}`, completedAsExpected: true })),
      pr({ hypothesisId: 'h-1', artifact: 'fp:q9', completedAsExpected: false }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = { kind: 'confirmation-rate', atLeast: 0.95, overCycles: 1 };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('refuted');
  });

  test('ZC16.c: no evidence → inconclusive', () => {
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), [], []);
    const pred: Prediction = { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 1 };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('inconclusive');
    expect(j.confirmedCount).toBe(0);
    expect(j.refutedCount).toBe(0);
  });

  test('ZC16.d: mix of probe + scenario receipts contributes to rate', () => {
    const probes = [pr({ hypothesisId: 'h-1', artifact: 'fp:p0', completedAsExpected: true })];
    const scenarios = [
      sr({ hypothesisId: 'h-1', artifact: 'sr:0', verdict: 'trajectory-holds' }),
      sr({ hypothesisId: 'h-1', artifact: 'sr:1', verdict: 'step-diverged' }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, scenarios);
    const pred: Prediction = { kind: 'confirmation-rate', atLeast: 0.5, overCycles: 1 };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.confirmedCount).toBe(2); // 1 probe + 1 scenario
    expect(j.refutedCount).toBe(1); // 1 failing scenario
    expect(j.outcome).toBe('confirmed');
  });
});

describe('Z5a — confirmationFromPrediction (ZC17 — receipt-family-shift)', () => {
  test('ZC17: expected=not-visible, observed=matched → confirmed', () => {
    const probes = [
      pr({
        hypothesisId: 'h-1',
        artifact: 'fp:s0',
        expectedClass: 'unmatched',
        expectedErr: 'not-visible',
        observedClass: 'matched',
        observedErr: null,
        completedAsExpected: false,
      }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = { kind: 'receipt-family-shift', from: 'not-visible', to: 'matched' };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('confirmed');
    expect(j.confirmedCount).toBe(1);
  });

  test('ZC17.b: expected=not-visible, observed=not-enabled → refuted', () => {
    const probes = [
      pr({
        hypothesisId: 'h-1',
        artifact: 'fp:s1',
        expectedClass: 'unmatched',
        expectedErr: 'not-visible',
        observedClass: 'unmatched',
        observedErr: 'not-enabled',
        completedAsExpected: false,
      }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = { kind: 'receipt-family-shift', from: 'not-visible', to: 'matched' };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('refuted');
  });

  test('ZC17.c: no receipts touching `from` → inconclusive', () => {
    const probes = [pr({ hypothesisId: 'h-1', artifact: 'fp:s2' })];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = { kind: 'receipt-family-shift', from: 'not-visible', to: 'matched' };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('inconclusive');
  });
});

describe('Z5a — confirmationFromPrediction (ZC18 — coverage-growth)', () => {
  test('ZC18: ascending; 9/10 matching passes → confirmed', () => {
    const probes = [
      ...Array.from({ length: 9 }, (_, i) =>
        pr({
          hypothesisId: 'h-1',
          artifact: `fp:g${i}`,
          verb: 'observe',
          facetKind: 'element',
          completedAsExpected: true,
        }),
      ),
      pr({
        hypothesisId: 'h-1',
        artifact: 'fp:g9',
        verb: 'observe',
        facetKind: 'element',
        completedAsExpected: false,
      }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = {
      kind: 'coverage-growth',
      verb: 'observe',
      facetKind: 'element',
      fromRatio: 0.5,
      toRatio: 0.9,
    };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.cycleRate).toBeCloseTo(0.9);
    expect(j.outcome).toBe('confirmed');
  });

  test('ZC18.b: ascending; 5/10 matching passes → refuted at 0.9 threshold', () => {
    const probes = [
      ...Array.from({ length: 5 }, (_, i) =>
        pr({
          hypothesisId: 'h-1',
          artifact: `fp:h${i}`,
          verb: 'observe',
          facetKind: 'element',
          completedAsExpected: true,
        }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        pr({
          hypothesisId: 'h-1',
          artifact: `fp:j${i}`,
          verb: 'observe',
          facetKind: 'element',
          completedAsExpected: false,
        }),
      ),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = {
      kind: 'coverage-growth',
      verb: 'observe',
      facetKind: 'element',
      fromRatio: 0.0,
      toRatio: 0.9,
    };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.cycleRate).toBeCloseTo(0.5);
    expect(j.outcome).toBe('refuted');
  });

  test('ZC18.c: mismatched verb → not counted, inconclusive', () => {
    const probes = [
      pr({
        hypothesisId: 'h-1',
        artifact: 'fp:k',
        verb: 'interact',
        facetKind: 'element',
        completedAsExpected: true,
      }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), probes, []);
    const pred: Prediction = {
      kind: 'coverage-growth',
      verb: 'observe',
      facetKind: 'element',
      fromRatio: 0.5,
      toRatio: 0.9,
    };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('inconclusive');
  });
});

describe('Z5a — confirmationFromPrediction (ZC19 — regression-freedom)', () => {
  test('ZC19: all listed receipt ids pass → confirmed', () => {
    const scenarios = [
      sr({ hypothesisId: 'h-1', artifact: 'sr:a', verdict: 'trajectory-holds' }),
      sr({ hypothesisId: 'h-1', artifact: 'sr:b', verdict: 'trajectory-holds' }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), [], scenarios);
    const pred: Prediction = { kind: 'regression-freedom', receiptIds: ['sr:a', 'sr:b'] };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('confirmed');
  });

  test('ZC19.b: any listed receipt fails → refuted', () => {
    const scenarios = [
      sr({ hypothesisId: 'h-1', artifact: 'sr:a', verdict: 'trajectory-holds' }),
      sr({ hypothesisId: 'h-1', artifact: 'sr:b', verdict: 'step-diverged' }),
    ];
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), [], scenarios);
    const pred: Prediction = { kind: 'regression-freedom', receiptIds: ['sr:a', 'sr:b'] };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('refuted');
    expect(j.refutedCount).toBe(1);
  });

  test('ZC19.c: none of the listed receipts present → inconclusive', () => {
    const evidence = filterEvidenceForHypothesis(baseHypothesis(), [], []);
    const pred: Prediction = { kind: 'regression-freedom', receiptIds: ['sr:missing'] };
    const j = confirmationFromPrediction(pred, evidence);
    expect(j.outcome).toBe('inconclusive');
  });
});

describe('Z5a — evaluateHypothesis + buildHypothesisReceipt', () => {
  test('ZC19.d: evaluateHypothesis produces a valid HypothesisReceipt envelope', async () => {
    const probes = [pr({ hypothesisId: 'h-1', artifact: 'fp:p', completedAsExpected: true })];
    const receipt = await Effect.runPromise(
      evaluateHypothesis(baseHypothesis(), probes, [], { now: () => PINNED_NOW }),
    );
    expect(receipt.version).toBe(1);
    expect(receipt.stage).toBe('evidence');
    expect(receipt.scope).toBe('hypothesis');
    expect(receipt.kind).toBe('hypothesis-receipt');
    expect(receipt.governance).toBe('approved');
    expect(receipt.payload.hypothesisId).toBe('h-1');
    expect(receipt.payload.outcome).toBe('confirmed');
    expect(receipt.payload.evidenceReceiptIds).toEqual(['fp:p']);
  });

  test('ZC19.e: buildHypothesisReceipt fingerprints are stable under pinned now', () => {
    const judgment: Judgment = {
      outcome: 'confirmed',
      confirmedCount: 1,
      refutedCount: 0,
      inconclusiveCount: 0,
      cycleRate: 1,
      evidenceReceiptIds: ['fp:p'],
    };
    const a = buildHypothesisReceipt(baseHypothesis(), judgment, { now: () => PINNED_NOW });
    const b = buildHypothesisReceipt(baseHypothesis(), judgment, { now: () => PINNED_NOW });
    expect(a.fingerprints.artifact).toBe(b.fingerprints.artifact);
  });
});

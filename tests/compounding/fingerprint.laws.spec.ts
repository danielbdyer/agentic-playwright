/**
 * Compounding fingerprint + ports — Z2 laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.2 (ZC10):
 *
 *   ZC10   (Fingerprint stability + cosmetic exclusion):
 *          - Same hypothesis → same fingerprint across calls.
 *          - Cosmetic field change (description) → same fingerprint.
 *          - Substantive field change (prediction.atLeast) → different
 *            fingerprint.
 *   ZC10.b Ports are reachable as Context.Tag identities; the two
 *          tag-keys are distinct.
 */

import { describe, test, expect } from 'vitest';
import { Context } from 'effect';
import {
  hypothesisFingerprint,
  hypothesisReceiptFingerprint,
} from '../../workshop/compounding/application/fingerprint';
import {
  HypothesisLedger,
  ReceiptStore,
} from '../../workshop/compounding/application/ports';
import {
  hypothesisId,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import type { HypothesisReceipt } from '../../workshop/compounding/domain/hypothesis-receipt';
import { asFingerprint } from '../../product/domain/kernel/hash';

function sampleHypothesis(): Hypothesis {
  return {
    id: hypothesisId('00000000-0000-4000-8000-000000000001'),
    description: 'observe should matched-confirm against login-form',
    schemaVersion: 1,
    cohort: {
      kind: 'probe-surface',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: 'not-visible' },
    },
    prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 5 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test-fixture',
    createdAt: '2026-04-23T00:00:00.000Z',
  };
}

function sampleReceipt(hypothesisFp: string): HypothesisReceipt {
  return {
    version: 1,
    stage: 'evidence',
    scope: 'hypothesis',
    kind: 'hypothesis-receipt',
    ids: {},
    fingerprints: { artifact: 'fp:hr:sample' },
    lineage: {
      sources: ['hypothesis:00000000-0000-4000-8000-000000000001'],
      parents: [],
      handshakes: ['evidence'],
      experimentIds: [],
    },
    governance: 'approved',
    payload: {
      hypothesisId: hypothesisId('00000000-0000-4000-8000-000000000001'),
      hypothesisFingerprint: asFingerprint('hypothesis', hypothesisFp),
      outcome: 'confirmed',
      evidenceReceiptIds: ['probe:r1'],
      confirmedCount: 1,
      refutedCount: 0,
      inconclusiveCount: 0,
      cycleRate: 1,
      provenance: {
        substrateVersion: '1.0.0',
        manifestVersion: 1,
        computedAt: '2026-04-23T00:00:00.000Z',
      },
    },
  };
}

describe('Compounding Z2 — fingerprint + ports', () => {
  test('ZC10: hypothesisFingerprint is stable across calls', () => {
    const h = sampleHypothesis();
    expect(hypothesisFingerprint(h)).toBe(hypothesisFingerprint(h));
  });

  test('ZC10.b: cosmetic field change (description) does not alter fingerprint', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = { ...a, description: 'totally different prose' };
    expect(hypothesisFingerprint(a)).toBe(hypothesisFingerprint(b));
  });

  test('ZC10.c: cosmetic author change does not alter fingerprint', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = { ...a, author: 'different-author@example.com' };
    expect(hypothesisFingerprint(a)).toBe(hypothesisFingerprint(b));
  });

  test('ZC10.d: cosmetic createdAt change does not alter fingerprint', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = { ...a, createdAt: '2099-12-31T23:59:59.999Z' };
    expect(hypothesisFingerprint(a)).toBe(hypothesisFingerprint(b));
  });

  test('ZC10.e: substantive change (prediction.atLeast) alters fingerprint', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = {
      ...a,
      prediction: { kind: 'confirmation-rate', atLeast: 0.95, overCycles: 5 },
    };
    expect(hypothesisFingerprint(a)).not.toBe(hypothesisFingerprint(b));
  });

  test('ZC10.f: substantive change (cohort.verb) alters fingerprint', () => {
    const a = sampleHypothesis();
    const b: Hypothesis = {
      ...a,
      cohort: {
        kind: 'probe-surface',
        cohort: { verb: 'interact', facetKind: 'element', errorFamily: 'not-visible' },
      },
    };
    expect(hypothesisFingerprint(a)).not.toBe(hypothesisFingerprint(b));
  });

  test('ZC10.g: hypothesisReceiptFingerprint is stable across calls', () => {
    const r = sampleReceipt('fp:h:sample');
    expect(hypothesisReceiptFingerprint(r)).toBe(hypothesisReceiptFingerprint(r));
  });

  test('ZC10.h: hypothesisReceiptFingerprint excludes wall-clock computedAt', () => {
    const a = sampleReceipt('fp:h:sample');
    const b: HypothesisReceipt = {
      ...a,
      payload: {
        ...a.payload,
        provenance: {
          ...a.payload.provenance,
          computedAt: '2099-12-31T23:59:59.999Z',
        },
      },
    };
    expect(hypothesisReceiptFingerprint(a)).toBe(hypothesisReceiptFingerprint(b));
  });

  test('ZC10.i: hypothesisReceiptFingerprint changes when outcome changes', () => {
    const a = sampleReceipt('fp:h:sample');
    const b: HypothesisReceipt = {
      ...a,
      payload: { ...a.payload, outcome: 'refuted' },
    };
    expect(hypothesisReceiptFingerprint(a)).not.toBe(hypothesisReceiptFingerprint(b));
  });

  test('ZC10.j: HypothesisLedger and ReceiptStore have distinct Context.Tag keys', () => {
    // The two port tags are distinct Context.Tag classes; referencing the
    // same tag twice returns the same class; the two tags are not equal.
    expect(HypothesisLedger).toBe(HypothesisLedger);
    expect(ReceiptStore).toBe(ReceiptStore);
    expect(HypothesisLedger as unknown).not.toBe(ReceiptStore as unknown);
    // The string identifiers passed to Context.Tag are distinct (this is
    // the canonical evidence that two Tag classes won't collide under
    // Layer composition).
    const ledgerAsContext = Context.make(HypothesisLedger, {} as never);
    const storeAsContext = Context.make(ReceiptStore, {} as never);
    const ledgerMerged = Context.merge(ledgerAsContext, storeAsContext);
    expect(Context.unsafeGet(ledgerMerged, HypothesisLedger)).toBeDefined();
    expect(Context.unsafeGet(ledgerMerged, ReceiptStore)).toBeDefined();
  });
});

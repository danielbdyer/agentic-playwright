/**
 * Compounding domain — Z11a.1 CompilationReceipt laws.
 *
 * Per docs/v2-compounding-engine-plan.md Step 11 Z11a, the Z11a.1
 * phase pins:
 *
 *   ZC33 (CompilationReceipt envelope shape): the receipt carries
 *        `kind='compilation-receipt'`, `scope='compilation'`, and
 *        `stage='evidence'` without inlining the base envelope
 *        header fields.
 *   ZC33.b (JSON round-trip): serialize → parse preserves structure.
 *   ZC33.c (corpus discrimination): the two corpuses produce
 *        distinct cohort keys via the CustomerCompilationCohort
 *        wrapper.
 *   ZC33.d (fingerprint tag registration): `'compilation-receipt'`
 *        is registered in the FingerprintTag registry and
 *        `asFingerprint('compilation-receipt', ...)` typechecks.
 */

import { describe, test, expect } from 'vitest';
import type {
  CompilationReceipt,
  CustomerCompilationCorpus,
} from '../../workshop/compounding/domain/compilation-receipt';
import { asFingerprint } from '../../product/domain/kernel/hash';
import { cohortKey } from '../../workshop/compounding/domain/cohort';

function sampleReceipt(corpus: CustomerCompilationCorpus): CompilationReceipt {
  return {
    version: 1,
    stage: 'evidence',
    scope: 'compilation',
    kind: 'compilation-receipt',
    ids: {},
    fingerprints: { artifact: 'fp:cr:sample' },
    lineage: {
      sources: ['ado:TC-00001'],
      parents: [],
      handshakes: ['evidence'],
      experimentIds: [],
    },
    governance: 'approved',
    payload: {
      hypothesisId: null,
      adoId: 'TC-00001',
      corpus,
      totalStepCount: 5,
      resolvedStepCount: corpus === 'resolvable' ? 5 : 2,
      needsHumanStepCount: corpus === 'resolvable' ? 0 : 3,
      blockedStepCount: 0,
      handoffsEmitted: corpus === 'resolvable' ? 0 : 3,
      handoffsWithValidMissingContext: corpus === 'resolvable' ? 0 : 3,
      reasoningReceiptIds: [],
      totalLatencyMs: 42,
      provenance: {
        substrateVersion: '1.0.0',
        manifestVersion: 1,
        computedAt: '2026-04-23T00:00:00.000Z',
        adoContentFingerprint: asFingerprint('ado-content', 'fp:ado:TC-00001'),
      },
    },
  };
}

describe('Compounding Z11a.1 — CompilationReceipt', () => {
  test('ZC33: envelope carries the four phantom-axis fields', () => {
    const r = sampleReceipt('resolvable');
    expect(r.stage).toBe('evidence');
    expect(r.scope).toBe('compilation');
    expect(r.kind).toBe('compilation-receipt');
    expect(r.governance).toBe('approved');
    expect(r.fingerprints.artifact).toBeDefined();
  });

  test('ZC33.b: JSON round-trip preserves structure', () => {
    const r = sampleReceipt('needs-human');
    const serialized = JSON.stringify(r);
    const parsed = JSON.parse(serialized) as CompilationReceipt;
    expect(parsed).toEqual(r);
  });

  test('ZC33.c: corpus-discriminated cohort keys are distinct', () => {
    const resolvableKey = cohortKey({ kind: 'customer-compilation', corpus: 'resolvable' });
    const needsHumanKey = cohortKey({ kind: 'customer-compilation', corpus: 'needs-human' });
    expect(resolvableKey).not.toBe(needsHumanKey);
    expect(resolvableKey).toBe('customer-compilation:corpus:resolvable');
    expect(needsHumanKey).toBe('customer-compilation:corpus:needs-human');
  });

  test('ZC33.d: "compilation-receipt" tag is registered', () => {
    // If the FingerprintTag union does not include the tag, this
    // call fails at compile time. Landing this law pins the tag
    // into the registry.
    const fp = asFingerprint('compilation-receipt', 'fp:cr:sample');
    expect(typeof fp).toBe('string');
    expect(fp).toBe('fp:cr:sample');
  });

  test('ZC33.e: resolvable corpus receipt reflects no-handoff outcomes', () => {
    const r = sampleReceipt('resolvable');
    expect(r.payload.corpus).toBe('resolvable');
    expect(r.payload.needsHumanStepCount).toBe(0);
    expect(r.payload.handoffsEmitted).toBe(0);
    expect(r.payload.handoffsWithValidMissingContext).toBe(0);
    expect(r.payload.resolvedStepCount).toBe(r.payload.totalStepCount);
  });

  test('ZC33.f: needs-human corpus receipt reflects handoff outcomes', () => {
    const r = sampleReceipt('needs-human');
    expect(r.payload.corpus).toBe('needs-human');
    expect(r.payload.needsHumanStepCount).toBeGreaterThan(0);
    expect(r.payload.handoffsEmitted).toBe(r.payload.needsHumanStepCount);
    // Z11a mechanical floor: valid missingContext count equals emitted.
    // Z11d semantic upgrade will allow this to fall below emitted
    // when handoffs name the wrong ambiguity. The law holds for the
    // mechanical case.
    expect(r.payload.handoffsWithValidMissingContext).toBeLessThanOrEqual(r.payload.handoffsEmitted);
  });
});

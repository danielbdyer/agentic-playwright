/**
 * Z4 in-memory service laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.4:
 *
 *   ZC12 (append idempotent on re-append): ledger.append(h) twice
 *        produces exactly one entry (dedup on id).
 *   ZC13 (findById round-trip): append(h) → findById(h.id) returns h.
 *   ZC14 (findByCohort filters): append two hypotheses with distinct
 *        cohorts; findByCohort on each returns only the matching one.
 *
 * Additional laws cover the ReceiptStore's append + query surfaces
 * so the full Z4 contract is pinned before Z5's pure derivations
 * compose over it.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import {
  hypothesisId,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import {
  cohortKey,
  type Cohort,
} from '../../workshop/compounding/domain/cohort';
import type { Ratchet } from '../../workshop/compounding/domain/ratchet';
import {
  HypothesisLedger,
  ReceiptStore,
  type ProbeReceiptLike,
  type ScenarioReceiptLike,
} from '../../workshop/compounding/application/ports';
import { createInMemoryHypothesisLedger } from '../../workshop/compounding/harness/in-memory-hypothesis-ledger';
import { createInMemoryReceiptStore } from '../../workshop/compounding/harness/in-memory-receipt-store';
import { inMemoryCompoundingLayer } from '../../workshop/compounding/composition/in-memory-services';
import { asFingerprint } from '../../product/domain/kernel/hash';

const COHORT_OBSERVE_ELEMENT: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
};

const COHORT_INTERACT_ELEMENT: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'interact', facetKind: 'element', errorFamily: 'not-enabled' },
};

function h(id: string, cohort: Cohort, overrides: Partial<Hypothesis> = {}): Hypothesis {
  return {
    id: hypothesisId(id),
    description: `hypothesis-${id}`,
    schemaVersion: 1,
    cohort,
    prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 3 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test',
    createdAt: '2026-04-23T00:00:00.000Z',
    ...overrides,
  };
}

function pr(hid: string | null, artifactFp: string): ProbeReceiptLike {
  return {
    payload: {
      probeId: `probe:observe:${artifactFp}`,
      verb: 'observe',
      fixtureName: artifactFp,
      hypothesisId: hid,
      outcome: {
        expected: { classification: 'matched', errorFamily: null },
        observed: { classification: 'matched', errorFamily: null },
        completedAsExpected: true,
      },
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    },
    fingerprints: { artifact: artifactFp },
  };
}

function sr(hid: string | null, id: string): ScenarioReceiptLike {
  return {
    payload: { scenarioId: id, hypothesisId: hid, verdict: 'trajectory-holds' },
    fingerprints: { artifact: `fp:sr:${id}` },
  };
}

describe('Z4 — in-memory HypothesisLedger (ZC12-14)', () => {
  test('ZC12: append is idempotent on id', async () => {
    const ledger = createInMemoryHypothesisLedger();
    const hyp = h('h-1', COHORT_OBSERVE_ELEMENT);
    await Effect.runPromise(ledger.append(hyp));
    await Effect.runPromise(ledger.append(hyp));
    const all = await Effect.runPromise(ledger.listAll());
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe('h-1');
  });

  test('ZC12.b: re-append of same id does NOT overwrite payload', async () => {
    const ledger = createInMemoryHypothesisLedger();
    const original = h('h-1', COHORT_OBSERVE_ELEMENT, { description: 'first' });
    await Effect.runPromise(ledger.append(original));
    const attemptedUpdate = h('h-1', COHORT_OBSERVE_ELEMENT, { description: 'second' });
    await Effect.runPromise(ledger.append(attemptedUpdate));
    const found = await Effect.runPromise(ledger.findById(hypothesisId('h-1')));
    expect(found?.description).toBe('first');
  });

  test('ZC13: findById returns the appended hypothesis; unknown id returns null', async () => {
    const ledger = createInMemoryHypothesisLedger();
    const hyp = h('h-1', COHORT_OBSERVE_ELEMENT);
    await Effect.runPromise(ledger.append(hyp));

    const found = await Effect.runPromise(ledger.findById(hypothesisId('h-1')));
    expect(found).toEqual(hyp);

    const missing = await Effect.runPromise(ledger.findById(hypothesisId('h-404')));
    expect(missing).toBeNull();
  });

  test('ZC14: findByCohort returns only matching hypotheses', async () => {
    const ledger = createInMemoryHypothesisLedger();
    const a = h('h-a', COHORT_OBSERVE_ELEMENT);
    const b = h('h-b', COHORT_INTERACT_ELEMENT);
    await Effect.runPromise(ledger.append(a));
    await Effect.runPromise(ledger.append(b));

    const observeMatches = await Effect.runPromise(
      ledger.findByCohort(cohortKey(COHORT_OBSERVE_ELEMENT)),
    );
    expect(observeMatches.map((x) => x.id)).toEqual(['h-a']);

    const interactMatches = await Effect.runPromise(
      ledger.findByCohort(cohortKey(COHORT_INTERACT_ELEMENT)),
    );
    expect(interactMatches.map((x) => x.id)).toEqual(['h-b']);
  });

  test('ZC14.b: listAll preserves insertion order', async () => {
    const ledger = createInMemoryHypothesisLedger();
    const a = h('h-a', COHORT_OBSERVE_ELEMENT);
    const b = h('h-b', COHORT_INTERACT_ELEMENT);
    const c = h('h-c', COHORT_OBSERVE_ELEMENT);
    await Effect.runPromise(ledger.append(a));
    await Effect.runPromise(ledger.append(b));
    await Effect.runPromise(ledger.append(c));

    const all = await Effect.runPromise(ledger.listAll());
    expect(all.map((x) => x.id)).toEqual(['h-a', 'h-b', 'h-c']);
  });

  test('ZC14.c: initial seed is respected', async () => {
    const ledger = createInMemoryHypothesisLedger([h('h-seed', COHORT_OBSERVE_ELEMENT)]);
    const all = await Effect.runPromise(ledger.listAll());
    expect(all.map((x) => x.id)).toEqual(['h-seed']);
  });
});

describe('Z4 — in-memory ReceiptStore', () => {
  test('ZC14.d: probeReceiptsForHypothesis filters by hypothesisId', async () => {
    const store = createInMemoryReceiptStore({
      probeReceipts: [pr('h-a', 'fp:1'), pr('h-a', 'fp:2'), pr('h-b', 'fp:3'), pr(null, 'fp:4')],
    });
    const aResults = await Effect.runPromise(
      store.probeReceiptsForHypothesis(hypothesisId('h-a')),
    );
    expect(aResults.map((r) => r.fingerprints.artifact)).toEqual(['fp:1', 'fp:2']);
  });

  test('ZC14.e: latestProbeReceipts returns the full cycle snapshot', async () => {
    const store = createInMemoryReceiptStore({
      probeReceipts: [pr('h-a', 'fp:1'), pr(null, 'fp:2')],
    });
    const latest = await Effect.runPromise(store.latestProbeReceipts());
    expect(latest).toHaveLength(2);
  });

  test('ZC14.f: appendHypothesisReceipt records to the in-memory log', async () => {
    const store = createInMemoryReceiptStore();
    const receipt = {
      version: 1 as const,
      stage: 'evidence' as const,
      scope: 'hypothesis' as const,
      kind: 'hypothesis-receipt' as const,
      ids: {},
      fingerprints: { artifact: 'fp:hr:1' },
      lineage: { sources: [], parents: [], handshakes: ['evidence'] as const, experimentIds: [] },
      governance: 'approved' as const,
      payload: {
        hypothesisId: hypothesisId('h-a'),
        hypothesisFingerprint: asFingerprint('hypothesis', 'fp:h:a'),
        outcome: 'confirmed' as const,
        evidenceReceiptIds: ['fp:1'],
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
    await Effect.runPromise(store.appendHypothesisReceipt(receipt));
    const emitted = store.emittedHypothesisReceipts();
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.payload.hypothesisId).toBe('h-a');
  });

  test('ZC14.g: appendRatchet is idempotent on id; listRatchets returns them', async () => {
    const store = createInMemoryReceiptStore();
    const ratchet: Ratchet = {
      id: 'ratchet:demo',
      scenarioId: 'demo',
      firstPassedAt: '2026-04-23T00:00:00.000Z',
      firstPassedFingerprint: 'fp:sr:demo',
    };
    await Effect.runPromise(store.appendRatchet(ratchet));
    await Effect.runPromise(store.appendRatchet(ratchet));
    const list = await Effect.runPromise(store.listRatchets());
    expect(list).toHaveLength(1);
    expect(list[0]!.id).toBe('ratchet:demo');
  });

  test('ZC14.h: scenarioReceiptsForHypothesis filters by hypothesisId', async () => {
    const store = createInMemoryReceiptStore({
      scenarioReceipts: [sr('h-a', 's1'), sr('h-a', 's2'), sr('h-b', 's3'), sr(null, 's4')],
    });
    const aResults = await Effect.runPromise(
      store.scenarioReceiptsForHypothesis(hypothesisId('h-a')),
    );
    expect(aResults.map((r) => r.payload.scenarioId)).toEqual(['s1', 's2']);
  });
});

describe('Z4 — composed Layer provides both services', () => {
  test('ZC14.i: inMemoryCompoundingLayer provides HypothesisLedger + ReceiptStore together', async () => {
    const layer = inMemoryCompoundingLayer({
      hypotheses: [h('h-seed', COHORT_OBSERVE_ELEMENT)],
      probeReceipts: [pr('h-seed', 'fp:1')],
    });
    const program = Effect.gen(function* () {
      const ledger = yield* HypothesisLedger;
      const store = yield* ReceiptStore;
      const all = yield* ledger.listAll();
      const probes = yield* store.latestProbeReceipts();
      return { ledgerCount: all.length, probeCount: probes.length };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result).toEqual({ ledgerCount: 1, probeCount: 1 });
  });
});

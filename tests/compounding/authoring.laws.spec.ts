/**
 * Z9 — ratchet + hypothesis authoring laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.9:
 *   ZC29 (ratchet authoring requires pass):
 *     - `tesseract compounding-ratchet` against a currently-failing
 *        scenario exits 1 with a clear error.
 *     - against a currently-passing scenario appends a Ratchet.
 *   ZC30 (hypothesis authoring writes to ledger):
 *     - `tesseract compounding-hypothesize --input <file>` appends
 *       a Hypothesis to the log with a valid id + timestamp.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  authorHypothesis,
  authorRatchet,
} from '../../workshop/compounding/application/authoring';
import type { Cohort } from '../../workshop/compounding/domain/cohort';
import { inMemoryCompoundingLayer } from '../../workshop/compounding/composition/in-memory-services';
import { HypothesisLedger, ReceiptStore } from '../../workshop/compounding/application/ports';
import type { ScenarioReceiptLike } from '../../workshop/compounding/application/ports';

const COHORT_A: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
};

function sr(params: {
  readonly scenarioId: string;
  readonly verdict: string;
  readonly artifact: string;
}): ScenarioReceiptLike {
  return {
    payload: {
      scenarioId: params.scenarioId,
      hypothesisId: null,
      verdict: params.verdict,
    },
    fingerprints: { artifact: params.artifact },
  };
}

describe('Z9 — authorHypothesis (ZC30)', () => {
  test('ZC30: authorHypothesis appends to the ledger with a valid id + timestamp', async () => {
    const layer = inMemoryCompoundingLayer({});
    const program = Effect.gen(function* () {
      const h = yield* authorHypothesis({
        description: 'test hypothesis',
        cohort: COHORT_A,
        prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 3 },
        now: () => new Date('2026-04-23T00:00:00.000Z'),
      });
      const ledger = yield* HypothesisLedger;
      const all = yield* ledger.listAll();
      return { authored: h, ledgerContents: all };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result.ledgerContents).toHaveLength(1);
    expect(result.ledgerContents[0]!.id).toBe(result.authored.id);
    expect(result.authored.createdAt).toBe('2026-04-23T00:00:00.000Z');
    // Default UUIDv4 format check: 36 chars, 4 dashes.
    expect(result.authored.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test('ZC30.b: explicit id is honored', async () => {
    const layer = inMemoryCompoundingLayer({});
    const result = await Effect.runPromise(
      authorHypothesis({
        id: 'h-custom-id',
        description: 'custom',
        cohort: COHORT_A,
        prediction: { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 1 },
      }).pipe(Effect.provide(layer)),
    );
    expect(result.id).toBe('h-custom-id');
  });

  test('ZC30.c: default requiredConsecutiveConfirmations is 3', async () => {
    const layer = inMemoryCompoundingLayer({});
    const result = await Effect.runPromise(
      authorHypothesis({
        description: 'test',
        cohort: COHORT_A,
        prediction: { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 1 },
      }).pipe(Effect.provide(layer)),
    );
    expect(result.requiredConsecutiveConfirmations).toBe(3);
  });

  test('ZC30.d: re-authoring same id is a no-op in the ledger (ZC12 discipline)', async () => {
    const layer = inMemoryCompoundingLayer({});
    const program = Effect.gen(function* () {
      yield* authorHypothesis({
        id: 'h-same',
        description: 'first',
        cohort: COHORT_A,
        prediction: { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 1 },
      });
      yield* authorHypothesis({
        id: 'h-same',
        description: 'second',
        cohort: COHORT_A,
        prediction: { kind: 'confirmation-rate', atLeast: 0.9, overCycles: 1 },
      });
      const ledger = yield* HypothesisLedger;
      return yield* ledger.listAll();
    });
    const all = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(all).toHaveLength(1);
    expect(all[0]!.description).toBe('first');
  });
});

describe('Z9 — authorRatchet (ZC29)', () => {
  test('ZC29: authorRatchet against a currently-passing scenario appends a Ratchet', async () => {
    const layer = inMemoryCompoundingLayer({
      scenarioReceipts: [
        sr({ scenarioId: 'form-success-recovery', verdict: 'trajectory-holds', artifact: 'fp:sr:fsr' }),
      ],
    });
    const program = Effect.gen(function* () {
      const ratchet = yield* authorRatchet({
        scenarioId: 'form-success-recovery',
        now: () => new Date('2026-04-23T00:00:00.000Z'),
      });
      const store = yield* ReceiptStore;
      const list = yield* store.listRatchets();
      return { ratchet, list };
    });
    const result = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(result.ratchet.id).toBe('ratchet:form-success-recovery');
    expect(result.ratchet.scenarioId).toBe('form-success-recovery');
    expect(result.ratchet.firstPassedFingerprint).toBe('fp:sr:fsr');
    expect(result.list).toHaveLength(1);
  });

  test('ZC29.b: authorRatchet against a currently-FAILING scenario fails with a clear error', async () => {
    const layer = inMemoryCompoundingLayer({
      scenarioReceipts: [
        sr({ scenarioId: 'broken', verdict: 'step-diverged', artifact: 'fp:sr:broken' }),
      ],
    });
    const result = await Effect.runPromiseExit(
      authorRatchet({ scenarioId: 'broken' }).pipe(Effect.provide(layer)),
    );
    expect(result._tag).toBe('Failure');
    if (result._tag === 'Failure') {
      const err = result.cause;
      const serialized = JSON.stringify(err);
      expect(serialized).toContain('EvidenceQueryFailed');
      expect(serialized).toContain('broken');
    }
  });

  test('ZC29.c: authorRatchet against a missing scenario fails with evidence-query error', async () => {
    const layer = inMemoryCompoundingLayer({ scenarioReceipts: [] });
    const result = await Effect.runPromiseExit(
      authorRatchet({ scenarioId: 'unknown' }).pipe(Effect.provide(layer)),
    );
    expect(result._tag).toBe('Failure');
  });

  test('ZC29.d: re-ratcheting the same scenario id is idempotent', async () => {
    const layer = inMemoryCompoundingLayer({
      scenarioReceipts: [
        sr({ scenarioId: 'demo', verdict: 'trajectory-holds', artifact: 'fp:sr:demo' }),
      ],
    });
    const program = Effect.gen(function* () {
      yield* authorRatchet({ scenarioId: 'demo' });
      yield* authorRatchet({ scenarioId: 'demo' });
      const store = yield* ReceiptStore;
      return yield* store.listRatchets();
    });
    const list = await Effect.runPromise(program.pipe(Effect.provide(layer)));
    expect(list).toHaveLength(1);
  });
});

/**
 * Layer composition root for the in-memory service set.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z4, this layer is what
 * unit tests wire into `Effect.provide(...)` to run compounding
 * engine programs without touching the filesystem.
 *
 * Usage:
 *
 *   const program = computeScoreboard(...);
 *   const layer = inMemoryCompoundingLayer({
 *     hypotheses: [h1, h2],
 *     probeReceipts: [r1, r2, r3],
 *     scenarioReceipts: [sr1],
 *     ratchets: [],
 *   });
 *   Effect.runPromise(program.pipe(Effect.provide(layer)));
 */

import { Layer } from 'effect';
import type { Hypothesis } from '../domain/hypothesis';
import type { Ratchet } from '../domain/ratchet';
import {
  HypothesisLedger,
  ReceiptStore,
  type ProbeReceiptLike,
  type ScenarioReceiptLike,
} from '../application/ports';
import {
  createInMemoryHypothesisLedger,
} from '../harness/in-memory-hypothesis-ledger';
import {
  createInMemoryReceiptStore,
} from '../harness/in-memory-receipt-store';

export interface InMemoryCompoundingSeed {
  readonly hypotheses?: readonly Hypothesis[];
  readonly probeReceipts?: readonly ProbeReceiptLike[];
  readonly scenarioReceipts?: readonly ScenarioReceiptLike[];
  readonly ratchets?: readonly Ratchet[];
}

/** Compose both test-double services into a single Layer. */
export function inMemoryCompoundingLayer(seed: InMemoryCompoundingSeed = {}) {
  const ledger = createInMemoryHypothesisLedger(seed.hypotheses);
  const store = createInMemoryReceiptStore({
    probeReceipts: seed.probeReceipts,
    scenarioReceipts: seed.scenarioReceipts,
    ratchets: seed.ratchets,
  });
  return Layer.mergeAll(
    Layer.succeed(HypothesisLedger, ledger),
    Layer.succeed(ReceiptStore, store),
  );
}

/**
 * Compounding engine — Context.Tag service ports.
 *
 * Per docs/v2-compounding-engine-plan.md §4.1, the engine exposes
 * exactly two injectable services:
 *
 *   - HypothesisLedger — the append-only authored hypothesis store.
 *   - ReceiptStore     — the per-cycle receipt query + append port
 *                        that fronts workshop/logs/*.
 *
 * Everything else is pure. Over-tagging obscures the injectable
 * boundaries; these two are the only external-world contact points
 * the engine needs.
 *
 * Port types are kept narrow via `ProbeReceiptLike` + `ScenarioReceiptLike`
 * aliases so the port declaration does not depend on probe-derivation
 * or scenarios modules transitively. The filesystem + in-memory
 * adapters narrow the full ProbeReceipt / ScenarioReceipt to these
 * shapes at their boundaries.
 */

import { Context } from 'effect';
import type { Effect } from 'effect';
import type { Hypothesis, HypothesisId } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Ratchet } from '../domain/ratchet';
import type { CompoundingError } from '../domain/compounding-error';

/** Narrow ProbeReceipt shape the engine needs. The full
 *  ProbeReceipt from `workshop/probe-derivation/probe-receipt.ts`
 *  structurally satisfies this shape. */
export interface ProbeReceiptLike {
  readonly payload: {
    readonly probeId: string;
    readonly verb: string;
    readonly fixtureName: string;
    readonly hypothesisId: string | null;
    readonly outcome: {
      readonly expected: {
        readonly classification: string;
        readonly errorFamily: string | null;
      };
      readonly observed: {
        readonly classification: string;
        readonly errorFamily: string | null;
      };
      readonly completedAsExpected: boolean;
    };
    readonly cohort: {
      readonly verb: string;
      readonly facetKind: string;
      readonly errorFamily: string | null;
    };
  };
  readonly fingerprints: {
    readonly artifact: string;
  };
}

/** Narrow ScenarioReceipt shape the engine needs. */
export interface ScenarioReceiptLike {
  readonly payload: {
    readonly scenarioId: string;
    readonly hypothesisId: string | null;
    readonly verdict: string;
  };
  readonly fingerprints: {
    readonly artifact: string;
  };
}

/** The append-only hypothesis store. Writes are one-shot (an
 *  authored hypothesis); reads are id lookup, cohort-indexed, or
 *  full-list. Dedupe on id. */
export interface HypothesisLedgerService {
  readonly append: (h: Hypothesis) => Effect.Effect<void, CompoundingError, never>;
  readonly findById: (id: HypothesisId) => Effect.Effect<Hypothesis | null, CompoundingError, never>;
  readonly findByCohort: (cohortKey: string) => Effect.Effect<readonly Hypothesis[], CompoundingError, never>;
  readonly listAll: () => Effect.Effect<readonly Hypothesis[], CompoundingError, never>;
}

export class HypothesisLedger extends Context.Tag('workshop/compounding/HypothesisLedger')<
  HypothesisLedger,
  HypothesisLedgerService
>() {}

/** The receipt-query + append port. Reads the latest receipts for
 *  the current cycle; writes hypothesis receipts + ratchets. */
export interface ReceiptStoreService {
  readonly probeReceiptsForHypothesis: (
    id: HypothesisId,
  ) => Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never>;
  readonly scenarioReceiptsForHypothesis: (
    id: HypothesisId,
  ) => Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never>;
  readonly latestProbeReceipts: () => Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never>;
  readonly latestScenarioReceipts: () => Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never>;
  readonly appendHypothesisReceipt: (
    r: HypothesisReceipt,
  ) => Effect.Effect<void, CompoundingError, never>;
  /** Z10c — list prior hypothesis receipts so multi-cycle
   *  trajectories can accumulate across CLI invocations. The
   *  compounding engine's `hypothesis-confirmation-rate-sustained`
   *  gate requires ≥N distinct trajectory entries (default 3); that
   *  semantic only works if each `compounding-scoreboard` invocation
   *  can observe the receipts emitted by prior cycles. Before
   *  Z10c, trajectories re-zeroed every invocation because the CLI
   *  passed no priorHypothesisReceipts.
   *
   *  Contract: returns the full accumulated HypothesisReceipt[] for
   *  every cycle emitted to the store — callers dedupe + filter.
   *  Sorted ascending by `payload.provenance.computedAt` so
   *  trajectory-entry ordering is deterministic across adapters. */
  readonly listHypothesisReceipts: () => Effect.Effect<readonly HypothesisReceipt[], CompoundingError, never>;
  readonly appendRatchet: (r: Ratchet) => Effect.Effect<void, CompoundingError, never>;
  readonly listRatchets: () => Effect.Effect<readonly Ratchet[], CompoundingError, never>;
}

export class ReceiptStore extends Context.Tag('workshop/compounding/ReceiptStore')<
  ReceiptStore,
  ReceiptStoreService
>() {}

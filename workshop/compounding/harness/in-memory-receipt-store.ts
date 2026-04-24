/**
 * In-memory ReceiptStore — test double.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z4, the in-memory
 * adapter fronts a set of pre-seeded probe + scenario receipts (for
 * the "current cycle") plus an appendable hypothesis-receipt +
 * ratchet log.
 *
 * Used by unit tests of compute-scoreboard + evaluate-hypothesis.
 * The filesystem adapter (Z6) mirrors the same contract over real
 * JSONL files.
 */

import { Effect } from 'effect';
import type { HypothesisId } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Ratchet } from '../domain/ratchet';
import type { CompoundingError } from '../domain/compounding-error';
import type {
  CompilationReceiptLike,
  ProbeReceiptLike,
  ReceiptStoreService,
  ScenarioReceiptLike,
} from '../application/ports';

export interface InMemoryReceiptStoreSeed {
  readonly probeReceipts?: readonly ProbeReceiptLike[];
  readonly scenarioReceipts?: readonly ScenarioReceiptLike[];
  readonly compilationReceipts?: readonly CompilationReceiptLike[];
  readonly ratchets?: readonly Ratchet[];
}

export interface InMemoryReceiptStore extends ReceiptStoreService {
  /** Read-only view of appended HypothesisReceipts (test-only). */
  readonly emittedHypothesisReceipts: () => readonly HypothesisReceipt[];
  /** Read-only view of appended Ratchets (test-only). */
  readonly currentRatchets: () => readonly Ratchet[];
}

export function createInMemoryReceiptStore(
  seed: InMemoryReceiptStoreSeed = {},
): InMemoryReceiptStore {
  const probeReceipts: ProbeReceiptLike[] = [...(seed.probeReceipts ?? [])];
  const scenarioReceipts: ScenarioReceiptLike[] = [...(seed.scenarioReceipts ?? [])];
  const compilationReceipts: CompilationReceiptLike[] = [...(seed.compilationReceipts ?? [])];
  const ratchets: Ratchet[] = [...(seed.ratchets ?? [])];
  const emittedHypothesisReceiptsLog: HypothesisReceipt[] = [];

  const probeReceiptsForHypothesis = (
    id: HypothesisId,
  ): Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => probeReceipts.filter((r) => r.payload.hypothesisId === id));

  const scenarioReceiptsForHypothesis = (
    id: HypothesisId,
  ): Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => scenarioReceipts.filter((r) => r.payload.hypothesisId === id));

  const latestProbeReceipts = (): Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => [...probeReceipts]);

  const latestScenarioReceipts = (): Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => [...scenarioReceipts]);

  const compilationReceiptsForHypothesis = (
    id: HypothesisId,
  ): Effect.Effect<readonly CompilationReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => compilationReceipts.filter((r) => r.payload.hypothesisId === id));

  const latestCompilationReceipts = (): Effect.Effect<readonly CompilationReceiptLike[], CompoundingError, never> =>
    Effect.sync(() => [...compilationReceipts]);

  const appendHypothesisReceipt = (
    r: HypothesisReceipt,
  ): Effect.Effect<void, CompoundingError, never> =>
    Effect.sync(() => {
      emittedHypothesisReceiptsLog.push(r);
    });

  /** Z10c — symmetric with the filesystem adapter; returns the
   *  accumulated hypothesis-receipt log in ascending computedAt
   *  order. Tests reaching for prior-cycle trajectories use this
   *  the same way the live CLI does. */
  const listHypothesisReceipts = (): Effect.Effect<
    readonly HypothesisReceipt[],
    CompoundingError,
    never
  > =>
    Effect.sync(() =>
      [...emittedHypothesisReceiptsLog].sort((a, b) =>
        a.payload.provenance.computedAt.localeCompare(b.payload.provenance.computedAt),
      ),
    );

  const appendRatchet = (r: Ratchet): Effect.Effect<void, CompoundingError, never> =>
    Effect.sync(() => {
      if (!ratchets.some((existing) => existing.id === r.id)) {
        ratchets.push(r);
      }
    });

  const listRatchets = (): Effect.Effect<readonly Ratchet[], CompoundingError, never> =>
    Effect.sync(() => [...ratchets]);

  return {
    probeReceiptsForHypothesis,
    scenarioReceiptsForHypothesis,
    latestProbeReceipts,
    latestScenarioReceipts,
    compilationReceiptsForHypothesis,
    latestCompilationReceipts,
    appendHypothesisReceipt,
    listHypothesisReceipts,
    appendRatchet,
    listRatchets,
    emittedHypothesisReceipts: () => [...emittedHypothesisReceiptsLog],
    currentRatchets: () => [...ratchets],
  };
}

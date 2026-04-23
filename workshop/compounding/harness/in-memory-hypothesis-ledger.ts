/**
 * In-memory HypothesisLedger — test double.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z4, the in-memory
 * adapter mirrors the filesystem adapter's contract:
 *
 *   - append: idempotent on id (second append of the same id is a
 *     no-op; ZC12 pins).
 *   - findById: returns the appended hypothesis or null.
 *   - findByCohort: returns only hypotheses whose cohort key
 *     matches (ZC14).
 *   - listAll: returns all appended hypotheses in insertion order.
 *
 * Stateful closure over a Map keyed by id. Effect.sync boundary —
 * there is no real I/O. Callers wire via
 * `Layer.succeed(HypothesisLedger, createInMemoryHypothesisLedger())`.
 */

import { Effect } from 'effect';
import { cohortKey } from '../domain/cohort';
import type { Hypothesis, HypothesisId } from '../domain/hypothesis';
import type { CompoundingError } from '../domain/compounding-error';
import type { HypothesisLedgerService } from '../application/ports';

export function createInMemoryHypothesisLedger(
  initial: readonly Hypothesis[] = [],
): HypothesisLedgerService {
  const store: Map<HypothesisId, Hypothesis> = new Map();
  const insertionOrder: HypothesisId[] = [];
  for (const h of initial) {
    if (!store.has(h.id)) {
      store.set(h.id, h);
      insertionOrder.push(h.id);
    }
  }

  const append = (h: Hypothesis): Effect.Effect<void, CompoundingError, never> =>
    Effect.sync(() => {
      if (store.has(h.id)) return;
      store.set(h.id, h);
      insertionOrder.push(h.id);
    });

  const findById = (
    id: HypothesisId,
  ): Effect.Effect<Hypothesis | null, CompoundingError, never> =>
    Effect.sync(() => store.get(id) ?? null);

  const findByCohort = (
    cohortKeyValue: string,
  ): Effect.Effect<readonly Hypothesis[], CompoundingError, never> =>
    Effect.sync(() =>
      insertionOrder
        .map((id) => store.get(id))
        .filter((h): h is Hypothesis => h !== undefined)
        .filter((h) => cohortKey(h.cohort) === cohortKeyValue),
    );

  const listAll = (): Effect.Effect<readonly Hypothesis[], CompoundingError, never> =>
    Effect.sync(() =>
      insertionOrder
        .map((id) => store.get(id))
        .filter((h): h is Hypothesis => h !== undefined),
    );

  return { append, findById, findByCohort, listAll };
}

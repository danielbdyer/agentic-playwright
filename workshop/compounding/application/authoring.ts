/**
 * Hypothesis + ratchet authoring — pure application-layer helpers.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z9, operators author
 * hypotheses + ratchets via the CLI. The CLI is a thin shell over
 * these functions:
 *
 *   authorHypothesis    — validates the authoring input, mints a
 *                         UUIDv4 id if none provided, appends to
 *                         the HypothesisLedger.
 *   authorRatchet       — verifies the target scenario is currently
 *                         passing (fails with a clear error if not),
 *                         then appends a Ratchet to the ReceiptStore.
 *
 * Both functions return Effects that the CLI runs under the live
 * compounding Layer. Pure inputs; side-effects are the log appends.
 */

import { Effect } from 'effect';
import { randomUUID } from 'node:crypto';
import {
  hypothesisId,
  type Hypothesis,
} from '../domain/hypothesis';
import type { Cohort } from '../domain/cohort';
import type { Prediction } from '../domain/prediction';
import { ratchetId, type Ratchet } from '../domain/ratchet';
import type { CompoundingError } from '../domain/compounding-error';
import {
  evidenceQueryFailed,
} from '../domain/compounding-error';
import {
  HypothesisLedger,
  ReceiptStore,
} from './ports';

export interface HypothesisAuthoringInput {
  readonly description: string;
  readonly cohort: Cohort;
  readonly prediction: Prediction;
  readonly requiredConsecutiveConfirmations?: number;
  readonly supersedes?: string | null;
  readonly author?: string;
  readonly now?: () => Date;
  /** Optional explicit id; when absent a UUIDv4 is minted. */
  readonly id?: string;
}

export function authorHypothesis(
  input: HypothesisAuthoringInput,
): Effect.Effect<Hypothesis, CompoundingError, HypothesisLedger> {
  return Effect.gen(function* () {
    const ledger = yield* HypothesisLedger;
    const now = input.now?.() ?? new Date();
    const hypothesis: Hypothesis = {
      id: hypothesisId(input.id ?? randomUUID()),
      description: input.description,
      schemaVersion: 1,
      cohort: input.cohort,
      prediction: input.prediction,
      requiredConsecutiveConfirmations: input.requiredConsecutiveConfirmations ?? 3,
      supersedes: input.supersedes ? hypothesisId(input.supersedes) : null,
      author: input.author ?? 'operator',
      createdAt: now.toISOString(),
    };
    yield* ledger.append(hypothesis);
    return hypothesis;
  });
}

export interface RatchetAuthoringInput {
  readonly scenarioId: string;
  readonly now?: () => Date;
}

/** Author a Ratchet for the currently-passing scenario. Fails with
 *  EvidenceQueryFailed when the scenario is not currently passing
 *  in the latest receipt stream. */
export function authorRatchet(
  input: RatchetAuthoringInput,
): Effect.Effect<Ratchet, CompoundingError, ReceiptStore> {
  return Effect.gen(function* () {
    const store = yield* ReceiptStore;
    const scenarios = yield* store.latestScenarioReceipts();
    const passing = scenarios.find(
      (s) => s.payload.scenarioId === input.scenarioId && s.payload.verdict === 'trajectory-holds',
    );
    if (!passing) {
      return yield* Effect.fail(
        evidenceQueryFailed(
          `scenario:${input.scenarioId}`,
          `scenario ${input.scenarioId} is not currently passing (no trajectory-holds receipt found); cannot ratchet`,
        ),
      );
    }
    const now = input.now?.() ?? new Date();
    const ratchet: Ratchet = {
      id: ratchetId(input.scenarioId),
      scenarioId: input.scenarioId,
      firstPassedAt: now.toISOString(),
      firstPassedFingerprint: passing.fingerprints.artifact,
    };
    yield* store.appendRatchet(ratchet);
    return ratchet;
  });
}

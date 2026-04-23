/**
 * Hypothesis — the aggregate root of the compounding engine.
 *
 * Per docs/v2-compounding-engine-plan.md §3.1, a Hypothesis is an
 * append-only, machine-checkable prediction about how a receipt
 * stream (identified by Cohort) should move. Hypotheses are never
 * edited; they are superseded. The `supersedes` chain forms the
 * revision history.
 *
 * Cosmetic fields (description, author) are deliberately excluded
 * from `hypothesisKeyableShape` so wording edits to a hypothesis
 * description never drift its fingerprint. Law ZC10 (Z2) pins this.
 *
 * No Effect imports — this is the domain layer. The ledger's append
 * + read discipline lives in the application/harness layers.
 */

import type { Cohort } from './cohort';
import type { Prediction } from './prediction';

/** Branded hypothesis identity. Convention: UUIDv4 minted by the
 *  CLI's `tesseract compounding hypothesize` command. */
export type HypothesisId = string & { readonly __brand: 'HypothesisId' };

/** Convenience constructor that brands a string as a HypothesisId.
 *  Pure; the runtime check is identity. */
export function hypothesisId(value: string): HypothesisId {
  return value as HypothesisId;
}

/** The Hypothesis aggregate. */
export interface Hypothesis {
  readonly id: HypothesisId;
  /** Cosmetic prose describing the hypothesis. Excluded from
   *  fingerprint — wording changes never alter identity. */
  readonly description: string;
  /** Schema version for the hypothesis record shape. Bumped on
   *  additive migrations. */
  readonly schemaVersion: 1;
  readonly cohort: Cohort;
  readonly prediction: Prediction;
  /** Number of consecutive confirmation cycles the hypothesis must
   *  sustain before the graduation gate credits it. Default 3
   *  matches M5's MIN_TRAJECTORY_POINTS; operators may author a
   *  higher bar per hypothesis. */
  readonly requiredConsecutiveConfirmations: number;
  /** ID of the hypothesis this one replaces. Null for first-
   *  generation hypotheses. Append-only: a superseded hypothesis
   *  stays in the ledger as a historical record; the superseding
   *  entry references it by id. */
  readonly supersedes: HypothesisId | null;
  /** Cosmetic authorship string (commit SHA + author name, or a
   *  test fixture identifier). Excluded from fingerprint. */
  readonly author: string;
  /** ISO-8601 timestamp of hypothesis authoring. */
  readonly createdAt: string;
}

/** Canonical key: the substantive fields that define hypothesis
 *  identity. Cosmetic fields (description, author, createdAt) are
 *  excluded. This shape is the input to `hypothesisFingerprint`
 *  (landing at Z2). Two hypotheses with identical keyable shapes
 *  have the same fingerprint. */
export function hypothesisKeyableShape(h: Hypothesis): unknown {
  return {
    id: h.id,
    schemaVersion: h.schemaVersion,
    cohort: h.cohort,
    prediction: h.prediction,
    requiredConsecutiveConfirmations: h.requiredConsecutiveConfirmations,
    supersedes: h.supersedes,
  };
}

/**
 * Compounding fingerprints.
 *
 * Per docs/v2-compounding-engine-plan.md §9.2 (ZC10):
 *   - Same hypothesis → same fingerprint across calls.
 *   - Cosmetic-field change (description, author, createdAt) →
 *     same fingerprint (keyable shape excludes them).
 *   - Substantive-field change (cohort, prediction, supersedes,
 *     requiredConsecutiveConfirmations) → different fingerprint.
 *
 * Receipts fingerprint everything the scoreboard can meaningfully
 * depend on — the hypothesis id + fingerprint, the outcome, the
 * evidence ids, and the non-wall-clock portion of provenance.
 * Wall-clock `computedAt` is excluded so two identical cycles
 * under pinned `now` produce byte-equal receipt fingerprints.
 */

import {
  fingerprintFor,
  type Fingerprint,
} from '../../../product/domain/kernel/hash';
import type { Hypothesis } from '../domain/hypothesis';
import { hypothesisKeyableShape } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';

/** Content-address a hypothesis. Cosmetic fields (description,
 *  author, createdAt) are excluded by `hypothesisKeyableShape`. */
export function hypothesisFingerprint(hypothesis: Hypothesis): Fingerprint<'hypothesis'> {
  return fingerprintFor('hypothesis', hypothesisKeyableShape(hypothesis));
}

/** Content-address a hypothesis receipt. Includes the hypothesis
 *  fingerprint + the substantive outcome. Excludes `computedAt`
 *  so pinned-now runs produce byte-equal fingerprints. */
export function hypothesisReceiptFingerprint(
  receipt: HypothesisReceipt,
): Fingerprint<'hypothesis-receipt'> {
  return fingerprintFor(
    'hypothesis-receipt',
    hypothesisReceiptFingerprintSource(receipt.payload),
  );
}

/** Pure projection of a HypothesisReceipt payload onto the
 *  fields that constitute receipt identity. Exposed
 *  separately so the builder can fingerprint without a fully-
 *  constructed receipt. */
export function hypothesisReceiptFingerprintSource(
  payload: HypothesisReceipt['payload'],
): unknown {
  return {
    hypothesisId: payload.hypothesisId,
    hypothesisFingerprint: payload.hypothesisFingerprint,
    outcome: payload.outcome,
    evidenceReceiptIds: payload.evidenceReceiptIds,
    confirmedCount: payload.confirmedCount,
    refutedCount: payload.refutedCount,
    inconclusiveCount: payload.inconclusiveCount,
    cycleRate: payload.cycleRate,
    provenance: {
      substrateVersion: payload.provenance.substrateVersion,
      manifestVersion: payload.provenance.manifestVersion,
    },
  };
}

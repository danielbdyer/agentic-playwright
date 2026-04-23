/**
 * HypothesisReceipt — append-only evidence artifact emitted per
 * evaluation cycle.
 *
 * Per docs/v2-compounding-engine-plan.md §3.3, the HypothesisReceipt
 * extends WorkflowMetadata<'evidence'> with `kind='hypothesis-receipt'`
 * and `scope='hypothesis'`. Its payload records the cycle's
 * ConfirmationOutcome, the counts that produced it, and the
 * artifact ids of the ProbeReceipts / ScenarioReceipts that formed
 * this cycle's evidence (for indexed query; lineage.parents carries
 * the same information as fingerprints).
 *
 * One receipt per (hypothesis × cycle). Emitted by the application
 * layer's `buildHypothesisReceipt`; the filesystem harness appends
 * it to `workshop/logs/hypothesis-receipts/`.
 *
 * No Effect imports — pure types.
 */

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';
import type { ConfirmationOutcome } from './confirmation';
import type { HypothesisId } from './hypothesis';

export interface HypothesisReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'hypothesis-receipt';
  readonly scope: 'hypothesis';
  readonly payload: HypothesisReceiptPayload;
}

export interface HypothesisReceiptPayload {
  readonly hypothesisId: HypothesisId;
  readonly hypothesisFingerprint: Fingerprint<'hypothesis'>;
  readonly outcome: ConfirmationOutcome;
  /** ProbeReceipt / ScenarioReceipt artifact fingerprints that
   *  formed this cycle's evidence. Kept as a structured list for
   *  indexed query; lineage.parents carries the same information
   *  for envelope-level tooling. */
  readonly evidenceReceiptIds: readonly string[];
  readonly confirmedCount: number;
  readonly refutedCount: number;
  readonly inconclusiveCount: number;
  /** The exact cycle rate: confirmedCount / (confirmedCount +
   *  refutedCount). Stored (rather than re-derived) so snapshots
   *  stay self-contained. When the denominator is zero, emitters
   *  populate this with zero and the outcome is `inconclusive`. */
  readonly cycleRate: number;
  readonly provenance: HypothesisReceiptProvenance;
}

export interface HypothesisReceiptProvenance {
  readonly substrateVersion: string;
  readonly manifestVersion: number;
  readonly computedAt: string;
}

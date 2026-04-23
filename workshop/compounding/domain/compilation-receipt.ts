/**
 * CompilationReceipt — append-only evidence artifact emitted per
 * `tesseract compile --emit-compounding-receipt` invocation against
 * a single ADO test case.
 *
 * Per docs/v2-compounding-engine-plan.md Step 11 Z11a (the
 * customer-compilation cohort), the CompilationReceipt captures:
 *
 *   - Resolution outcomes across the test case's steps (how many
 *     resolved, how many needed human, how many blocked).
 *   - Intervention-fidelity floor: of the emitted handoffs, how
 *     many carried a valid missingContext payload (mechanical
 *     under Z11a; semantic under Z11d).
 *   - Cost envelope (reasoning receipt ids + total latency) —
 *     tagged-estimated until a live adapter measures tokens.
 *   - Corpus discriminator (`'resolvable'` | `'needs-human'`) that
 *     ties the receipt to the authoring Cohort.
 *
 * Envelope shape: extends WorkflowMetadata<'evidence'> with
 * `kind='compilation-receipt'` + `scope='compilation'`. Fingerprint
 * tag `'compilation-receipt'` is registered in
 * `product/domain/kernel/hash.ts`.
 *
 * One receipt per (adoId × cycle). Emitted by the application
 * layer's `buildCompilationReceipt` (lands in Z11a.4); the
 * filesystem harness appends to `workshop/logs/compilation-receipts/`.
 *
 * No Effect imports — pure types.
 */

import type { WorkflowMetadata } from '../../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../../product/domain/kernel/hash';

export type CustomerCompilationCorpus = 'resolvable' | 'needs-human';

export interface CompilationReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'compilation-receipt';
  readonly scope: 'compilation';
  readonly payload: CompilationReceiptPayload;
}

export interface CompilationReceiptPayload {
  /** The authored hypothesis this receipt binds to, or null if the
   *  CLI was invoked without a --hypothesis-id override. The
   *  compounding engine's filter-evidence pass uses this field
   *  identically to ProbeReceipt / ScenarioReceipt attribution. */
  readonly hypothesisId: string | null;

  /** The ADO test case the receipt covers. */
  readonly adoId: string;

  /** Which corpus the ADO case lives in. Binds the receipt to the
   *  matching CustomerCompilationCohort's corpus discriminator. */
  readonly corpus: CustomerCompilationCorpus;

  // ─── Resolution-path outcomes ────────────────────────────────

  /** Total step count across the ADO test case. */
  readonly totalStepCount: number;

  /** Steps that resolved via the 1st–6th lookup slot
   *  (explicit / override / canon / patterns / evidence / DOM).
   *  Confirmation-rate predictions divide this by totalStepCount. */
  readonly resolvedStepCount: number;

  /** Steps that hit the 7th lookup slot (needs-human) and emitted
   *  an InterventionHandoff. */
  readonly needsHumanStepCount: number;

  /** Steps that halted compilation (e.g., unresolvable assertion,
   *  malformed ADO input). Distinct from needs-human: blocked
   *  means "cannot proceed without author action of a more
   *  structural kind than a handoff." */
  readonly blockedStepCount: number;

  // ─── Intervention-fidelity floor ─────────────────────────────

  /** Count of InterventionHandoffs actually written to the task
   *  resolution. Equal to needsHumanStepCount under current
   *  semantics; kept as a separate field so a future "needs-human
   *  without handoff" bug is observable as a mismatch. */
  readonly handoffsEmitted: number;

  /** Of the emitted handoffs, how many carry a mechanically-valid
   *  missingContext payload (non-null + shape-valid). Under Z11a
   *  this is the definition of validity; Z11d upgrades the
   *  judgment to semantic (does missingContext name the right
   *  ambiguity?) without changing this field's shape. */
  readonly handoffsWithValidMissingContext: number;

  // ─── Cost envelope ────────────────────────────────────────────

  /** ReasoningReceipt artifact ids consumed while compiling this
   *  case. Joined at read time for cost-efficiency predictions
   *  (Z11c). */
  readonly reasoningReceiptIds: readonly string[];

  /** Total wall-clock ms across the compilation. Under deterministic
   *  adapter this is the compile pipeline's local-CPU time; under
   *  Z11d's claude-code-session adapter this includes fill-pass
   *  latency and is noise — interpret with caution. */
  readonly totalLatencyMs: number;

  // ─── Provenance ──────────────────────────────────────────────

  readonly provenance: CompilationReceiptProvenance;
}

export interface CompilationReceiptProvenance {
  readonly substrateVersion: string;
  readonly manifestVersion: number;
  readonly computedAt: string;
  /** Fingerprint of the ADO test case input (content-addressed)
   *  so drift between ADO revisions is observable as receipt-
   *  fingerprint drift across cycles. */
  readonly adoContentFingerprint: Fingerprint<'ado-content'>;
}

/**
 * ProbeReceipt — the append-only record the workshop emits every
 * time a probe executes.
 *
 * Per `docs/v2-direction.md §5.1` and `docs/v2-substrate.md §7`,
 * measurement is a derivation over the log set. The ProbeReceipt is
 * the log entry workshop produces per (probe, execution) pair; the
 * seven-visitor metric tree reads receipts (and the run records
 * product emits) to compute the scorecard. The receipt itself is
 * evidence, not a measurement.
 *
 * ## Envelope shape
 *
 * The receipt `extends WorkflowMetadata<'evidence'>` — it is an
 * evidence-stage artifact, not an execution-stage one. A probe's
 * execution produces TWO artifacts: (1) the product's RunRecord
 * (stage 'execution'), emitted through the normal authoring flow;
 * (2) the workshop's ProbeReceipt (stage 'evidence'), emitted by
 * the probe harness to classify and preserve the probe-specific
 * "did it match the fixture's expectation?" outcome. The receipt
 * carries a reference to the run record's fingerprint, not a copy
 * of its payload — one source of truth per concern.
 *
 * ## What a probe receipt captures
 *
 * - **identity**: `probeId` + `fixtureName` + `verb`. The probeId
 *   is the canonical `probe:<verb>:<fixture-name>` form.
 * - **cohort**: the ProbeSurfaceCohort triple (verb × facetKind ×
 *   errorFamily) that groups receipts for M5 trajectory computation.
 * - **outcome**: `completedAsExpected: boolean` + the observed
 *   classification + the observed error family (if any). Together
 *   these answer "did the probe exercise what its fixture said it
 *   would exercise?"
 * - **latency**: elapsedMs from the harness's entry point to the
 *   receipt's write. Probe latency is a first-class workshop
 *   metric (expensive probes are themselves a risk signal).
 * - **provenance**: the adapter that executed the probe (dry-run,
 *   fixture-replay, playwright-live, production), the manifest
 *   version it was derived against, and the fixture-document
 *   fingerprint.
 *
 * ## Why a dedicated receipt rather than reusing RunRecord
 *
 * RunRecord carries product-flow state: interpretation receipts,
 * execution timings, evidence-id fan-out, proposal bundles. A probe's
 * interesting questions live at a different resolution: "did this
 * probe match its fixture's expectation?" (a workshop question that
 * doesn't belong in product's memory of what happened). Keeping the
 * receipt separate keeps the product's log free of workshop-only
 * columns and keeps workshop's metric tree pure over its own inputs.
 *
 * ## Relationship to the hypothesis-confirmation loop
 *
 * When a probe is part of a hypothesis verification (a product
 * change predicted its metric would move in some direction), the
 * receipt's `hypothesisId` carries the proposal ID. `metric-
 * hypothesis-confirmation-rate` reads receipts where hypothesisId
 * is non-null and computes the confirmed-to-total ratio over a
 * rolling window. This is C6 (workshop graduation gate) in
 * probe-IR language per `docs/v2-substrate.md §8a`.
 *
 * Pure domain. No Effect. No IO. Writers live in the workshop
 * harness layer; readers live in workshop/metrics/.
 */

import type { WorkflowMetadata } from '../../product/domain/governance/workflow-types';
import type { Fingerprint } from '../../product/domain/kernel/hash';
import type { ProbeClassification } from './probe-ir';
import type { ProbeSurfaceCohort } from '../metrics/probe-surface-cohort';

/** Tag for the adapter that executed the probe. Distinguishes dry-
 *  harness (no real world) from substrate-backed executions. */
export type ProbeHarnessAdapter =
  | 'dry-harness'
  | 'fixture-replay'
  | 'playwright-live'
  | 'production';

/** The outcome the probe produced, juxtaposed against what it
 *  expected. When observed matches expected on both axes, the
 *  receipt is a confirmation; mismatches on either axis are the
 *  workshop's signal to investigate. */
export interface ProbeOutcome {
  readonly expected: {
    readonly classification: ProbeClassification;
    readonly errorFamily: string | null;
  };
  readonly observed: {
    readonly classification: ProbeClassification;
    readonly errorFamily: string | null;
  };
  /** True when observed.classification === expected.classification
   *  AND observed.errorFamily === expected.errorFamily. */
  readonly completedAsExpected: boolean;
}

/** Adapter-level provenance for the probe execution. */
export interface ProbeProvenance {
  readonly adapter: ProbeHarnessAdapter;
  /** Manifest version the probe was derived against (from
   *  manifest.json's `version` field). */
  readonly manifestVersion: number;
  /** Fingerprint of the fixture document that defined this probe —
   *  changes when the fixture YAML changes. */
  readonly fixtureFingerprint: Fingerprint<'content'>;
  /** When the harness started executing the probe. */
  readonly startedAt: string;
  /** When the harness finished and wrote the receipt. */
  readonly completedAt: string;
  /** Wall-clock latency in milliseconds. */
  readonly elapsedMs: number;
}

/** The append-only probe receipt. Evidence-stage envelope. */
export interface ProbeReceipt extends WorkflowMetadata<'evidence'> {
  readonly kind: 'probe-receipt';
  readonly scope: 'run';
  readonly payload: {
    /** Canonical probe ID (`probe:<verb>:<fixture-name>`). */
    readonly probeId: string;
    /** Verb the probe exercised. */
    readonly verb: string;
    /** Fixture name that seeded the probe. */
    readonly fixtureName: string;
    /** Probe-surface cohort the receipt contributes evidence to.
     *  M5 groups receipts by this key. */
    readonly cohort: ProbeSurfaceCohort;
    /** Outcome juxtaposition. */
    readonly outcome: ProbeOutcome;
    /** Adapter provenance. */
    readonly provenance: ProbeProvenance;
    /** Optional reference to the product RunRecord the probe
     *  produced alongside — null when the probe did not flow
     *  through the full product pipeline (e.g. dry-harness mode). */
    readonly runRecordRef: {
      readonly adoId: string;
      readonly runId: string;
    } | null;
    /** Optional hypothesis proposal ID this probe is verifying.
     *  Non-null when the probe was run as part of a hypothesis-
     *  verification loop; feeds `metric-hypothesis-confirmation-
     *  rate` per v2-substrate §8a. */
    readonly hypothesisId: string | null;
  };
}

/** Construct a ProbeReceipt from its pieces. The constructor
 *  computes `completedAsExpected` and assigns the stage/scope
 *  constants — callers supply only the meaningful fields. Pure. */
export function probeReceipt(input: {
  readonly probeId: string;
  readonly verb: string;
  readonly fixtureName: string;
  readonly cohort: ProbeSurfaceCohort;
  readonly expected: ProbeOutcome['expected'];
  readonly observed: ProbeOutcome['observed'];
  readonly provenance: ProbeProvenance;
  readonly runRecordRef: ProbeReceipt['payload']['runRecordRef'];
  readonly hypothesisId: string | null;
  readonly artifactFingerprint: Fingerprint<'artifact'>;
  readonly contentFingerprint: Fingerprint<'content'>;
}): ProbeReceipt {
  const completedAsExpected =
    input.expected.classification === input.observed.classification &&
    input.expected.errorFamily === input.observed.errorFamily;
  return {
    version: 1,
    stage: 'evidence',
    scope: 'run',
    ids: {
      ...(input.runRecordRef ? { runId: input.runRecordRef.runId } : {}),
    },
    fingerprints: {
      artifact: input.artifactFingerprint,
      content: input.contentFingerprint,
    },
    lineage: {
      sources: [`fixture:${input.verb}:${input.fixtureName}`],
      parents: [],
      handshakes: ['evidence'],
    },
    governance: 'approved',
    kind: 'probe-receipt',
    payload: {
      probeId: input.probeId,
      verb: input.verb,
      fixtureName: input.fixtureName,
      cohort: input.cohort,
      outcome: {
        expected: input.expected,
        observed: input.observed,
        completedAsExpected,
      },
      provenance: input.provenance,
      runRecordRef: input.runRecordRef,
      hypothesisId: input.hypothesisId,
    },
  };
}

/** True when the receipt confirms its fixture's expectation. */
export function confirmsExpectation(receipt: ProbeReceipt): boolean {
  return receipt.payload.outcome.completedAsExpected;
}

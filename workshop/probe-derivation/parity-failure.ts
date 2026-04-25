/**
 * ParityFailureRecord — the evidence emitted when a probe's
 * receipts at two adjacent substrate rungs disagree on
 * invariant-band axes.
 *
 * Per the substrate-ladder plan (docs/v2-substrate-ladder-plan.md
 * §§7.2, 9.2), the substrate-invariance theorem asserts that a
 * probe's classification is identical across any substrate
 * presenting the same world-shape. A parity failure is a
 * refutation of that theorem for a specific (probe, rung-pair,
 * substrate-version) triple. The record carries both rungs'
 * `invariantContent` fingerprints so post-hoc audits can
 * reconstruct the divergence.
 *
 * ## When parity checking applies
 *
 * Parity is only meaningful when:
 *   - both receipts reference the same probe (same probeId),
 *   - both were produced at the same SUBSTRATE_VERSION.
 *
 * The `check-rung-parity` module treats cross-probe or cross-
 * substrate-version calls as programmer errors, not parity
 * failures — surfacing them as thrown exceptions rather than
 * ParityFailureRecords (evidence recordkeeping requires the
 * cohort key to be stable).
 *
 * Pure domain. Writers live at spike-harness or CLI boundaries.
 */

import type { WorkflowMetadata } from '../../product/domain/governance/workflow-types';
import { fingerprintFor, type Fingerprint } from '../../product/domain/kernel/hash';
import { closedUnion } from '../../product/domain/algebra/closed-union';
import type { ProbeHarnessAdapter } from './probe-receipt';

/** The single axis on which a parity check can diverge. Closed
 *  union — new axes require explicit plan + law updates. */
export type ParityDivergenceAxis = 'classification' | 'error-family';

/** Runtime witness for the ParityDivergenceAxis closed union. */
const PARITY_DIVERGENCE_AXIS_UNION = closedUnion<ParityDivergenceAxis>([
  'classification',
  'error-family',
]);

export const PARITY_DIVERGENCE_AXIS_VALUES =
  PARITY_DIVERGENCE_AXIS_UNION.values;

/** Exhaustive fold over ParityDivergenceAxis. Closes the gap
 *  where the comment above claimed closedness but no
 *  compile-time guard enforced it. */
export function foldParityDivergenceAxis<R>(
  axis: ParityDivergenceAxis,
  cases: {
    readonly classification: () => R;
    readonly errorFamily: () => R;
  },
): R {
  switch (axis) {
    case 'classification':
      return cases.classification();
    case 'error-family':
      return cases.errorFamily();
  }
}

/** The reified refutation. Evidence-stage envelope. */
export interface ParityFailureRecord extends WorkflowMetadata<'evidence'> {
  readonly kind: 'parity-failure';
  readonly scope: 'run';
  readonly payload: {
    /** The probe whose receipts disagree. */
    readonly probeId: string;
    /** Fixture coordinates (for dashboard / diagnostic legibility). */
    readonly fixtureRef: {
      readonly verb: string;
      readonly fixtureName: string;
    };
    /** The substrate-version both receipts were produced under.
     *  Parity checks are scoped to a single substrateVersion; a
     *  cross-version comparison is a programmer error. */
    readonly substrateVersion: string;
    /** The (lower, higher) adapter pair being compared. Order is
     *  caller-determined; typically 'dry-harness' (lower) →
     *  'fixture-replay' (higher) → 'playwright-live' (higher) →
     *  'commoncrawl-derived' (highest). */
    readonly rungPair: readonly [ProbeHarnessAdapter, ProbeHarnessAdapter];
    /** Which axis diverged and the two values observed. Only
     *  one divergence is surfaced per record (the first mismatched
     *  axis under a fixed evaluation order: classification, then
     *  error-family). */
    readonly divergence: {
      readonly axis: ParityDivergenceAxis;
      readonly lowerRungValue: string | null;
      readonly higherRungValue: string | null;
    };
    /** When the parity check emitted the record. */
    readonly detectedAt: string;
    /** Both rungs' invariant-band sub-fingerprints, preserved so
     *  post-hoc audits can verify the divergence against the
     *  receipts' own provenance. Order matches rungPair. */
    readonly observedFingerprints: readonly [
      Fingerprint<'probe-receipt-invariant'>,
      Fingerprint<'probe-receipt-invariant'>,
    ];
  };
}

/** Construct a ParityFailureRecord. Pure. Callers supply the
 *  meaningful fields; the constructor computes artifact +
 *  content fingerprints + assigns envelope constants. */
export function parityFailureRecord(input: {
  readonly probeId: string;
  readonly fixtureRef: ParityFailureRecord['payload']['fixtureRef'];
  readonly substrateVersion: string;
  readonly rungPair: ParityFailureRecord['payload']['rungPair'];
  readonly divergence: ParityFailureRecord['payload']['divergence'];
  readonly detectedAt: string;
  readonly observedFingerprints: ParityFailureRecord['payload']['observedFingerprints'];
}): ParityFailureRecord {
  const payload = {
    probeId: input.probeId,
    fixtureRef: input.fixtureRef,
    substrateVersion: input.substrateVersion,
    rungPair: input.rungPair,
    divergence: input.divergence,
    detectedAt: input.detectedAt,
    observedFingerprints: input.observedFingerprints,
  };
  return {
    version: 1,
    stage: 'evidence',
    scope: 'run',
    ids: {},
    fingerprints: {
      artifact: fingerprintFor('artifact', payload),
      content: fingerprintFor('content', payload),
    },
    lineage: {
      sources: [`parity-check:${input.rungPair[0]}↔${input.rungPair[1]}:${input.probeId}`],
      parents: [],
      handshakes: ['evidence'],
    },
    governance: 'approved',
    kind: 'parity-failure',
    payload,
  };
}

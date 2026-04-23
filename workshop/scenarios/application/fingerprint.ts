/**
 * Scenario fingerprinting.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.4 (SC15/SC16), the
 * scenario's fingerprint:
 *   - Excludes cosmetic fields (description, step names) — pinned by
 *     scenarioKeyableShape.
 *   - Stable across runs given the same authored scenario.
 *
 * The receipt's fingerprint covers the trace + invariant outcomes
 * + provenance in addition to the scenario fingerprint, so two
 * runs of the same scenario under different conditions produce
 * different receipt fingerprints.
 */

import {
  fingerprintFor,
  type Fingerprint,
} from '../../../product/domain/kernel/hash';
import type { Scenario } from '../domain/scenario';
import { scenarioKeyableShape } from '../domain/scenario';
import type { ScenarioReceipt } from '../domain/scenario-receipt';

export function scenarioFingerprint(scenario: Scenario): Fingerprint<'scenario'> {
  return fingerprintFor('scenario', scenarioKeyableShape(scenario));
}

/** Fingerprint the receipt's payload — covers everything that
 *  could vary between runs (trace, invariant outcomes, provenance,
 *  the scenario itself). */
export function scenarioReceiptFingerprint(
  receipt: ScenarioReceipt,
): Fingerprint<'scenario-receipt'> {
  return fingerprintFor('scenario-receipt', {
    scenarioId: receipt.payload.scenarioId,
    scenarioFingerprint: receipt.payload.scenarioFingerprint,
    trace: receipt.payload.trace,
    invariantOutcomes: receipt.payload.invariantOutcomes,
    verdict: receipt.payload.verdict,
    // Provenance excludes wall-clock timing fields so two runs
    // with pinned `now` produce identical fingerprints.
    provenance: {
      harness: receipt.payload.provenance.harness,
      substrateVersion: receipt.payload.provenance.substrateVersion,
      manifestVersion: receipt.payload.provenance.manifestVersion,
    },
  });
}

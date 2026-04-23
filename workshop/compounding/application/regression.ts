/**
 * computeRegressionReport — pure regression detection.
 *
 * Per docs/v2-compounding-engine-plan.md §9.5 (ZC21, ZC22), the
 * regression detector compares a prior pass-list (from the most-
 * recent-prior scoreboard snapshot, or empty if none) with the
 * current cycle's receipts.
 *
 *   newlyFailing  — artifact ids in priorPassing but currently failing.
 *   newlyPassing  — artifact ids currently passing but absent from
 *                   priorPassing.
 *   ratchetBreaks — for every active ratchet, if its
 *                   firstPassedFingerprint is currently NOT in the
 *                   passing set, emit a RatchetBreakDetail.
 *
 * "Passing" semantics:
 *   - ProbeReceipt   — payload.outcome.completedAsExpected === true
 *   - ScenarioReceipt — payload.verdict === 'trajectory-holds'
 *
 * No Effect imports.
 */

import type {
  RatchetBreakDetail,
  RegressionReport,
} from '../domain/regression';
import type { Ratchet } from '../domain/ratchet';
import type { ProbeReceiptLike, ScenarioReceiptLike } from './ports';

export interface RegressionInputs {
  readonly priorPassing: ReadonlySet<string>;
  readonly baselineFingerprint: string;
  readonly currentFingerprint: string;
  readonly probeReceipts: readonly ProbeReceiptLike[];
  readonly scenarioReceipts: readonly ScenarioReceiptLike[];
  readonly ratchets: readonly Ratchet[];
  readonly now: () => Date;
}

export function computeRegressionReport(inputs: RegressionInputs): RegressionReport {
  const currentPassing = new Set<string>();
  const currentFailing = new Set<string>();
  for (const r of inputs.probeReceipts) {
    if (r.payload.outcome.completedAsExpected) {
      currentPassing.add(r.fingerprints.artifact);
    } else {
      currentFailing.add(r.fingerprints.artifact);
    }
  }
  for (const r of inputs.scenarioReceipts) {
    if (r.payload.verdict === 'trajectory-holds') {
      currentPassing.add(r.fingerprints.artifact);
    } else {
      currentFailing.add(r.fingerprints.artifact);
    }
  }

  const newlyFailing: string[] = [];
  for (const id of inputs.priorPassing) {
    if (currentFailing.has(id)) newlyFailing.push(id);
  }
  newlyFailing.sort();

  const newlyPassing: string[] = [];
  for (const id of currentPassing) {
    if (!inputs.priorPassing.has(id)) newlyPassing.push(id);
  }
  newlyPassing.sort();

  const nowIso = inputs.now().toISOString();
  const ratchetBreaks: RatchetBreakDetail[] = [];
  for (const ratchet of inputs.ratchets) {
    const fp = ratchet.firstPassedFingerprint;
    if (!currentPassing.has(fp)) {
      ratchetBreaks.push({
        ratchetId: ratchet.id,
        scenarioId: ratchet.scenarioId,
        brokenAt: nowIso,
        firstPassedAt: ratchet.firstPassedAt,
      });
    }
  }

  return {
    baselineFingerprint: inputs.baselineFingerprint,
    currentFingerprint: inputs.currentFingerprint,
    newlyFailing,
    newlyPassing,
    ratchetBreaks,
  };
}

/** Derive the passing artifact-id set from a cycle's receipts. */
export function passingArtifactIds(
  probeReceipts: readonly ProbeReceiptLike[],
  scenarioReceipts: readonly ScenarioReceiptLike[],
): ReadonlySet<string> {
  const passing = new Set<string>();
  for (const r of probeReceipts) {
    if (r.payload.outcome.completedAsExpected) passing.add(r.fingerprints.artifact);
  }
  for (const r of scenarioReceipts) {
    if (r.payload.verdict === 'trajectory-holds') passing.add(r.fingerprints.artifact);
  }
  return passing;
}

/**
 * computeTrajectories — pure cohort-grouping derivation.
 *
 * Per docs/v2-compounding-engine-plan.md §9.5 (ZC20), per-cohort
 * trajectories are built by walking the hypothesis receipts + the
 * probe/scenario receipts for the current cycle and folding by
 * cohort key.
 *
 * The trajectory is keyed by the hypothesis's cohort (not the
 * probe's cohort triple directly). Each HypothesisReceipt
 * contributes one entry per cycle — the cycle stamp is the
 * receipt's computedAt.
 *
 * No Effect imports.
 */

import { SUBSTRATE_VERSION } from '../../substrate/version';
import { cohortKey } from '../domain/cohort';
import type { Hypothesis } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Trajectory, TrajectoryEntry } from '../domain/trajectory';

export function computeTrajectories(
  hypotheses: readonly Hypothesis[],
  hypothesisReceipts: readonly HypothesisReceipt[],
): readonly Trajectory[] {
  const receiptsByHypothesis = new Map<string, HypothesisReceipt[]>();
  for (const r of hypothesisReceipts) {
    const list = receiptsByHypothesis.get(r.payload.hypothesisId) ?? [];
    list.push(r);
    receiptsByHypothesis.set(r.payload.hypothesisId, list);
  }

  const trajectories = new Map<string, TrajectoryEntry[]>();
  for (const h of hypotheses) {
    const key = cohortKey(h.cohort);
    const entries: TrajectoryEntry[] = trajectories.get(key) ?? [];
    const receipts = receiptsByHypothesis.get(h.id) ?? [];
    for (const r of receipts) {
      entries.push({
        cohortId: key,
        timestamp: r.payload.provenance.computedAt,
        sampleSize:
          r.payload.confirmedCount + r.payload.refutedCount + r.payload.inconclusiveCount,
        confirmedCount: r.payload.confirmedCount,
        refutedCount: r.payload.refutedCount,
        rate: r.payload.cycleRate,
        substrateVersion: r.payload.provenance.substrateVersion || SUBSTRATE_VERSION,
      });
    }
    trajectories.set(key, entries);
  }

  return Array.from(trajectories.entries())
    .filter(([, entries]) => entries.length > 0)
    .map(([cohortId, entries]) => ({
      cohortId,
      entries: entries.sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    }));
}

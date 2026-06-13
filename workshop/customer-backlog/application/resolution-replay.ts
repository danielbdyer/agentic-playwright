/**
 * Offline resolution replay (Cycle 11 / G3).
 *
 * Praxis audit §G3: every cohort measurement was hostage to live
 * substrate drift — no bisection, no ablation, no N-trial without N
 * live contacts, and for a held-out, every extra contact spends the
 * asset. Capture-and-replay turns the single permitted held-out
 * contact into a frozen substrate that can be re-analyzed forever.
 *
 * This module is the replay half: given a `ResolutionTrace` captured
 * during a live run (the query counts + harvested inventory the
 * ladder consumed), it reconstructs the SAME resolution verdict
 * (resolution + rung + accepted name) purely — no browser, no
 * network. The reconstruction mirrors `probeByRoleLadder` exactly,
 * re-deriving the inventory-rung decision through the SAME pure
 * kernel the live run used.
 *
 * Acknowledged limit (audit §G3): a frozen trace replays the
 * resolution DECISION, not narrative-execute state transitions, and
 * cannot run a *different* classifier against the page (that would
 * need the full DOM). It makes the resolution verdict — the thing
 * under measurement — reproducible, which is what regression
 * bisection and held-out re-analysis require.
 *
 * Pure — no IO, no Effect.
 */

import {
  rankCandidates,
  selectDominantCandidate,
} from '../../../product/domain/resolution/patterns/degraded-resolution';
import type {
  ResolutionTrace,
  StepDomResolution,
  ResolutionRung,
} from './public-aut-runner';

export interface ReplayedVerdict {
  readonly resolution: StepDomResolution;
  readonly rung: ResolutionRung | null;
  /** The accepted accessible name when the inventory rung matched;
   *  null for strict/phrase-reduction (the count, not the name, is
   *  captured for those) and for handoffs. */
  readonly acceptedName: string | null;
}

/**
 * Reconstruct the ladder verdict from a captured trace. Mirrors
 * `probeByRoleLadder`'s control flow:
 *
 *   strictCount === 1                    → matched, strict
 *   else (strictCount === 0):
 *     first reduction with count === 1   → matched, phrase-reduction
 *   inventory rung (runs whenever strict ≠ 1):
 *     dominant via kernel + confirmation → matched, inventory-scored
 *   else: strictCount > 1 ? ambiguous : not-found
 */
export function replayResolutionTrace(trace: ResolutionTrace): ReplayedVerdict {
  // Cycle 11 / G7: the structured (pattern-registry) rung ran first
  // live. Its inputs (the full live SurfaceIndex) are not captured
  // in the lightweight trace, so replay trusts the recorded verdict
  // bit — consistent with G3's "replay the verdict, not re-run the
  // matchers" scope. The inventory rung below IS fully re-derived.
  if (trace.structured?.matched) {
    return { resolution: 'matched', rung: 'structured-pattern', acceptedName: null };
  }

  if (trace.strictCount === 1) {
    return { resolution: 'matched', rung: 'strict', acceptedName: null };
  }

  // Phrase-reduction rung only ran when strict found nothing.
  if (trace.strictCount === 0) {
    for (const r of trace.reductions) {
      if (r.count === 1) {
        return { resolution: 'matched', rung: 'phrase-reduction', acceptedName: null };
      }
    }
  }

  // Inventory rung — re-derive the dominant candidate through the
  // same pure kernel, then apply the captured confirmation counts.
  const ranked = rankCandidates(trace.phrase ?? '', trace.inventory);
  const dominant = trace.phrase ? selectDominantCandidate(ranked) : null;
  if (
    dominant &&
    trace.confirmation &&
    dominant.name === trace.confirmation.name &&
    (trace.confirmation.exactCount === 1 || trace.confirmation.looseCount === 1)
  ) {
    return { resolution: 'matched', rung: 'inventory-scored', acceptedName: dominant.name };
  }

  return {
    resolution: trace.strictCount > 1 ? 'ambiguous' : 'not-found',
    rung: null,
    acceptedName: null,
  };
}

/**
 * A replay is faithful iff it reconstructs the live verdict the
 * trace recorded. Used by the capture-replay law and by an
 * offline-bisection harness to confirm a frozen substrate still
 * resolves as it did when captured.
 */
export function replayMatchesLive(trace: ResolutionTrace): boolean {
  const replayed = replayResolutionTrace(trace);
  return (
    replayed.resolution === trace.liveResolution &&
    replayed.rung === trace.liveRung
  );
}

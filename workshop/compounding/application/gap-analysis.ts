/**
 * computeGapReport — pure coverage-gap derivation.
 *
 * Per docs/v2-compounding-engine-plan.md §9.5 (ZC24), the gap
 * derivation walks the current probe + scenario receipts and names
 * the coverage holes.
 *
 *   probeGaps    — (verb, facetKind[, errorFamily]) triples that a
 *                  provided "target set" calls for but that are
 *                  missing from passing receipts this cycle.
 *   scenarioGaps — topologyId → invariant names that are authored
 *                  but currently uncovered (no passing scenario).
 *
 * The target sets are inputs (computed upstream from the manifest
 * + scenario corpus). Pure — no Effect imports.
 */

import type { GapReport, ProbeGap, ScenarioGap } from '../domain/gap-analysis';
import type { ProbeReceiptLike, ScenarioReceiptLike } from './ports';

export interface ProbeTarget {
  readonly verb: string;
  readonly facetKind: string;
  readonly errorFamily: string | null;
}

export interface ScenarioTarget {
  readonly topologyId: string;
  readonly requiredInvariants: readonly string[];
  readonly passingScenarioIds: readonly string[];
}

export interface GapInputs {
  readonly probeTargets: readonly ProbeTarget[];
  readonly scenarioTargets: readonly ScenarioTarget[];
  readonly probeReceipts: readonly ProbeReceiptLike[];
  readonly scenarioReceipts: readonly ScenarioReceiptLike[];
  readonly now: () => Date;
  /** Mapping from scenario ids that currently pass to the set of
   *  invariant names their receipts asserted held. Populated by
   *  upstream composition; absent values default to the empty set. */
  readonly invariantsHeldByScenario?: ReadonlyMap<string, ReadonlySet<string>>;
}

export function computeGapReport(inputs: GapInputs): GapReport {
  const passingProbeSurfaces = new Set<string>();
  for (const r of inputs.probeReceipts) {
    if (!r.payload.outcome.completedAsExpected) continue;
    passingProbeSurfaces.add(probeSurfaceKey(r.payload.cohort));
  }

  const probeGaps: ProbeGap[] = [];
  for (const target of inputs.probeTargets) {
    if (!passingProbeSurfaces.has(probeSurfaceKey(target))) {
      probeGaps.push({
        verb: target.verb,
        facetKind: target.facetKind,
        errorFamily: target.errorFamily,
      });
    }
  }

  const heldMap = inputs.invariantsHeldByScenario ?? new Map<string, ReadonlySet<string>>();
  const scenarioGaps: ScenarioGap[] = [];
  for (const target of inputs.scenarioTargets) {
    const uncovered: string[] = [];
    for (const inv of target.requiredInvariants) {
      const anyPassing = target.passingScenarioIds.some((sid) => {
        const held = heldMap.get(sid);
        return held !== undefined && held.has(inv);
      });
      if (!anyPassing) uncovered.push(inv);
    }
    if (uncovered.length > 0) {
      scenarioGaps.push({ topologyId: target.topologyId, uncoveredInvariants: uncovered });
    }
  }

  return {
    probeGaps,
    scenarioGaps,
    generatedAt: inputs.now().toISOString(),
  };
}

function probeSurfaceKey(cohort: {
  readonly verb: string;
  readonly facetKind: string;
  readonly errorFamily: string | null;
}): string {
  return `${cohort.verb}|${cohort.facetKind}|${cohort.errorFamily ?? 'none'}`;
}

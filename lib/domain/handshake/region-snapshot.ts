/**
 * Region Snapshot Capture — pure domain function that computes a
 * RegionMetricSnapshot from run records filtered to an
 * intervention's attachment region.
 *
 * This is the data-capture half of the C6 braid. The impact
 * scheduler (application layer) calls this function twice:
 *   1. At intervention activation time → "before" snapshot
 *   2. After N subsequent runs → "after" snapshot
 * Then it calls computeInterventionImpact(before, after) to
 * produce the populated InterventionTokenImpact.
 *
 * Pure domain — no Effect, no IO.
 *
 * @see docs/cold-start-convergence-plan.md § 4.C item 2
 */

import type { ScreenId, ElementId } from '../kernel/identity';
import type { InterventionAttachmentRegion } from './intervention';
import type { RegionMetricSnapshot } from './intervention-impact';

// ─── Resolution step shape ──────────────────────────────────────

/** The minimal shape of a resolution step needed for snapshot
 *  computation. Structural type — accepts any object with these
 *  fields regardless of the full step/receipt generic paramters. */
export interface ResolutionStepShape {
  /** The screen the step resolved against. */
  readonly screen?: ScreenId | null | undefined;
  /** The element the step resolved against. */
  readonly element?: ElementId | null | undefined;
  /** The winning resolution source — the rung that produced the
   *  binding. Used for rung distribution computation. */
  readonly winningSource: string;
  /** The governance state of the step's resolution. */
  readonly governance: string;
  /** Whether the step required agent interpretation (ambiguity). */
  readonly kind: string;
}

// ─── Snapshot capture ───────────────────────────────────────────

/** Capture a RegionMetricSnapshot from a collection of resolution
 *  steps filtered to an attachment region.
 *
 *  The function:
 *    1. Filters steps to those whose screen/element is within the
 *       attachment region
 *    2. Computes ambiguityRate = fraction of filtered steps with
 *       kind === 'agent-interpreted' or kind === 'needs-human'
 *    3. Computes suspensionRate = fraction with governance ===
 *       'review-required' or governance === 'blocked'
 *    4. Computes meanRungIndex = average position of the winning
 *       source in the standard rung ordering (alphabetical — lower
 *       is better, matching the fidelity visitor convention)
 *
 *  Returns a zero snapshot when no steps match the region. */
export function captureRegionSnapshot(input: {
  readonly steps: readonly ResolutionStepShape[];
  readonly region: InterventionAttachmentRegion;
}): RegionMetricSnapshot {
  const regionScreens = new Set(input.region.screens.map(String));
  const regionElements = new Set(
    input.region.elements.map(([s, e]) => `${s}:${e}`),
  );

  // Filter steps to those within the attachment region.
  // A step matches if its screen is in the region OR its
  // screen:element pair is in the region's elements list.
  const matchingSteps = input.steps.filter((step) => {
    if (step.screen && regionScreens.has(String(step.screen))) return true;
    if (step.screen && step.element && regionElements.has(`${step.screen}:${step.element}`)) return true;
    return false;
  });

  const total = matchingSteps.length;
  if (total === 0) {
    return { ambiguityRate: 0, suspensionRate: 0, meanRungIndex: 0 };
  }

  // Ambiguity: steps where the agent had to interpret or couldn't
  const ambiguousCount = matchingSteps.filter(
    (s) => s.kind === 'agent-interpreted' || s.kind === 'needs-human',
  ).length;

  // Suspension: steps with non-approved governance
  const suspendedCount = matchingSteps.filter(
    (s) => s.governance === 'review-required' || s.governance === 'blocked',
  ).length;

  // Mean rung index: collect unique winning sources, sort
  // alphabetically (consistent with fidelity visitor), compute
  // weighted average index.
  const rungCounts = new Map<string, number>();
  for (const step of matchingSteps) {
    rungCounts.set(step.winningSource, (rungCounts.get(step.winningSource) ?? 0) + 1);
  }
  const sortedRungs = [...rungCounts.keys()].sort();
  let weightedSum = 0;
  for (let i = 0; i < sortedRungs.length; i++) {
    weightedSum += i * (rungCounts.get(sortedRungs[i]!) ?? 0);
  }
  const meanRungIndex = weightedSum / total;

  return {
    ambiguityRate: round4(ambiguousCount / total),
    suspensionRate: round4(suspendedCount / total),
    meanRungIndex: round4(meanRungIndex),
  };
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

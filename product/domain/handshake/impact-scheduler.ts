/**
 * Impact Scheduler — pure domain logic for scheduling and computing
 * the C6 before/after measurement on intervention receipts.
 *
 * The scheduler does not do IO. It operates on collections of
 * receipts and resolution steps, and produces `InterventionImpactReceipt`
 * values that the application layer writes to disk.
 *
 * The flow:
 *   1. identifyMeasurableInterventions — filter receipts that have
 *      an attachmentRegion and haven't been measured yet
 *   2. For each measurable intervention, the application layer
 *      provides "before" steps (at activation time) and "after"
 *      steps (from subsequent runs)
 *   3. measureIntervention — capture before/after snapshots and
 *      compute the impact
 *
 * Pure domain — no Effect, no IO.
 *
 * @see docs/cold-start-convergence-plan.md § 4.C item 2
 */

import type { InterventionReceipt, InterventionAttachmentRegion } from './intervention';
import type { InterventionImpactReceipt } from './intervention-impact';
import { buildInterventionImpactReceipt } from './intervention-impact';
import { captureRegionSnapshot, type ResolutionStepShape } from './region-snapshot';

// ─── Identification ─────────────────────────────────────────────

/** An intervention receipt that is eligible for C6 measurement:
 *  it has an attachmentRegion and a completed status. */
export interface MeasurableIntervention {
  readonly interventionId: string;
  readonly region: InterventionAttachmentRegion;
  readonly receipt: InterventionReceipt;
}

/** Filter a collection of intervention receipts to those eligible
 *  for C6 measurement. A receipt is measurable when:
 *    - it has a handoff with an attachmentRegion
 *    - its status is 'completed'
 *    - it hasn't already been measured (not in the measured set) */
export function identifyMeasurableInterventions(input: {
  readonly receipts: readonly InterventionReceipt[];
  readonly alreadyMeasuredIds: ReadonlySet<string>;
}): readonly MeasurableIntervention[] {
  return input.receipts.flatMap((receipt) => {
    if (receipt.status !== 'completed') return [];
    const region = receipt.handoff?.attachmentRegion;
    if (!region) return [];
    if (input.alreadyMeasuredIds.has(receipt.interventionId)) return [];
    return [{
      interventionId: receipt.interventionId,
      region,
      receipt,
    }];
  });
}

// ─── Measurement ────────────────────────────────────────────────

/** Input for measuring a single intervention's impact. The
 *  application layer provides the before/after resolution steps;
 *  this function does the pure computation. */
export interface MeasureInterventionInput {
  readonly intervention: MeasurableIntervention;
  /** Resolution steps from runs BEFORE the intervention activated. */
  readonly beforeSteps: readonly ResolutionStepShape[];
  /** Resolution steps from runs AFTER the intervention activated. */
  readonly afterSteps: readonly ResolutionStepShape[];
  /** ISO timestamp of the measurement. */
  readonly observedAt: string;
  /** Estimated read tokens for the intervention's payload. */
  readonly estimatedReadTokens: number;
  /** Size in bytes of the intervention's payload. */
  readonly payloadSizeBytes: number;
}

/** Compute the C6 impact for a single intervention. Pure function.
 *
 *  1. Capture "before" region snapshot from beforeSteps
 *  2. Capture "after" region snapshot from afterSteps
 *  3. Compute the delta via computeInterventionImpact
 *  4. Build the full InterventionImpactReceipt */
export function measureIntervention(
  input: MeasureInterventionInput,
): InterventionImpactReceipt {
  const before = captureRegionSnapshot({
    steps: input.beforeSteps,
    region: input.intervention.region,
  });
  const after = captureRegionSnapshot({
    steps: input.afterSteps,
    region: input.intervention.region,
  });

  return buildInterventionImpactReceipt({
    interventionId: input.intervention.interventionId,
    attachedRegion: regionToString(input.intervention.region),
    observedAt: input.observedAt,
    before,
    after,
  });
}

/** Serialize a region to a stable string for receipt storage. */
function regionToString(region: InterventionAttachmentRegion): string {
  return [
    ...region.screens.map((s) => `screen:${s}`),
    ...region.elements.map(([s, e]) => `element:${s}:${e}`),
    ...region.runbookRefs.map((r) => `runbook:${r}`),
  ].sort().join(',');
}

// ─── Batch measurement ──────────────────────────────────────────

/** Measure all measurable interventions from a batch of receipts
 *  against before/after step collections. Pure function over
 *  the entire batch — the application layer calls this once per
 *  improvement iteration with the accumulated receipts and steps. */
export function measureInterventionBatch(input: {
  readonly interventions: readonly MeasurableIntervention[];
  /** Resolution steps from runs BEFORE any interventions activated. */
  readonly beforeSteps: readonly ResolutionStepShape[];
  /** Resolution steps from runs AFTER all interventions activated. */
  readonly afterSteps: readonly ResolutionStepShape[];
  readonly observedAt: string;
  /** Default payload size/token estimates when per-intervention
   *  data is not available. */
  readonly defaultEstimatedReadTokens: number;
  readonly defaultPayloadSizeBytes: number;
}): readonly InterventionImpactReceipt[] {
  return input.interventions.map((intervention) =>
    measureIntervention({
      intervention,
      beforeSteps: input.beforeSteps,
      afterSteps: input.afterSteps,
      observedAt: input.observedAt,
      estimatedReadTokens: intervention.receipt.handoff?.tokenImpact?.estimatedReadTokens
        ?? input.defaultEstimatedReadTokens,
      payloadSizeBytes: intervention.receipt.handoff?.tokenImpact?.payloadSizeBytes
        ?? input.defaultPayloadSizeBytes,
    }),
  );
}

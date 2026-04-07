/**
 * InterventionImpactReceipt — closes the H2 (translation efficiency)
 * loop from the temporal-epistemic addendum.
 *
 * Today's `InterventionTokenImpact` ships with the denominator
 * (`payloadSizeBytes`, `estimatedReadTokens`) but never the numerator
 * (`ambiguityReduction`, `suspensionAvoided`, `rungImprovement`,
 * `activationQuality`). Every dashboard that ranks handoffs by
 * "impact" today is ranking by inverse-size, not by value.
 *
 * The impact tracker fills the numerator by comparing region metrics
 * before and after an intervention is accepted. The original receipt
 * is immutable; the tracker emits an `InterventionImpactReceipt` that
 * links to the original by `interventionId`.
 *
 * Pure domain — no Effect, no IO. The application-layer tracker
 * (`intervention-impact-tracker.ts`) loads the before/after data and
 * delegates here for the actual delta computation.
 */

import type { InterventionTokenImpact } from './intervention';

/** Per-region metric snapshot at a single point in time. */
export interface RegionMetricSnapshot {
  readonly ambiguityRate: number;
  readonly suspensionRate: number;
  readonly meanRungIndex: number;
}

/** Full impact receipt: pairs an intervention with its measured downstream delta. */
export interface InterventionImpactReceipt {
  readonly kind: 'intervention-impact-receipt';
  readonly version: 1;
  readonly interventionId: string;
  readonly attachedRegion: string;
  readonly observedAt: string;
  /** Snapshot at the time the intervention was accepted. */
  readonly before: RegionMetricSnapshot;
  /** Snapshot from a later run after the intervention took effect. */
  readonly after: RegionMetricSnapshot;
  /** Computed token-impact numerator for the original receipt. */
  readonly tokenImpact: Required<Pick<
    InterventionTokenImpact,
    'ambiguityReduction' | 'suspensionAvoided' | 'rungImprovement' | 'activationQuality'
  >>;
}

/**
 * Pure delta computation. Given before/after snapshots, derive the
 * numerator fields the addendum's H2 obligation requires.
 *
 *   ambiguityReduction = before.ambiguityRate - after.ambiguityRate
 *     (positive = intervention reduced ambiguity)
 *
 *   suspensionAvoided  = before.suspensionRate > 0 ∧ after.suspensionRate === 0
 *
 *   rungImprovement    = before.meanRungIndex - after.meanRungIndex
 *     (positive = resolutions moved up the precedence ladder)
 *
 *   activationQuality  = clamp01((ambiguityReduction + rungImprovement) / 2)
 *     a single 0..1 number summarizing whether the intervention
 *     "worked" — useful for ranking and scoring.
 */
export function computeInterventionImpact(input: {
  readonly before: RegionMetricSnapshot;
  readonly after: RegionMetricSnapshot;
}): Required<Pick<
  InterventionTokenImpact,
  'ambiguityReduction' | 'suspensionAvoided' | 'rungImprovement' | 'activationQuality'
>> {
  const ambiguityReduction = input.before.ambiguityRate - input.after.ambiguityRate;
  const suspensionAvoided = input.before.suspensionRate > 0 && input.after.suspensionRate === 0;
  const rungImprovement = input.before.meanRungIndex - input.after.meanRungIndex;
  const rawQuality = (ambiguityReduction + rungImprovement) / 2;
  const activationQuality = Math.max(0, Math.min(1, rawQuality));
  return {
    ambiguityReduction: round4(ambiguityReduction),
    suspensionAvoided,
    rungImprovement: round4(rungImprovement),
    activationQuality: round4(activationQuality),
  };
}

/** Pure receipt builder. */
export function buildInterventionImpactReceipt(input: {
  readonly interventionId: string;
  readonly attachedRegion: string;
  readonly observedAt: string;
  readonly before: RegionMetricSnapshot;
  readonly after: RegionMetricSnapshot;
}): InterventionImpactReceipt {
  return {
    kind: 'intervention-impact-receipt',
    version: 1,
    interventionId: input.interventionId,
    attachedRegion: input.attachedRegion,
    observedAt: input.observedAt,
    before: input.before,
    after: input.after,
    tokenImpact: computeInterventionImpact({ before: input.before, after: input.after }),
  };
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

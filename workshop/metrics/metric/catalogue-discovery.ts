/**
 * Discovery-Fitness L4 Metric Catalogue — the parallel peer to
 * `catalogue.ts` that lists the metric kinds for the discovery
 * engine's fitness tree.
 *
 * The pipeline-efficacy tree (catalogue.ts) answers "how well does
 * the runtime USE cached knowledge?" The discovery-fitness tree
 * answers "how well does the discovery engine DERIVE knowledge from
 * scratch?"
 *
 * Each kind maps to a MetricVisitor in the discovery-fitness visitor
 * registry (`visitors-discovery/index.ts`). The mapped-type registry
 * pattern forces compile-time exhaustiveness: adding a kind here
 * without a registered visitor is a type error.
 *
 * @see docs/cold-start-convergence-plan.md § 4.B item 1
 */

import type { MetricPolarity } from './catalogue';

// ─── Discovery-fitness metric kinds ─────────────────────────────

/** The authoritative list of discovery-fitness metrics. Each
 *  corresponds to a direct-observation question about the cold-
 *  derivation engine's accuracy against existing canon. */
export const DISCOVERY_FITNESS_METRIC_KINDS = [
  /** Cold-derived routes ≈ canonical route atoms? Jaccard over
   *  addresses + content equivalence. */
  'discovery-route-fidelity',
  /** Cold-derived surfaces ≈ canonical surface atoms? */
  'discovery-surface-fidelity',
  /** Cold-derived elements ≈ canonical element atoms? */
  'discovery-element-fidelity',
  /** Cold-derived postures ≈ canonical posture atoms? */
  'discovery-posture-fidelity',
  /** Cold-derived selectors ≈ canonical selector atoms? */
  'discovery-selector-fidelity',
  /** What fraction of canonical artifact addresses the cold run
   *  produced anything for? */
  'discovery-coverage',
  /** Rolling fraction of agentic overrides that have been demoted
   *  this window. Slow-and-steady is the healthy direction; a spike
   *  means the discovery engine is catching up. */
  'intervention-graduation-rate',
  /** Placeholder for Phase E: runtime-family recognition rate.
   *  Declared now as a stub so the registry is future-proof. */
  'discovery-family-recognition-rate',
] as const;

export type DiscoveryFitnessMetricKind =
  typeof DISCOVERY_FITNESS_METRIC_KINDS[number];

// ─── Polarity ───────────────────────────────────────────────────

/** Polarity for each discovery-fitness metric kind. Exhaustive
 *  via `Record<DiscoveryFitnessMetricKind, MetricPolarity>`. */
export const DISCOVERY_FITNESS_METRIC_POLARITY: Readonly<
  Record<DiscoveryFitnessMetricKind, MetricPolarity>
> = {
  'discovery-route-fidelity': 'higher-is-better',
  'discovery-surface-fidelity': 'higher-is-better',
  'discovery-element-fidelity': 'higher-is-better',
  'discovery-posture-fidelity': 'higher-is-better',
  'discovery-selector-fidelity': 'higher-is-better',
  'discovery-coverage': 'higher-is-better',
  'intervention-graduation-rate': 'higher-is-better',
  'discovery-family-recognition-rate': 'higher-is-better',
};

/** Type-narrowing predicate. */
export function isDiscoveryFitnessMetricKind(
  kind: string,
): kind is DiscoveryFitnessMetricKind {
  return (DISCOVERY_FITNESS_METRIC_KINDS as readonly string[]).includes(kind);
}

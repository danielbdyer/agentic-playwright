/**
 * Cohort plan — pure types for the cohort-aware synthetic scenario
 * orchestrator.
 *
 * The existing `planSyntheticScenarios()` primitive at
 * `product/domain/synthesis/scenario-plan.ts` generates a flat batch of
 * scenarios from a single (seed, count, perturbation) tuple. The
 * fifth-kind loop needs richer structure: the reference corpus is
 * organized into 12 cohorts, each with its own perturbation config,
 * archetype preference, and ID range.
 *
 * This module declares the types that describe a cohort and the
 * manifest that records the result of a multi-cohort generation pass.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { ArchetypeId } from './workflow-archetype';
import type { PerturbationConfig } from './scenario-plan';

// ─── Archetype preference ─────────────────────────────────────────

/**
 * Per-cohort archetype distribution. When set, `selectArchetype()` uses
 * these weights instead of the default element-classification-based
 * weighted candidate pool.
 *
 * Example: an `archetype-mix` cohort that wants equal representation:
 *   { weights: { 'search-verify': 1, 'detail-inspect': 1, ... } }
 *
 * A cohort with no preference (preference = undefined) falls back to
 * the default classification-driven selection — the existing harness
 * behavior.
 */
export interface ArchetypePreference {
  readonly weights: Readonly<Partial<Record<ArchetypeId, number>>>;
}

// ─── Cohort definition ────────────────────────────────────────────

/**
 * The complete description of one cohort. The orchestrator uses this
 * tuple to call `planSyntheticScenarios()` with the right parameters
 * and to route the output to the cohort-specific path.
 *
 * The 12 reference cohorts live in `reference-cohorts.ts`. New cohorts
 * can be added by extending that file; the orchestrator picks them up
 * automatically.
 */
export interface CohortDefinition {
  /** Stable cohort identifier. Becomes the directory name under
   *  `dogfood/scenarios/reference/{cohortId}/`. */
  readonly cohortId: string;

  /** Human-readable purpose for the cohort manifest. */
  readonly description: string;

  /** First adoId in the cohort. Each cohort gets a contiguous
   *  20-ID range so the IDs are non-overlapping across cohorts. */
  readonly idStart: number;

  /** Number of scenarios to generate in this cohort. Default: 20. */
  readonly count: number;

  /** The perturbation config that shapes generation. Drives lexical
   *  drift, data variation, coverage gap, and cross-screen frequency. */
  readonly perturbation: PerturbationConfig;

  /** Optional archetype preference. When set, biases archetype
   *  selection toward specific patterns. When undefined, the cohort
   *  uses the default element-classification-based selection. */
  readonly archetypePreference?: ArchetypePreference;

  /** Per-cohort seed suffix. Combined with the orchestrator's master
   *  seed to produce a deterministic per-cohort RNG. */
  readonly seedSuffix: string;
}

// ─── Cohort manifest ──────────────────────────────────────────────

/**
 * Per-cohort entry in the manifest written to
 * `dogfood/scenarios/reference/cohort-manifest.json`. Records exactly
 * what was generated and how, so a future regeneration with the same
 * inputs can be verified byte-identical.
 */
export interface CohortManifestEntry {
  readonly cohortId: string;
  readonly description: string;
  readonly idStart: number;
  readonly count: number;
  readonly perturbation: PerturbationConfig;
  readonly archetypePreference: ArchetypePreference | null;
  readonly seed: string;
  /** sha256 of the joined per-scenario fingerprints. Stable across
   *  regenerations from the same seed. */
  readonly contentHash: string;
  /** Per-scenario fingerprints in adoId order. Catches single-scenario
   *  drift even when the aggregate hash matches. */
  readonly scenarioFingerprints: readonly string[];
  /** Generation timestamp — informational only, not part of any hash. */
  readonly generatedAt: string;
}

/**
 * The full manifest. Orchestrator output, manifest writer input.
 */
export interface CohortManifest {
  readonly kind: 'cohort-manifest';
  readonly version: 1;
  readonly masterSeed: string;
  readonly totalScenarios: number;
  /** sha256 of the joined per-cohort contentHashes. Top-level stability
   *  anchor — if this changes, something in the corpus moved. */
  readonly contentHash: string;
  readonly cohorts: readonly CohortManifestEntry[];
  readonly generatedAt: string;
}

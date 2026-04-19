/**
 * Pure cohort orchestrator.
 *
 * Takes a list of cohort definitions, a master seed, and a normalized
 * catalog. Calls `planSyntheticScenarios()` once per cohort with the
 * cohort's parameters, computes per-cohort and aggregate content hashes,
 * and returns the grouped plans plus a stable manifest.
 *
 * Pure domain — no Effect, no IO, no application imports. The
 * application-layer wrapper at `lib/application/synthesis/cohort-generator.ts`
 * handles file IO and catalog loading.
 *
 * Determinism contract:
 *   - Same (cohorts, masterSeed, catalog) → identical output, byte-for-byte.
 *   - Per-cohort seeds are derived as `${masterSeed}:${cohort.seedSuffix}`,
 *     so changing one cohort's suffix only invalidates that cohort's hash.
 *   - The aggregate content hash folds per-cohort hashes in cohort order,
 *     so reordering cohorts is a doctrinal change that surfaces as a hash
 *     diff (intentional — order is part of the manifest's identity).
 */

import { taggedFingerprintFor } from '../kernel/hash';
import {
  planSyntheticScenarios,
  type ScenarioPlan,
  type SyntheticCatalogPlanInput,
} from './scenario-plan';
import type {
  CohortDefinition,
  CohortManifest,
  CohortManifestEntry,
} from './cohort-plan';

// ─── Inputs and outputs ───────────────────────────────────────────

export interface OrchestrateCohortsInput {
  /** The cohorts to generate, in order. The order is part of the
   *  manifest's identity. */
  readonly cohorts: readonly CohortDefinition[];
  /** Master seed. Combined with each cohort's `seedSuffix` to produce
   *  per-cohort seeds. */
  readonly masterSeed: string;
  /** Normalized catalog. Pure orchestrator — the application layer
   *  loads the catalog from disk and passes it in. */
  readonly catalog: SyntheticCatalogPlanInput;
  /** Generation timestamp. Threaded through the manifest as
   *  informational provenance — not part of any hash. The application
   *  layer typically supplies `new Date().toISOString()`. */
  readonly generatedAt: string;
}

export interface CohortOrchestrationGroup {
  readonly cohort: CohortDefinition;
  readonly plans: readonly ScenarioPlan[];
  readonly manifestEntry: CohortManifestEntry;
}

export interface OrchestrateCohortsResult {
  readonly groups: readonly CohortOrchestrationGroup[];
  readonly manifest: CohortManifest;
  /** Total scenarios across all cohorts. */
  readonly totalScenarios: number;
}

// ─── Per-cohort generation ────────────────────────────────────────

function cohortSeed(masterSeed: string, cohort: CohortDefinition): string {
  return `${masterSeed}:${cohort.seedSuffix}`;
}

function generateCohortGroup(
  cohort: CohortDefinition,
  masterSeed: string,
  catalog: SyntheticCatalogPlanInput,
  generatedAt: string,
): CohortOrchestrationGroup {
  const seed = cohortSeed(masterSeed, cohort);
  const planning = planSyntheticScenarios({
    catalog,
    seed,
    count: cohort.count,
    baseId: cohort.idStart,
    perturbation: cohort.perturbation,
    cohortLabel: cohort.cohortId,
    ...(cohort.archetypePreference !== undefined
      ? { archetypePreference: cohort.archetypePreference }
      : {}),
  });

  // Per-cohort content hash: fold per-scenario fingerprints in adoId
  // order so insertion order does not affect the hash.
  const sortedPlans = [...planning.plans].sort((a, b) => a.adoId.localeCompare(b.adoId));
  const fingerprints = sortedPlans.map((plan) => plan.fingerprint);
  const contentHash = taggedFingerprintFor('cohort', {
    cohortId: cohort.cohortId,
    fingerprints,
  });

  const manifestEntry: CohortManifestEntry = {
    cohortId: cohort.cohortId,
    description: cohort.description,
    idStart: cohort.idStart,
    count: cohort.count,
    perturbation: cohort.perturbation,
    archetypePreference: cohort.archetypePreference ?? null,
    seed,
    contentHash,
    scenarioFingerprints: fingerprints,
    generatedAt,
  };

  return {
    cohort,
    plans: planning.plans,
    manifestEntry,
  };
}

// ─── Orchestration entry point ────────────────────────────────────

/**
 * Pure orchestrator. Generates scenarios for every cohort and assembles
 * the aggregate manifest. Deterministic given (cohorts, masterSeed,
 * catalog).
 */
export function orchestrateCohorts(
  input: OrchestrateCohortsInput,
): OrchestrateCohortsResult {
  const groups = input.cohorts.map((cohort) =>
    generateCohortGroup(cohort, input.masterSeed, input.catalog, input.generatedAt),
  );

  const totalScenarios = groups.reduce((acc, group) => acc + group.plans.length, 0);

  // Aggregate hash: fold per-cohort content hashes in declaration order.
  // Reordering cohorts changes this hash by design — order is identity.
  const aggregateHash = taggedFingerprintFor('cohort-aggregate', {
    masterSeed: input.masterSeed,
    cohortHashes: groups.map((group) => ({
      cohortId: group.cohort.cohortId,
      contentHash: group.manifestEntry.contentHash,
    })),
  });

  const manifest: CohortManifest = {
    kind: 'cohort-manifest',
    version: 1,
    masterSeed: input.masterSeed,
    totalScenarios,
    contentHash: aggregateHash,
    cohorts: groups.map((group) => group.manifestEntry),
    generatedAt: input.generatedAt,
  };

  return { groups, manifest, totalScenarios };
}

// ─── Validation helpers ───────────────────────────────────────────

export interface CohortIdRangeOverlap {
  readonly cohortA: string;
  readonly cohortB: string;
  readonly overlapStart: number;
  readonly overlapEnd: number;
}

/** Verify that no two cohorts share an ID range. Pure check, returns
 *  the list of overlaps (empty when valid). Useful as a precondition
 *  in tests and as an early-failure guard in the application wrapper. */
export function findCohortIdOverlaps(
  cohorts: readonly CohortDefinition[],
): readonly CohortIdRangeOverlap[] {
  return cohorts.flatMap((a, index) =>
    cohorts.slice(index + 1).flatMap((b): readonly CohortIdRangeOverlap[] => {
      const overlapStart = Math.max(a.idStart, b.idStart);
      const overlapEnd = Math.min(a.idStart + a.count, b.idStart + b.count);
      if (overlapStart >= overlapEnd) return [];
      return [
        {
          cohortA: a.cohortId,
          cohortB: b.cohortId,
          overlapStart,
          overlapEnd,
        },
      ];
    }),
  );
}

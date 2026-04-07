/**
 * Application-layer cohort generator.
 *
 * Loads the workspace catalog, calls the pure cohort orchestrator, and
 * writes the resulting scenario YAMLs and manifest to disk under
 * `dogfood/scenarios/reference/`.
 *
 * Layout written:
 *
 *   {scenariosDir}/reference/
 *     cohort-manifest.json                aggregate manifest
 *     baseline-zero/
 *       20000.scenario.yaml
 *       20001.scenario.yaml
 *       ...
 *     lexical-low/
 *       20020.scenario.yaml
 *       ...
 *
 * Determinism: same (catalog, masterSeed, cohorts) → byte-identical
 * output. The orchestrator is pure; this wrapper does file IO only.
 *
 * Pre-flight: cohort ID ranges are checked for overlap before any file
 * is written. Overlap is a doctrinal error and aborts generation
 * immediately with a structured TesseractError.
 */

import { Effect } from 'effect';
import { FileSystem } from '../ports';
import { loadWorkspaceCatalog } from '../catalog';
import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog } from '../catalog';
import { TesseractError } from '../../domain/kernel/errors';
import {
  orchestrateCohorts,
  findCohortIdOverlaps,
  type OrchestrateCohortsResult,
} from '../../domain/synthesis/cohort-orchestrator';
import type { CohortDefinition, CohortManifest } from '../../domain/synthesis/cohort-plan';
import { REFERENCE_COHORTS } from '../../domain/synthesis/reference-cohorts';
import type { SyntheticCatalogPlanInput, PostureValue } from '../../domain/synthesis/scenario-plan';
import type { ScreenPostures } from '../../domain/knowledge/types';

// ─── Catalog normalization (mirrors scenario-generator.ts) ────────

function extractPostureValues(
  postures: ScreenPostures | undefined,
  elementId: string,
): readonly PostureValue[] {
  const elementPostures = postures?.postures?.[elementId];
  return elementPostures
    ? Object.entries(elementPostures).map(([posture, p]) => ({ posture, values: p.values }))
    : [];
}

function normalizeCatalog(catalog: WorkspaceCatalog): SyntheticCatalogPlanInput {
  const hintsByScreen = new Map(catalog.screenHints.map((entry) => [entry.artifact.screen, entry.artifact]));
  const posturesByScreen = new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact]));
  return {
    screens: catalog.screenElements.map((entry) => {
      const hints = hintsByScreen.get(entry.artifact.screen);
      const postures = posturesByScreen.get(entry.artifact.screen);
      return {
        screenId: entry.artifact.screen,
        screenAliases: hints?.screenAliases ?? [],
        elements: Object.entries(entry.artifact.elements).map(([elementId, element]) => ({
          elementId,
          widget: element.widget ?? 'os-region',
          aliases: hints?.elements?.[elementId]?.aliases ?? [],
          required: element.required ?? false,
          postureValues: extractPostureValues(postures, elementId),
        })),
      };
    }),
  };
}

// ─── Public API ───────────────────────────────────────────────────

export interface GenerateCohortCorpusOptions {
  readonly paths: ProjectPaths;
  /** Master seed combined with each cohort's `seedSuffix`. */
  readonly masterSeed: string;
  /** Override the default reference cohort list. Useful for tests and
   *  scoped regenerations. */
  readonly cohorts?: readonly CohortDefinition[];
  /** Pre-loaded catalog. When omitted, the catalog is loaded from
   *  `paths` via `loadWorkspaceCatalog`. */
  readonly catalog?: WorkspaceCatalog | undefined;
  /** Override the output directory. Defaults to
   *  `${paths.scenariosDir}/reference`. */
  readonly outputDir?: string;
  /** ISO timestamp for manifest provenance. Defaults to `new Date()`. */
  readonly generatedAt?: string;
}

export interface GenerateCohortCorpusResult {
  readonly totalScenarios: number;
  readonly cohorts: ReadonlyArray<{
    readonly cohortId: string;
    readonly count: number;
    readonly contentHash: string;
    readonly files: readonly string[];
  }>;
  readonly manifest: CohortManifest;
  readonly manifestPath: string;
}

export function generateCohortCorpus(options: GenerateCohortCorpusOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const cohorts = options.cohorts ?? REFERENCE_COHORTS;

    // Pre-flight: refuse to write anything if cohort ID ranges overlap.
    const overlaps = findCohortIdOverlaps(cohorts);
    if (overlaps.length > 0) {
      const summary = overlaps
        .map(
          (overlap) =>
            `${overlap.cohortA} ⇄ ${overlap.cohortB} @ [${overlap.overlapStart}, ${overlap.overlapEnd})`,
        )
        .join(', ');
      return yield* Effect.fail(
        new TesseractError('cohort-id-overlap', `Cohort ID ranges overlap: ${summary}`),
      );
    }

    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const outputDir = options.outputDir ?? `${options.paths.scenariosDir}/reference`;
    const generatedAt = options.generatedAt ?? new Date().toISOString();

    const orchestration: OrchestrateCohortsResult = orchestrateCohorts({
      cohorts,
      masterSeed: options.masterSeed,
      catalog: normalizeCatalog(catalog),
      generatedAt,
    });

    // Write each cohort's scenarios in parallel within the cohort, but
    // sequence cohorts so progress is intelligible if anything fails.
    const cohortResults: GenerateCohortCorpusResult['cohorts'][number][] = [];
    for (const group of orchestration.groups) {
      const cohortDir = `${outputDir}/${group.cohort.cohortId}`;
      yield* fs.ensureDir(cohortDir);

      const writes = group.plans.map((plan) =>
        Effect.gen(function* () {
          const filePath = `${cohortDir}/${plan.fileName}`;
          yield* fs.writeText(filePath, plan.yaml);
          return filePath;
        }),
      );
      const files = yield* Effect.all(writes);

      cohortResults.push({
        cohortId: group.cohort.cohortId,
        count: group.plans.length,
        contentHash: group.manifestEntry.contentHash,
        files,
      });
    }

    // Write the manifest last so its presence signals that the cohort
    // directories are complete and consistent.
    const manifestPath = `${outputDir}/cohort-manifest.json`;
    yield* fs.writeText(
      manifestPath,
      `${JSON.stringify(orchestration.manifest, null, 2)}\n`,
    );

    return {
      totalScenarios: orchestration.totalScenarios,
      cohorts: cohortResults,
      manifest: orchestration.manifest,
      manifestPath,
    } satisfies GenerateCohortCorpusResult;
  });
}

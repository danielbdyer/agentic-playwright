import { Effect } from 'effect';
import { FileSystem } from '../ports';
import { loadWorkspaceCatalog } from '../catalog';
import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog } from '../catalog';
import {
  planSyntheticScenarios,
  resolvePerturbation,
  ZERO_PERTURBATION,
  type PerturbationConfig,
  type SyntheticCatalogPlanInput,
} from '../../domain/synthesis/scenario-plan';

export { resolvePerturbation, ZERO_PERTURBATION };
export type { PerturbationConfig };

import type { ScreenPostures } from '../../domain/types/knowledge';
import type { PostureValue } from '../../domain/synthesis/scenario-plan';

function extractPostureValues(postures: ScreenPostures | undefined, elementId: string): readonly PostureValue[] {
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

export interface GenerateSyntheticScenariosOptions {
  readonly paths: ProjectPaths;
  readonly count: number;
  readonly seed: string;
  readonly outputDir?: string;
  readonly catalog?: WorkspaceCatalog | undefined;
  readonly perturbationRate?: number | undefined;
  readonly perturbation?: Partial<PerturbationConfig> | undefined;
  readonly validationSplit?: number | undefined;
}

export interface GenerateSyntheticScenariosResult {
  readonly scenariosGenerated: number;
  readonly files: readonly string[];
  readonly screens: readonly string[];
  readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }>;
}

export function generateSyntheticScenarios(options: GenerateSyntheticScenariosOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const outputDir = options.outputDir ?? `${options.paths.scenariosDir}/synthetic`;

    const planned = planSyntheticScenarios({
      catalog: normalizeCatalog(catalog),
      seed: options.seed,
      count: options.count,
      ...(options.perturbationRate !== undefined ? { perturbationRate: options.perturbationRate } : {}),
      ...(options.perturbation !== undefined ? { perturbation: options.perturbation } : {}),
      ...(options.validationSplit !== undefined ? { validationSplit: options.validationSplit } : {}),
    });

    const writes = planned.plans.map((plan) => {
      const suiteLeaf = plan.suite.replace(/^synthetic\//, '');
      const suiteDir = `${outputDir}/${suiteLeaf}`;
      const filePath = `${suiteDir}/${plan.fileName}`;
      return Effect.gen(function* () {
        yield* fs.ensureDir(suiteDir);
        yield* fs.writeText(filePath, plan.yaml);
        return filePath;
      });
    });

    const files = yield* Effect.all(writes);

    return {
      scenariosGenerated: files.length,
      files,
      screens: planned.screens,
      screenDistribution: planned.screenDistribution,
    } satisfies GenerateSyntheticScenariosResult;
  });
}

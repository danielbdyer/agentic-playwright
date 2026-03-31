import { Effect } from 'effect';
import { FileSystem } from '../ports';
import { loadWorkspaceCatalog } from '../catalog';
import type { ProjectPaths } from '../paths';
import type { WorkspaceCatalog } from '../catalog';
import {
  planSyntheticScenarios,
  resolvePerturbation,
  templatePhrasing,
  ZERO_PERTURBATION,
  type PerturbationConfig,
  type PhrasingProvider,
  type PhrasingRequest,
  type PhrasingResult,
  type SyntheticCatalogPlanInput,
} from '../../domain/synthesis/scenario-plan';

export { resolvePerturbation, templatePhrasing, ZERO_PERTURBATION };
export type { PerturbationConfig, PhrasingProvider, PhrasingRequest, PhrasingResult };

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
          postureValues: postures?.postures?.[elementId]
            ? Object.entries(postures.postures[elementId]!).map(([posture, p]) => ({
              posture,
              values: p.values,
            }))
            : [],
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
  /** Optional phrasing provider for agentic step text generation. */
  readonly phrasingProvider?: PhrasingProvider | undefined;
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
      ...(options.phrasingProvider !== undefined ? { phrasingProvider: options.phrasingProvider } : {}),
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

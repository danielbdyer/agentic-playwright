import { Effect } from 'effect';
import type { AdoId } from '../../domain/identity';
import type { ExecutionPosture, RuntimeInterpreterMode, ScenarioRunPlan } from '../../domain/types';
import { loadWorkspaceCatalog } from '../catalog';
import { createProjectPaths } from '../paths';
import { FileSystem } from '../ports';
import { LocalFileSystem } from '../../infrastructure/fs/local-fs';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from './select-run-context';

export interface LoadScenarioRunPlanInput {
  readonly rootDir: string;
  readonly adoId: AdoId | string;
  readonly executionContextPosture: ExecutionPosture;
  readonly runbookName?: string | undefined;
  readonly interpreterMode?: RuntimeInterpreterMode | undefined;
  readonly providerId?: string | undefined;
}

/**
 * Application-layer Effect that loads a scenario run plan.
 * Prefer this in effectful code; use loadScenarioRunPlan only at the composition root.
 */
export function loadScenarioRunPlanEffect(input: LoadScenarioRunPlanInput): Effect.Effect<ScenarioRunPlan, unknown, FileSystem> {
  const paths = createProjectPaths(input.rootDir);
  return loadWorkspaceCatalog({ paths }).pipe(
    Effect.map((catalog) => {
      const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(catalog, input.adoId as AdoId);
      return prepareScenarioRunPlan({
        surface: surfaceEntry.artifact,
        catalog,
        paths,
        ...(input.runbookName ? { runbookName: input.runbookName } : {}),
        ...(input.interpreterMode ? { interpreterMode: input.interpreterMode } : {}),
        ...(input.providerId ? { providerId: input.providerId } : {}),
        posture: input.executionContextPosture,
        executionContextPosture: input.executionContextPosture,
      });
    }),
  );
}

/**
 * Synchronous composition-root convenience wrapper.
 * Used by generated specs and scenario-context.ts — both composition-boundary callsites.
 * Application-layer code should prefer loadScenarioRunPlanEffect.
 */
export function loadScenarioRunPlan(input: LoadScenarioRunPlanInput): ScenarioRunPlan {
  const paths = createProjectPaths(input.rootDir);
  const program = loadWorkspaceCatalog({ paths }).pipe(
    Effect.provideService(FileSystem, LocalFileSystem),
  );
  const catalog = Effect.runSync(program);
  const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(catalog, input.adoId as AdoId);
  return prepareScenarioRunPlan({
    surface: surfaceEntry.artifact,
    catalog,
    paths,
    ...(input.runbookName ? { runbookName: input.runbookName } : {}),
    ...(input.interpreterMode ? { interpreterMode: input.interpreterMode } : {}),
    ...(input.providerId ? { providerId: input.providerId } : {}),
    posture: input.executionContextPosture,
    executionContextPosture: input.executionContextPosture,
  });
}

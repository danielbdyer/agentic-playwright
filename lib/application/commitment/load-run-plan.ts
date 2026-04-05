import { Effect } from 'effect';
import type { AdoId } from '../../domain/kernel/identity';
import type { ExecutionPosture, RuntimeInterpreterMode } from '../../domain/governance/workflow-types';
import { loadWorkspaceCatalog } from '../catalog';
import { createProjectPaths } from '../paths';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from '../commitment/select-run-context';

export interface LoadScenarioRunPlanInput {
  readonly rootDir: string;
  readonly suiteRoot?: string | undefined;
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
export function loadScenarioRunPlanEffect(input: LoadScenarioRunPlanInput) {
  const paths = createProjectPaths(input.rootDir, input.suiteRoot);
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

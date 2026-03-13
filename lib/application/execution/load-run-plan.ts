import { Effect } from 'effect';
import type { AdoId } from '../../domain/identity';
import type { ExecutionPosture, RuntimeInterpreterMode, ScenarioRunPlan } from '../../domain/types';
import { loadWorkspaceCatalog } from '../catalog';
import { createProjectPaths } from '../paths';
import { loadScenarioInterpretationSurfaceFromCatalog, prepareScenarioRunPlan } from './select-run-context';

export function loadScenarioRunPlan(input: {
  rootDir: string;
  adoId: AdoId | string;
  executionContextPosture: ExecutionPosture;
  runbookName?: string | undefined;
  interpreterMode?: RuntimeInterpreterMode | undefined;
  providerId?: string | undefined;
}): ScenarioRunPlan {
  const paths = createProjectPaths(input.rootDir);
  const catalog = Effect.runSync(loadWorkspaceCatalog({ paths }));
  const surfaceEntry = loadScenarioInterpretationSurfaceFromCatalog(catalog, input.adoId as AdoId);
  return prepareScenarioRunPlan({
    surface: surfaceEntry.artifact,
    catalog,
    paths,
    runbookName: input.runbookName,
    interpreterMode: input.interpreterMode,
    providerId: input.providerId,
    posture: input.executionContextPosture,
    executionContextPosture: input.executionContextPosture,
  });
}

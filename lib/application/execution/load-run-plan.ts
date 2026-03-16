import { Effect } from 'effect';
import type { AdoId } from '../../domain/identity';
import type { ExecutionPosture, RuntimeInterpreterMode, ScenarioRunPlan } from '../../domain/types';
import { loadWorkspaceCatalog } from '../catalog';
import { createProjectPaths } from '../paths';
import { FileSystem } from '../ports';
import { LocalFileSystem } from '../../infrastructure/fs/local-fs';
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

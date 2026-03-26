import { Effect } from 'effect';
import type { InferenceKnowledge } from '../domain/inference';
import type { ScreenId } from '../domain/identity';
import type { BoundScenario, Scenario, ScreenElements, ScreenHints, ScreenPostures, SurfaceGraph } from '../domain/types';
import {
  loadWorkspaceCatalog,
  type WorkspaceCatalog,
  upsertWorkspaceCatalogBoundScenario,
  upsertWorkspaceCatalogScenario,
} from './catalog';
import { inferenceKnowledgeFromCatalog } from './inference';
import type { ProjectPaths } from './paths';

export interface WorkspaceScreenIndexes {
  surfaceGraphs: Map<ScreenId, SurfaceGraph>;
  screenElements: Map<ScreenId, ScreenElements>;
  screenHints: Map<ScreenId, ScreenHints>;
  screenPostures: Map<ScreenId, ScreenPostures>;
}

export interface WorkspaceSession {
  paths: ProjectPaths;
  catalog: WorkspaceCatalog;
  inferenceKnowledge: InferenceKnowledge;
  screenIndexes: WorkspaceScreenIndexes;
}

function createWorkspaceScreenIndexes(catalog: WorkspaceCatalog): WorkspaceScreenIndexes {
  return {
    surfaceGraphs: new Map(catalog.surfaces.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenElements: new Map(catalog.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenHints: new Map(catalog.screenHints.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenPostures: new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
  };
}

export function createWorkspaceSession(catalog: WorkspaceCatalog): WorkspaceSession {
  return {
    paths: catalog.paths,
    catalog,
    inferenceKnowledge: inferenceKnowledgeFromCatalog(catalog),
    screenIndexes: createWorkspaceScreenIndexes(catalog),
  };
}

export function loadWorkspaceSession(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  const catalogEffect = options.catalog
    ? Effect.succeed(options.catalog)
    : loadWorkspaceCatalog({ paths: options.paths });
  return Effect.map(catalogEffect, createWorkspaceSession);
}

export function withScenarioInWorkspaceSession(input: {
  session: WorkspaceSession;
  scenario: Scenario;
  scenarioPath: string;
}): WorkspaceSession {
  return createWorkspaceSession(
    upsertWorkspaceCatalogScenario(input.session.catalog, {
      scenario: input.scenario,
      scenarioPath: input.scenarioPath,
    }),
  );
}

export function withBoundScenarioInWorkspaceSession(input: {
  session: WorkspaceSession;
  boundScenario: BoundScenario;
  boundPath: string;
}): WorkspaceSession {
  return createWorkspaceSession(
    upsertWorkspaceCatalogBoundScenario(input.session.catalog, {
      boundScenario: input.boundScenario,
      boundPath: input.boundPath,
    }),
  );
}

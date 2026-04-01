import { Effect } from 'effect';
import type { InferenceKnowledge } from '../domain/knowledge/inference';
import type { ScreenId } from '../domain/kernel/identity';
import type { BoundScenario, HarvestManifest, Scenario, ScreenElements, ScreenHints, ScreenPostures, SurfaceGraph } from '../domain/types';
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
  routeKnowledge: Map<ScreenId, ReadonlyArray<HarvestManifest['routes'][number]['variants'][number]>>;
}

export interface WorkspaceSession {
  paths: ProjectPaths;
  catalog: WorkspaceCatalog;
  inferenceKnowledge: InferenceKnowledge;
  screenIndexes: WorkspaceScreenIndexes;
  routeKnowledgeFingerprint: string;
}

function createWorkspaceScreenIndexes(catalog: WorkspaceCatalog): WorkspaceScreenIndexes {
  const routeKnowledge = catalog.routeManifests
    .flatMap((entry) => entry.artifact.routes.map((route) => ({ screen: route.screen, variants: route.variants })))
    .sort((left, right) => left.screen.localeCompare(right.screen))
    .reduce<Map<ScreenId, ReadonlyArray<HarvestManifest['routes'][number]['variants'][number]>>>(
      (acc, route) => new Map([
        ...acc,
        [
          route.screen,
          [...(acc.get(route.screen) ?? []), ...route.variants]
            .sort((left, right) => left.id.localeCompare(right.id)),
        ],
      ]),
      new Map(),
    );
  return {
    surfaceGraphs: new Map(catalog.surfaces.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenElements: new Map(catalog.screenElements.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenHints: new Map(catalog.screenHints.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    screenPostures: new Map(catalog.screenPostures.map((entry) => [entry.artifact.screen, entry.artifact] as const)),
    routeKnowledge,
  };
}

export function createWorkspaceSession(catalog: WorkspaceCatalog): WorkspaceSession {
  const routeKnowledgeFingerprint = catalog.routeManifests
    .map((entry) => `${entry.artifactPath}:${entry.fingerprint}`)
    .sort((left, right) => left.localeCompare(right))
    .join('|');
  return {
    paths: catalog.paths,
    catalog,
    inferenceKnowledge: inferenceKnowledgeFromCatalog(catalog),
    screenIndexes: createWorkspaceScreenIndexes(catalog),
    routeKnowledgeFingerprint,
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

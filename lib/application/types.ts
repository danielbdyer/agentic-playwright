import path from 'path';
import { Effect } from 'effect';
import type { TesseractError } from '../domain/errors';
import { widgetCapabilityContracts } from '../domain/widgets/contracts';
import { deriveCapabilities } from '../domain/grammar';
import { sha256 } from '../domain/hash';
import { renderGeneratedKnowledgeModule } from '../domain/typegen';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';
import { generatedKnowledgePath, relativeProjectPath } from './paths';
import { FileSystem } from './ports';
import {
  fingerprintProjectionArtifact,
  type ProjectionInputFingerprint,
} from './projections/cache';
import { type ProjectionIncremental } from './projections/runner';
import { runIncrementalStage } from './pipeline';

export interface GeneratedTypesProjectionResult {
  outputPath: string;
  screens: string[];
  fixtures: string[];
  snapshots: string[];
  incremental: ProjectionIncremental;
}

export type TypesProjectionResult = GeneratedTypesProjectionResult;

function toSortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

const fixtureReferencePattern = /\{\{\s*([A-Za-z0-9_-]+)(?:\.[^}]*)?\s*\}\}/g;

function fixtureIdsFromOverride(override: string | null | undefined): string[] {
  if (!override) {
    return [];
  }

  const fixtureIds: string[] = [];
  for (const match of override.matchAll(fixtureReferencePattern)) {
    const fixtureId = match[1];
    if (fixtureId) {
      fixtureIds.push(fixtureId);
    }
  }
  return fixtureIds;
}

function generatedTypesManifestPath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
}

export function generateTypes(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }): Effect.Effect<TypesProjectionResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'compile' }));
    const inputFingerprints: ProjectionInputFingerprint[] = [
      ...catalog.surfaces.map((entry) => fingerprintProjectionArtifact('surface', entry.artifactPath, entry.artifact)),
      ...catalog.screenElements.map((entry) => fingerprintProjectionArtifact('elements', entry.artifactPath, entry.artifact)),
      ...catalog.screenHints.map((entry) => fingerprintProjectionArtifact('hints', entry.artifactPath, entry.artifact)),
      ...catalog.screenPostures.map((entry) => fingerprintProjectionArtifact('postures', entry.artifactPath, entry.artifact)),
      ...catalog.scenarios.map((entry) => fingerprintProjectionArtifact('scenario', entry.artifactPath, entry.artifact)),
    ];
    const screens = new Set<string>();
    const surfacesByScreen: Record<string, string[]> = {};
    const surfaceActionsByScreen: Record<string, Record<string, readonly string[]>> = {};
    const elementsByScreen: Record<string, string[]> = {};
    const posturesByScreen: Record<string, Record<string, string[]>> = {};
    const snapshotTemplates: string[] = [];
    const fixtureIds: string[] = [];

    for (const entry of catalog.surfaces) {
      screens.add(entry.artifact.screen);
      surfacesByScreen[entry.artifact.screen] = Object.keys(entry.artifact.surfaces).sort((left, right) => left.localeCompare(right));
      for (const section of Object.values(entry.artifact.sections)) {
        if (section.snapshot) {
          snapshotTemplates.push(section.snapshot);
        }
      }
    }

    for (const entry of catalog.screenElements) {
      screens.add(entry.artifact.screen);
      elementsByScreen[entry.artifact.screen] = Object.keys(entry.artifact.elements).sort((left, right) => left.localeCompare(right));
    }

    for (const entry of catalog.screenHints) {
      for (const hint of Object.values(entry.artifact.elements)) {
        fixtureIds.push(...fixtureIdsFromOverride(hint.defaultValueRef));
      }
    }

    for (const entry of catalog.screenPostures) {
      screens.add(entry.artifact.screen);
      posturesByScreen[entry.artifact.screen] = Object.fromEntries(
        Object.entries(entry.artifact.postures)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([elementId, values]) => [elementId, Object.keys(values).sort((left, right) => left.localeCompare(right))]),
      );
    }

    for (const entry of catalog.scenarios) {
      for (const precondition of entry.artifact.preconditions) {
        fixtureIds.push(precondition.fixture);
      }
      for (const step of entry.artifact.steps) {
        if (step.snapshot_template) {
          snapshotTemplates.push(step.snapshot_template);
        }
        fixtureIds.push(...fixtureIdsFromOverride(step.override));
      }
      for (const postcondition of entry.artifact.postconditions) {
        if (postcondition.snapshot_template) {
          snapshotTemplates.push(postcondition.snapshot_template);
        }
        fixtureIds.push(...fixtureIdsFromOverride(postcondition.override));
      }
    }

    for (const entry of catalog.datasets) {
      fixtureIds.push(...Object.keys(entry.artifact.fixtures));
      if (Object.keys(entry.artifact.defaults?.generatedTokens ?? {}).length > 0) {
        fixtureIds.push('generatedTokens');
      }
      for (const value of Object.values(entry.artifact.defaults?.elements ?? {})) {
        fixtureIds.push(...fixtureIdsFromOverride(value));
      }
    }

    const screensList = [...screens].sort((left, right) => left.localeCompare(right));
    for (const screen of screensList) {
      const entry = catalog.screenBundles[screen];
      if (!entry) {
        surfaceActionsByScreen[screen] = {};
        continue;
      }

      const capabilities = deriveCapabilities(entry.bundle.surfaceGraph, entry.elements.artifact)
        .filter((candidate) => candidate.targetKind === 'surface')
        .map((candidate) => [candidate.target, candidate.operations] as const)
        .sort(([left], [right]) => left.localeCompare(right));
      surfaceActionsByScreen[screen] = Object.fromEntries(capabilities);
    }

    const widgetActions = Object.fromEntries(
      Object.entries(widgetCapabilityContracts)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([widget, contract]) => [widget, contract.supportedActions]),
    );

    for (const screen of screensList) {
      surfacesByScreen[screen] = surfacesByScreen[screen] ?? [];
      surfaceActionsByScreen[screen] = surfaceActionsByScreen[screen] ?? {};
      elementsByScreen[screen] = elementsByScreen[screen] ?? [];
      posturesByScreen[screen] = posturesByScreen[screen] ?? {};
    }

    const moduleText = renderGeneratedKnowledgeModule({
      screens: screensList,
      surfaces: surfacesByScreen,
      surfaceActions: surfaceActionsByScreen,
      elements: elementsByScreen,
      widgetActions,
      postures: posturesByScreen,
      snapshots: toSortedUnique(snapshotTemplates),
      fixtures: toSortedUnique(fixtureIds),
    });

    const outputPath = generatedKnowledgePath(options.paths);
    const metadataPath = generatedTypesManifestPath(options.paths);
    const outputFingerprint = `sha256:${sha256(moduleText)}`;
    const fixtures = toSortedUnique(fixtureIds);
    const snapshots = toSortedUnique(snapshotTemplates);

    return yield* runIncrementalStage<
      Omit<TypesProjectionResult, 'incremental'>,
      TypesProjectionResult,
      TypesProjectionResult,
      TesseractError
    >({
      name: 'types',
      manifestPath: metadataPath,
      inputFingerprints,
      outputFingerprint,
      verifyPersistedOutput: () => Effect.gen(function* () {
        const outputExists = yield* fs.exists(outputPath);
        if (!outputExists) {
          return { status: 'missing-output' as const };
        }

        const persistedModuleText = yield* fs.readText(outputPath);
        if (`sha256:${sha256(persistedModuleText)}` !== outputFingerprint) {
          return { status: 'invalid-output' as const };
        }

        return {
          status: 'ok' as const,
          outputFingerprint: `sha256:${sha256(persistedModuleText)}`,
        };
      }),
      persist: () => Effect.gen(function* () {
        yield* fs.writeText(outputPath, moduleText);
        return {
          result: {
            outputPath,
            screens: screensList,
            fixtures,
            snapshots,
          },
          outputFingerprint,
          rewritten: [
            relativeProjectPath(options.paths, outputPath),
            relativeProjectPath(options.paths, metadataPath),
          ],
        };
      }),
      withCacheHit: (incremental): GeneratedTypesProjectionResult => ({
        outputPath,
        screens: screensList,
        fixtures,
        snapshots,
        incremental,
      }),
      withCacheMiss: (built, incremental): GeneratedTypesProjectionResult => ({
        ...built,
        incremental,
      }),
    });
  });
}

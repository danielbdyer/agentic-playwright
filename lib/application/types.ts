import path from 'path';
import { Effect } from 'effect';
import type { TesseractError } from '../domain/kernel/errors';
import { widgetCapabilityContracts } from '../domain/widgets/contracts';
import { deriveCapabilities } from '../domain/execution/grammar';
import { sha256 } from '../domain/kernel/hash';
import { renderGeneratedKnowledgeModule } from '../domain/codegen/typegen';
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

/** Extract fixture IDs from a template override string. Pure. */
const fixtureIdsFromOverride = (override: string | null | undefined): readonly string[] =>
  override ? [...override.matchAll(fixtureReferencePattern)].flatMap((m) => m[1] ? [m[1]] : []) : [];

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
    // Derive all collection data via flatMap — no mutable accumulators
    const sortKeys = (obj: Record<string, unknown>) => Object.keys(obj).sort((a, b) => a.localeCompare(b));

    const surfacesByScreen: Record<string, string[]> = Object.fromEntries(
      catalog.surfaces.map((e) => [e.artifact.screen, sortKeys(e.artifact.surfaces)]),
    );
    const elementsByScreen: Record<string, string[]> = Object.fromEntries(
      catalog.screenElements.map((e) => [e.artifact.screen, sortKeys(e.artifact.elements)]),
    );
    const posturesByScreen: Record<string, Record<string, string[]>> = Object.fromEntries(
      catalog.screenPostures.map((e) => [e.artifact.screen, Object.fromEntries(
        Object.entries(e.artifact.postures).sort(([a], [b]) => a.localeCompare(b)).map(([id, vals]) => [id, sortKeys(vals)]),
      )]),
    );
    const surfaceActionsByScreen: Record<string, Record<string, readonly string[]>> = {};

    const screens = new Set([
      ...catalog.surfaces.map((e) => e.artifact.screen),
      ...catalog.screenElements.map((e) => e.artifact.screen),
      ...catalog.screenPostures.map((e) => e.artifact.screen),
    ]);

    // Snapshot templates: flatMap across surfaces + scenarios + postconditions
    const snapshotTemplates = [
      ...catalog.surfaces.flatMap((e) => Object.values(e.artifact.sections).flatMap((s) => s.snapshot ? [s.snapshot] : [])),
      ...catalog.scenarios.flatMap((e) => [
        ...e.artifact.steps.flatMap((s) => s.snapshot_template ? [s.snapshot_template] : []),
        ...e.artifact.postconditions.flatMap((p) => p.snapshot_template ? [p.snapshot_template] : []),
      ]),
    ];

    // Fixture IDs: flatMap across hints, scenarios, datasets
    const fixtureIds = [
      ...catalog.screenHints.flatMap((e) => Object.values(e.artifact.elements).flatMap((h) => fixtureIdsFromOverride(h.defaultValueRef))),
      ...catalog.scenarios.flatMap((e) => [
        ...e.artifact.preconditions.map((p) => p.fixture),
        ...e.artifact.steps.flatMap((s) => fixtureIdsFromOverride(s.override)),
        ...e.artifact.postconditions.flatMap((p) => fixtureIdsFromOverride(p.override)),
      ]),
      ...catalog.datasets.flatMap((e) => [
        ...Object.keys(e.artifact.fixtures),
        ...(Object.keys(e.artifact.defaults?.generatedTokens ?? {}).length > 0 ? ['generatedTokens'] : []),
        ...Object.values(e.artifact.defaults?.elements ?? {}).flatMap((v) => fixtureIdsFromOverride(v)),
      ]),
    ];

    const screensList = [...screens].sort((left, right) => left.localeCompare(right));
    for (const screen of screensList) {
      const entry = catalog.screenBundles[screen];
      if (!entry) {
        surfaceActionsByScreen[screen] = {};
        continue;
      }

      const capabilities = deriveCapabilities(entry.bundle.surfaceGraph, entry.elements.artifact)
        .flatMap((candidate) => candidate.targetKind === 'surface' ? [[candidate.target, candidate.operations] as const] : [])
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

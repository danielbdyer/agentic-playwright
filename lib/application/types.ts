import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { widgetCapabilityContracts } from '../../knowledge/components';
import { deriveCapabilities } from '../domain/grammar';
import { sha256 } from '../domain/hash';
import { validateScenario, validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { renderGeneratedKnowledgeModule } from '../domain/typegen';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { listValidatedYamlArtifacts } from './knowledge';
import {
  computeProjectionInputSetFingerprint,
  diffProjectionInputs,
  fingerprintProjectionInput,
  parseProjectionManifest,
  sortProjectionInputs,
  type ProjectionBuildManifest,
  type ProjectionInputFingerprint,
} from './projection-cache';
import type { ProjectPaths} from './paths';
import { generatedKnowledgePath, relativeProjectPath } from './paths';
import { FileSystem } from './ports';

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

type FingerprintKind = 'surface' | 'elements' | 'postures' | 'scenario';
type InputFingerprint = ProjectionInputFingerprint<FingerprintKind>;
type GeneratedTypesManifest = ProjectionBuildManifest<'types', FingerprintKind>;

type TypesCacheInvalidationReason = 'missing-output' | 'invalid-output';

function generatedTypesManifestPath(paths: ProjectPaths): string {
  return path.join(paths.generatedTypesDir, 'tesseract-knowledge.metadata.json');
}

function isTypesFingerprintKind(value: unknown): value is FingerprintKind {
  return value === 'surface' || value === 'elements' || value === 'postures' || value === 'scenario';
}

export function generateTypes(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const inputFingerprints: InputFingerprint[] = [];
    const screens = new Set<string>();
    const surfacesByScreen: Record<string, string[]> = {};
    const surfaceActionsByScreen: Record<string, Record<string, string[]>> = {};
    const elementsByScreen: Record<string, string[]> = {};
    const surfaceGraphsByScreen: Record<string, ReturnType<typeof validateSurfaceGraph>> = {};
    const screenElementsByScreen: Record<string, ReturnType<typeof validateScreenElements>> = {};
    const posturesByScreen: Record<string, Record<string, string[]>> = {};
    const snapshotTemplates: string[] = [];
    const fixtureIds: string[] = [];

    const surfaceGraphs = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: options.paths.surfacesDir,
      suffix: '.surface.yaml',
      validate: validateSurfaceGraph,
      errorCode: 'surface-validation-failed',
      errorMessage: (artifactPath) => `Surface graph ${artifactPath} failed validation`,
    });
    for (const { artifact: graph, artifactPath } of surfaceGraphs) {
      inputFingerprints.push(fingerprintProjectionInput('surface', artifactPath, graph));
      screens.add(graph.screen);
      surfaceGraphsByScreen[graph.screen] = graph;
      surfacesByScreen[graph.screen] = Object.keys(graph.surfaces).sort((left, right) => left.localeCompare(right));
      for (const section of Object.values(graph.sections)) {
        if (section.snapshot) {
          snapshotTemplates.push(section.snapshot);
        }
      }
    }

    const knowledgeElements = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.elements.yaml',
      validate: validateScreenElements,
      errorCode: 'elements-validation-failed',
      errorMessage: (artifactPath) => `Elements ${artifactPath} failed validation`,
    });
    for (const { artifact: elements, artifactPath } of knowledgeElements) {
      inputFingerprints.push(fingerprintProjectionInput('elements', artifactPath, elements));
      screens.add(elements.screen);
      screenElementsByScreen[elements.screen] = elements;
      elementsByScreen[elements.screen] = Object.keys(elements.elements).sort((left, right) => left.localeCompare(right));
    }

    const knowledgePostures = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.postures.yaml',
      validate: validateScreenPostures,
      errorCode: 'postures-validation-failed',
      errorMessage: (artifactPath) => `Postures ${artifactPath} failed validation`,
    });
    for (const { artifact: postures, artifactPath } of knowledgePostures) {
      inputFingerprints.push(fingerprintProjectionInput('postures', artifactPath, postures));
      screens.add(postures.screen);
      posturesByScreen[postures.screen] = Object.fromEntries(
        Object.entries(postures.postures)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([elementId, entries]) => [elementId, Object.keys(entries).sort((left, right) => left.localeCompare(right))]),
      );
    }

    const scenarioFiles = (yield* walkFiles(fs, options.paths.scenariosDir)).filter((filePath) => filePath.endsWith('.scenario.yaml'));
    for (const filePath of scenarioFiles) {
      const raw = yield* fs.readText(filePath);
      const scenario = yield* trySync(
        () => validateScenario(YAML.parse(raw)),
        'scenario-validation-failed',
        `Scenario ${filePath} failed validation`,
      );
      const artifactPath = relativeProjectPath(options.paths, filePath);
      inputFingerprints.push(fingerprintProjectionInput('scenario', artifactPath, scenario));
      for (const precondition of scenario.preconditions) {
        fixtureIds.push(precondition.fixture);
      }
      for (const step of scenario.steps) {
        if (step.snapshot_template) {
          snapshotTemplates.push(step.snapshot_template);
        }
        fixtureIds.push(...fixtureIdsFromOverride(step.override));
      }
      for (const postcondition of scenario.postconditions) {
        if (postcondition.snapshot_template) {
          snapshotTemplates.push(postcondition.snapshot_template);
        }
        fixtureIds.push(...fixtureIdsFromOverride(postcondition.override));
      }
    }

    const screensList = [...screens].sort((left, right) => left.localeCompare(right));
    for (const screen of screensList) {
      const surfaceGraph = surfaceGraphsByScreen[screen];
      const screenElements = screenElementsByScreen[screen];
      if (!surfaceGraph || !screenElements) {
        surfaceActionsByScreen[screen] = {};
        continue;
      }
      const capabilities = deriveCapabilities(surfaceGraph, screenElements)
        .filter((entry) => entry.targetKind === 'surface')
        .map((entry) => [entry.target, entry.operations] as const)
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

    const inputs = sortProjectionInputs(inputFingerprints);
    const inputSetFingerprint = computeProjectionInputSetFingerprint(inputs);
    const outputFingerprint = `sha256:${sha256(moduleText)}`;
    const outputPath = generatedKnowledgePath(options.paths);
    const metadataPath = generatedTypesManifestPath(options.paths);

    const previousManifest = (yield* fs.exists(metadataPath))
      ? parseProjectionManifest(yield* fs.readJson(metadataPath), {
        projection: 'types',
        isKind: isTypesFingerprintKind,
      })
      : null;
    const { changedInputs, removedInputs: hasRemovedInputs } = diffProjectionInputs(inputs, previousManifest?.inputs);

    let cacheInvalidationReason: TypesCacheInvalidationReason | null = null;
    if (previousManifest && previousManifest.inputSetFingerprint === inputSetFingerprint && previousManifest.outputFingerprint === outputFingerprint) {
      const outputExists = yield* fs.exists(outputPath);
      if (!outputExists) {
        cacheInvalidationReason = 'missing-output';
      } else {
        const persistedModuleText = yield* fs.readText(outputPath);
        const persistedOutputFingerprint = `sha256:${sha256(persistedModuleText)}`;
        if (persistedOutputFingerprint !== outputFingerprint) {
          cacheInvalidationReason = 'invalid-output';
        }
      }

      if (cacheInvalidationReason === null) {
        return {
          outputPath,
          screens: screensList,
          fixtures: toSortedUnique(fixtureIds),
          snapshots: toSortedUnique(snapshotTemplates),
          incremental: {
            status: 'cache-hit' as const,
            inputSetFingerprint,
            outputFingerprint,
            changedInputs,
            removedInputs: hasRemovedInputs,
            rewritten: [] as string[],
          },
        };
      }
    }

    yield* fs.writeText(outputPath, moduleText);
    const manifest: GeneratedTypesManifest = {
      version: 1,
      projection: 'types',
      inputSetFingerprint,
      outputFingerprint,
      inputs,
    };
    yield* fs.writeJson(metadataPath, manifest);

    return {
      outputPath,
      screens: screensList,
      fixtures: toSortedUnique(fixtureIds),
      snapshots: toSortedUnique(snapshotTemplates),
      incremental: {
        status: 'cache-miss' as const,
        inputSetFingerprint,
        outputFingerprint,
        cacheInvalidationReason,
        changedInputs,
        removedInputs: hasRemovedInputs,
        rewritten: [
          relativeProjectPath(options.paths, outputPath),
          relativeProjectPath(options.paths, metadataPath),
        ],
      },
    };
  });
}

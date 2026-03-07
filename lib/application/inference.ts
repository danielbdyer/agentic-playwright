import YAML from 'yaml';
import { Effect } from 'effect';
import type { InferenceKnowledge} from '../domain/inference';
import { inferScenarioSteps } from '../domain/inference';
import type { AdoSnapshot, ScreenElements, ScreenHints, ScreenPostures, SharedPatterns, SurfaceGraph } from '../domain/types';
import { validateScreenElements, validateScreenHints, validateScreenPostures, validateSharedPatterns, validateSurfaceGraph } from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import { FileSystem } from './ports';
import type { ProjectPaths} from './paths';
import { hintsPath, posturesPath, sharedPatternsPath } from './paths';

function loadYamlArtifact<T>(path: string, validate: (value: unknown) => T, errorCode: string, errorMessage: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readText(path);
    return yield* trySync(() => validate(YAML.parse(raw)), errorCode, errorMessage);
  });
}

export function loadInferenceKnowledge(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const surfaceFiles = (yield* walkFiles(fs, options.paths.surfacesDir)).filter((filePath) => filePath.endsWith('.surface.yaml'));
    const elementsFiles = (yield* walkFiles(fs, `${options.paths.knowledgeDir}/screens`)).filter((filePath) => filePath.endsWith('.elements.yaml'));

    const surfaceGraphs: Record<string, SurfaceGraph> = {};
    const screenElements: Record<string, ScreenElements> = {};
    const screenHints: Record<string, ScreenHints> = {};
    const screenPostures: Record<string, ScreenPostures> = {};

    for (const filePath of surfaceFiles) {
      const surfaceGraph = yield* loadYamlArtifact(filePath, validateSurfaceGraph, 'surface-validation-failed', `Surface graph ${filePath} failed validation`);
      surfaceGraphs[surfaceGraph.screen] = surfaceGraph;
    }

    for (const filePath of elementsFiles) {
      const elements = yield* loadYamlArtifact(filePath, validateScreenElements, 'elements-validation-failed', `Elements ${filePath} failed validation`);
      screenElements[elements.screen] = elements;

      const hintsFile = hintsPath(options.paths, elements.screen);
      if (yield* fs.exists(hintsFile)) {
        screenHints[elements.screen] = yield* loadYamlArtifact(hintsFile, validateScreenHints, 'screen-hints-validation-failed', `Hints ${hintsFile} failed validation`);
      }

      const posturesFile = posturesPath(options.paths, elements.screen);
      if (yield* fs.exists(posturesFile)) {
        screenPostures[elements.screen] = yield* loadYamlArtifact(posturesFile, validateScreenPostures, 'postures-validation-failed', `Postures ${posturesFile} failed validation`);
      }
    }

    const patterns = yield* loadYamlArtifact(
      sharedPatternsPath(options.paths),
      validateSharedPatterns,
      'shared-patterns-validation-failed',
      `Shared patterns ${sharedPatternsPath(options.paths)} failed validation`,
    );

    const knowledge: InferenceKnowledge = {
      surfaceGraphs,
      screenElements,
      screenHints,
      screenPostures,
      sharedPatterns: patterns as SharedPatterns,
    };

    return knowledge;
  });
}

export function inferSnapshotScenario(snapshot: AdoSnapshot, knowledge: InferenceKnowledge) {
  return inferScenarioSteps(snapshot, knowledge);
}

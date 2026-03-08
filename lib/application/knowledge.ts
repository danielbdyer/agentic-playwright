import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import type { InferenceKnowledge } from '../domain/inference';
import { TesseractError } from '../domain/errors';
import { createSnapshotTemplateId, type ScreenId, type SnapshotTemplateId } from '../domain/identity';
import type { ScreenElements, ScreenHints, ScreenPostures, SharedPatterns, SurfaceGraph } from '../domain/types';
import {
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSharedPatterns,
  validateSurfaceGraph,
} from '../domain/validation';
import { walkFiles } from './artifacts';
import { trySync } from './effect';
import type { ProjectPaths } from './paths';
import { elementsPath, hintsPath, posturesPath, relativeProjectPath, surfacePath } from './paths';
import { FileSystem } from './ports';

export interface ArtifactEnvelope<T> {
  absolutePath: string;
  artifactPath: string;
  artifact: T;
}

export interface ScreenKnowledgeBundle {
  screen: ScreenId;
  surfaceGraph?: ArtifactEnvelope<SurfaceGraph> | undefined;
  elements?: ArtifactEnvelope<ScreenElements> | undefined;
  postures?: ArtifactEnvelope<ScreenPostures> | undefined;
  hints?: ArtifactEnvelope<ScreenHints> | undefined;
}

export interface ScreenKnowledgeCache {
  surfaceGraphs: Map<ScreenId, ArtifactEnvelope<SurfaceGraph> | null>;
  elements: Map<ScreenId, ArtifactEnvelope<ScreenElements> | null>;
  postures: Map<ScreenId, ArtifactEnvelope<ScreenPostures> | null>;
  hints: Map<ScreenId, ArtifactEnvelope<ScreenHints> | null>;
}

function loadValidatedYamlArtifact<T>(options: {
  absolutePath: string;
  artifactPath: string;
  validate: (value: unknown) => T;
  errorCode: string;
  errorMessage: string;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const raw = yield* fs.readText(options.absolutePath);
    const artifact = yield* trySync(
      () => options.validate(YAML.parse(raw)),
      options.errorCode,
      options.errorMessage,
    );
    return {
      absolutePath: options.absolutePath,
      artifactPath: options.artifactPath,
      artifact,
    } satisfies ArtifactEnvelope<T>;
  });
}

function loadOptionalScreenArtifact<T>(
  cache: Map<ScreenId, ArtifactEnvelope<T> | null>,
  options: {
    paths: ProjectPaths;
    screen: ScreenId;
    absolutePath: string;
    validate: (value: unknown) => T;
    errorCode: string;
    errorMessage: string;
  },
) {
  return Effect.gen(function* () {
    const cached = cache.get(options.screen);
    if (cached !== undefined) {
      return cached;
    }

    const fs = yield* FileSystem;
    const exists = yield* fs.exists(options.absolutePath);
    if (!exists) {
      cache.set(options.screen, null);
      return null;
    }

    const artifact = yield* loadValidatedYamlArtifact({
      absolutePath: options.absolutePath,
      artifactPath: relativeProjectPath(options.paths, options.absolutePath),
      validate: options.validate,
      errorCode: options.errorCode,
      errorMessage: options.errorMessage,
    });
    cache.set(options.screen, artifact);
    return artifact;
  });
}

export function createScreenKnowledgeCache(): ScreenKnowledgeCache {
  return {
    surfaceGraphs: new Map(),
    elements: new Map(),
    postures: new Map(),
    hints: new Map(),
  };
}

export function loadScreenKnowledgeBundle(options: {
  paths: ProjectPaths;
  screen: ScreenId;
  cache?: ScreenKnowledgeCache | undefined;
}) {
  return Effect.gen(function* () {
    const cache = options.cache ?? createScreenKnowledgeCache();
    const surfaceGraph = yield* loadOptionalScreenArtifact(cache.surfaceGraphs, {
      paths: options.paths,
      screen: options.screen,
      absolutePath: surfacePath(options.paths, options.screen),
      validate: validateSurfaceGraph,
      errorCode: 'surface-validation-failed',
      errorMessage: `Surface graph for ${options.screen} failed validation`,
    });
    const elements = yield* loadOptionalScreenArtifact(cache.elements, {
      paths: options.paths,
      screen: options.screen,
      absolutePath: elementsPath(options.paths, options.screen),
      validate: validateScreenElements,
      errorCode: 'elements-validation-failed',
      errorMessage: `Elements file for ${options.screen} failed validation`,
    });
    const postures = yield* loadOptionalScreenArtifact(cache.postures, {
      paths: options.paths,
      screen: options.screen,
      absolutePath: posturesPath(options.paths, options.screen),
      validate: validateScreenPostures,
      errorCode: 'postures-validation-failed',
      errorMessage: `Postures file for ${options.screen} failed validation`,
    });
    const hints = yield* loadOptionalScreenArtifact(cache.hints, {
      paths: options.paths,
      screen: options.screen,
      absolutePath: hintsPath(options.paths, options.screen),
      validate: validateScreenHints,
      errorCode: 'screen-hints-validation-failed',
      errorMessage: `Hints file for ${options.screen} failed validation`,
    });

    return {
      screen: options.screen,
      surfaceGraph: surfaceGraph ?? undefined,
      elements: elements ?? undefined,
      postures: postures ?? undefined,
      hints: hints ?? undefined,
    } satisfies ScreenKnowledgeBundle;
  });
}

export function listValidatedYamlArtifacts<T>(options: {
  paths: ProjectPaths;
  dirPath: string;
  suffix: string;
  validate: (value: unknown) => T;
  errorCode: string;
  errorMessage: (artifactPath: string) => string;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const files = (yield* walkFiles(fs, options.dirPath)).filter((filePath) => filePath.endsWith(options.suffix));
    const artifacts: ArtifactEnvelope<T>[] = [];

    for (const absolutePath of files) {
      const artifactPath = relativeProjectPath(options.paths, absolutePath);
      artifacts.push(yield* loadValidatedYamlArtifact({
        absolutePath,
        artifactPath,
        validate: options.validate,
        errorCode: options.errorCode,
        errorMessage: options.errorMessage(artifactPath),
      }));
    }

    return artifacts;
  });
}

export function listKnowledgeSnapshotArtifacts(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const snapshotDir = path.join(options.paths.knowledgeDir, 'snapshots');
    const files = (yield* walkFiles(fs, snapshotDir)).filter((filePath) => filePath.endsWith('.yaml'));
    return files.map((absolutePath) => {
      const artifactPath = relativeProjectPath(options.paths, absolutePath);
      const relativePath = artifactPath.replace(/^knowledge\//, '');
      return {
        absolutePath,
        artifactPath,
        relativePath: createSnapshotTemplateId(relativePath),
      };
    });
  });
}

export function loadInferenceKnowledge(options: { paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const surfaces = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: options.paths.surfacesDir,
      suffix: '.surface.yaml',
      validate: validateSurfaceGraph,
      errorCode: 'surface-validation-failed',
      errorMessage: (artifactPath) => `Surface graph ${artifactPath} failed validation`,
    });
    const elements = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.elements.yaml',
      validate: validateScreenElements,
      errorCode: 'elements-validation-failed',
      errorMessage: (artifactPath) => `Elements ${artifactPath} failed validation`,
    });
    const hints = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.hints.yaml',
      validate: validateScreenHints,
      errorCode: 'screen-hints-validation-failed',
      errorMessage: (artifactPath) => `Hints ${artifactPath} failed validation`,
    });
    const postures = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: path.join(options.paths.knowledgeDir, 'screens'),
      suffix: '.postures.yaml',
      validate: validateScreenPostures,
      errorCode: 'postures-validation-failed',
      errorMessage: (artifactPath) => `Postures ${artifactPath} failed validation`,
    });
    const patternArtifacts = yield* listValidatedYamlArtifacts({
      paths: options.paths,
      dirPath: options.paths.patternsDir,
      suffix: '.yaml',
      validate: validateSharedPatterns,
      errorCode: 'shared-patterns-validation-failed',
      errorMessage: (artifactPath) => `Shared patterns ${artifactPath} failed validation`,
    });
    const sharedPatterns = patternArtifacts[0]?.artifact;
    if (!sharedPatterns) {
      return yield* Effect.fail(new TesseractError('shared-patterns-validation-failed', 'No shared pattern registries found'));
    }

    const knowledge: InferenceKnowledge = {
      surfaceGraphs: Object.fromEntries(surfaces.map(({ artifact }) => [artifact.screen, artifact])),
      screenElements: Object.fromEntries(elements.map(({ artifact }) => [artifact.screen, artifact])),
      screenHints: Object.fromEntries(hints.map(({ artifact }) => [artifact.screen, artifact])),
      screenPostures: Object.fromEntries(postures.map(({ artifact }) => [artifact.screen, artifact])),
      sharedPatterns: sharedPatterns as SharedPatterns,
    };

    return knowledge;
  });
}

export function availableSnapshotTemplates(artifacts: ReadonlyArray<{ relativePath: SnapshotTemplateId }>): ReadonlySet<SnapshotTemplateId> {
  return new Set(artifacts.map((artifact) => artifact.relativePath));
}

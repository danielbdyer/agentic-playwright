import { Effect } from 'effect';
import { createScreenBundle } from '../../domain/knowledge/screen-bundle';
import type { ScreenId } from '../../domain/kernel/identity';
import type {
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SurfaceGraph,
} from '../../domain/knowledge/types';
import {
  validateScreenElements,
  validateScreenHints,
  validateScreenPostures,
  validateSurfaceGraph,
} from '../../domain/validation';
import type { ProjectPaths } from '../paths';
import { elementsPath, hintsPath, posturesPath, surfacePath } from '../paths';
import { loadOptionalYamlArtifact, readYamlArtifact } from './loaders';
import type { ArtifactEnvelope, ScreenBundleEntry } from './types';

export function byScreen<T extends { artifact: { screen: ScreenId } }>(entries: T[]): Record<string, T> {
  return Object.fromEntries(entries.map((entry) => [entry.artifact.screen, entry]));
}

export function createScreenBundleEntry(input: {
  surface: ArtifactEnvelope<SurfaceGraph>;
  elements: ArtifactEnvelope<ScreenElements>;
  hints: ArtifactEnvelope<ScreenHints> | null;
  postures: ArtifactEnvelope<ScreenPostures> | null;
}): ScreenBundleEntry {
  return {
    surface: input.surface,
    elements: input.elements,
    hints: input.hints,
    postures: input.postures,
    bundle: createScreenBundle({
      surfaceGraph: input.surface.artifact,
      elements: input.elements.artifact,
      hints: input.hints?.artifact ?? null,
      postures: input.postures?.artifact ?? null,
    }),
  };
}

export function assembleScreenBundles(input: {
  surfaces: ArtifactEnvelope<SurfaceGraph>[];
  screenElements: ArtifactEnvelope<ScreenElements>[];
  screenHints: ArtifactEnvelope<ScreenHints>[];
  screenPostures: ArtifactEnvelope<ScreenPostures>[];
}): Record<string, ScreenBundleEntry> {
  const surfaceByScreen = byScreen(input.surfaces);
  const elementsByScreen = byScreen(input.screenElements);
  const hintsByScreen = byScreen(input.screenHints);
  const posturesByScreen = byScreen(input.screenPostures);
  const screenBundles: Record<string, ScreenBundleEntry> = {};

  for (const screenId of Object.keys(surfaceByScreen).sort((left, right) => left.localeCompare(right))) {
    const surface = surfaceByScreen[screenId];
    const elements = elementsByScreen[screenId];
    if (!surface || !elements) {
      continue;
    }

    screenBundles[screenId] = createScreenBundleEntry({
      surface,
      elements,
      hints: hintsByScreen[screenId] ?? null,
      postures: posturesByScreen[screenId] ?? null,
    });
  }

  return screenBundles;
}

export function loadScreenBundle(options: { paths: ProjectPaths; screen: ScreenId }) {
  return Effect.gen(function* () {
    const surface = yield* readYamlArtifact(
      options.paths,
      surfacePath(options.paths, options.screen),
      validateSurfaceGraph,
      'surface-validation-failed',
      `Surface graph ${options.screen} failed validation`,
    );
    const elements = yield* readYamlArtifact(
      options.paths,
      elementsPath(options.paths, options.screen),
      validateScreenElements,
      'elements-validation-failed',
      `Elements ${options.screen} failed validation`,
    );
    const hints = yield* loadOptionalYamlArtifact(
      options.paths,
      hintsPath(options.paths, options.screen),
      validateScreenHints,
      'screen-hints-validation-failed',
      `Hints ${options.screen} failed validation`,
    );
    const postures = yield* loadOptionalYamlArtifact(
      options.paths,
      posturesPath(options.paths, options.screen),
      validateScreenPostures,
      'postures-validation-failed',
      `Postures ${options.screen} failed validation`,
    );

    return createScreenBundleEntry({
      surface,
      elements,
      hints,
      postures,
    });
  });
}

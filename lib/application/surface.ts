import YAML from 'yaml';
import { Effect } from 'effect';
import { ScreenId } from '../domain/identity';
import { deriveCapabilities } from '../domain/grammar';
import { validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';
import { FileSystem } from './ports';
import { elementsPath, posturesPath, ProjectPaths, relativeProjectPath, surfacePath } from './paths';
import { trySync } from './effect';

export function inspectSurface(options: { screen: ScreenId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const approvedSurfacePath = surfacePath(options.paths, options.screen);
    const approvedElementsPath = elementsPath(options.paths, options.screen);
    const approvedPosturesPath = posturesPath(options.paths, options.screen);

    const rawSurface = yield* fs.readText(approvedSurfacePath);
    const rawElements = yield* fs.readText(approvedElementsPath);
    const rawPostures = yield* fs.readText(approvedPosturesPath);

    const surfaceGraph = yield* trySync(
      () => validateSurfaceGraph(YAML.parse(rawSurface)),
      'surface-validation-failed',
      `Surface graph ${options.screen} failed validation`,
    );
    const elements = yield* trySync(
      () => validateScreenElements(YAML.parse(rawElements)),
      'elements-validation-failed',
      `Elements for ${options.screen} failed validation`,
    );
    const postures = yield* trySync(
      () => validateScreenPostures(YAML.parse(rawPostures)),
      'postures-validation-failed',
      `Postures for ${options.screen} failed validation`,
    );

    const capabilities = deriveCapabilities(surfaceGraph, elements);
    return {
      screen: options.screen,
      artifactPaths: {
        surface: relativeProjectPath(options.paths, approvedSurfacePath),
        elements: relativeProjectPath(options.paths, approvedElementsPath),
        postures: relativeProjectPath(options.paths, approvedPosturesPath),
      },
      surfaceGraph,
      elementCount: Object.keys(elements.elements).length,
      postureCount: Object.values(postures.postures).reduce((total, entry) => total + Object.keys(entry).length, 0),
      capabilities,
    };
  });
}


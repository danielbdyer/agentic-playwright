import { Effect } from 'effect';
import { deriveCapabilities } from '../domain/grammar';
import type { ScreenId } from '../domain/identity';
import { loadScreenBundle } from './catalog';
import type { ProjectPaths } from './paths';

export function inspectSurface(options: { screen: ScreenId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const entry = yield* loadScreenBundle({ screen: options.screen, paths: options.paths });
    const capabilities = deriveCapabilities(entry.bundle.surfaceGraph, entry.elements.artifact);
    return {
      screen: options.screen,
      artifactPaths: {
        surface: entry.surface.artifactPath,
        elements: entry.elements.artifactPath,
        postures: entry.postures?.artifactPath ?? null,
        hints: entry.hints?.artifactPath ?? null,
      },
      surfaceGraph: entry.bundle.surfaceGraph,
      screenBundle: entry.bundle,
      elementCount: Object.keys(entry.bundle.mergedElements).length,
      postureCount: Object.values(entry.postures?.artifact.postures ?? {}).reduce((total, item) => total + Object.keys(item).length, 0),
      capabilities,
    };
  });
}

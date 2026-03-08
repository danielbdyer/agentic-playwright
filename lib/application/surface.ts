import { Effect } from 'effect';
import { TesseractError } from '../domain/errors';
import { deriveCapabilities } from '../domain/grammar';
import type { ScreenId } from '../domain/identity';
import { loadScreenKnowledgeBundle } from './knowledge';
import type { ProjectPaths } from './paths';

export function inspectSurface(options: { screen: ScreenId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const knowledge = yield* loadScreenKnowledgeBundle({ paths: options.paths, screen: options.screen });
    if (!knowledge.surfaceGraph || !knowledge.elements || !knowledge.postures) {
      return yield* Effect.fail(new TesseractError('surface-validation-failed', `Screen knowledge for ${options.screen} is incomplete`));
    }

    const surfaceGraph = knowledge.surfaceGraph.artifact;
    const elements = knowledge.elements.artifact;
    const postures = knowledge.postures.artifact;
    const capabilities = deriveCapabilities(surfaceGraph, elements);

    return {
      screen: options.screen,
      artifactPaths: {
        surface: knowledge.surfaceGraph.artifactPath,
        elements: knowledge.elements.artifactPath,
        postures: knowledge.postures.artifactPath,
      },
      surfaceGraph,
      elementCount: Object.keys(elements.elements).length,
      postureCount: Object.values(postures.postures).reduce((total, entry) => total + Object.keys(entry).length, 0),
      capabilities,
    };
  });
}

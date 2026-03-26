import { Effect } from 'effect';
import type { InferenceKnowledge } from '../domain/inference';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from './catalog';
import type { ProjectPaths } from './paths';

export function inferenceKnowledgeFromCatalog(catalog: WorkspaceCatalog): InferenceKnowledge {
  return {
    surfaceGraphs: Object.fromEntries(
      Object.values(catalog.screenBundles).map((entry) => [entry.bundle.screen, entry.bundle.surfaceGraph]),
    ),
    screenElements: Object.fromEntries(
      Object.values(catalog.screenBundles).map((entry) => [entry.bundle.screen, entry.elements.artifact]),
    ),
    screenHints: Object.fromEntries(
      Object.values(catalog.screenBundles)
        .filter((entry) => entry.hints)
        .map((entry) => [entry.bundle.screen, entry.hints!.artifact]),
    ),
    screenPostures: Object.fromEntries(
      Object.values(catalog.screenBundles)
        .filter((entry) => entry.postures)
        .map((entry) => [entry.bundle.screen, entry.postures!.artifact]),
    ),
    sharedPatterns: catalog.mergedPatterns,
  } satisfies InferenceKnowledge;
}

export function loadInferenceKnowledge(options: { paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'compile' }));
    return inferenceKnowledgeFromCatalog(catalog);
  });
}

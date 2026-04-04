import { existsSync, readFileSync } from 'fs';
import path from 'path';
import YAML from 'yaml';
import { createScreenBundle } from '../../domain/knowledge/screen-bundle';
import type { ScreenId } from '../../domain/kernel/identity';
import type { LoadedScreen, ScreenRegistry, ScreenRegistryLoader } from '../../domain/commitment/runtime-loaders';
import { validateScreenElements, validateScreenHints, validateScreenPostures, validateSurfaceGraph } from '../../domain/validation';

export function createLocalScreenRegistryLoader(rootDir: string): ScreenRegistryLoader {
  const cache = new Map<ScreenId, LoadedScreen>();

  function loadScreen(screenId: ScreenId): LoadedScreen {
    const cached = cache.get(screenId);
    if (cached) {
      return cached;
    }

    const surfaceFile = path.join(rootDir, 'knowledge', 'surfaces', `${screenId}.surface.yaml`);
    const elementsFile = path.join(rootDir, 'knowledge', 'screens', `${screenId}.elements.yaml`);
    const posturesFile = path.join(rootDir, 'knowledge', 'screens', `${screenId}.postures.yaml`);
    const hintsFile = path.join(rootDir, 'knowledge', 'screens', `${screenId}.hints.yaml`);
    const surfaceGraph = validateSurfaceGraph(YAML.parse(readFileSync(surfaceFile, 'utf8')));
    const elements = validateScreenElements(YAML.parse(readFileSync(elementsFile, 'utf8')));
    const hints = existsSync(hintsFile)
      ? validateScreenHints(YAML.parse(readFileSync(hintsFile, 'utf8')))
      : null;
    const postures = existsSync(posturesFile)
      ? validateScreenPostures(YAML.parse(readFileSync(posturesFile, 'utf8')))
      : null;
    const bundle = createScreenBundle({
      surfaceGraph,
      elements,
      hints,
      postures,
    });
    const loaded: LoadedScreen = {
      screen: {
        screen: bundle.surfaceGraph.screen,
        url: bundle.surfaceGraph.url,
        sections: bundle.surfaceGraph.sections,
      },
      surfaces: bundle.surfaceGraph.surfaces,
      elements: bundle.mergedElements,
      postures: bundle.postures?.postures ?? {},
    };
    cache.set(screenId, loaded);
    return loaded;
  }

  return {
    loadScreen,
    loadScreenRegistry(screenIds: readonly ScreenId[]): ScreenRegistry {
      return Object.fromEntries(screenIds.map((screenId) => [screenId, loadScreen(screenId)]));
    },
  };
}

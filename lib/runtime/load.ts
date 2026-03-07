import path from 'path';
import { existsSync, readFileSync } from 'fs';
import YAML from 'yaml';
import type { ScreenId } from '../domain/identity';
import type { ScreenElements, ScreenHints, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateScreenElements, validateScreenHints, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';

export interface LoadedScreen {
  screen: Pick<SurfaceGraph, 'screen' | 'url' | 'sections'>;
  surfaces: SurfaceGraph['surfaces'];
  elements: ScreenElements['elements'];
  postures: ScreenPostures['postures'];
}

export type ScreenRegistry = Record<string, LoadedScreen>;

const cache = new Map<ScreenId, LoadedScreen>();

function mergeElementHints(elements: ScreenElements, hints: ScreenHints | null): ScreenElements['elements'] {
  if (!hints) {
    return elements.elements;
  }

  return Object.fromEntries(
    Object.entries(elements.elements).map(([elementId, element]) => {
      const hint = hints.elements[elementId];
      return [elementId, {
        ...element,
        affordance: element.affordance ?? hint?.affordance ?? null,
      }];
    }),
  );
}

export function loadScreen(screenId: ScreenId): LoadedScreen {
  const cached = cache.get(screenId);
  if (cached) {
    return cached;
  }

  const root = process.cwd();
  const surfaceFile = path.join(root, 'knowledge', 'surfaces', `${screenId}.surface.yaml`);
  const elementsFile = path.join(root, 'knowledge', 'screens', `${screenId}.elements.yaml`);
  const posturesFile = path.join(root, 'knowledge', 'screens', `${screenId}.postures.yaml`);
  const hintsFile = path.join(root, 'knowledge', 'screens', `${screenId}.hints.yaml`);
  const surfaceGraph = validateSurfaceGraph(YAML.parse(readFileSync(surfaceFile, 'utf8')));
  const elements = validateScreenElements(YAML.parse(readFileSync(elementsFile, 'utf8')));
  const hints = existsSync(hintsFile)
    ? validateScreenHints(YAML.parse(readFileSync(hintsFile, 'utf8')))
    : null;
  const postures = existsSync(posturesFile)
    ? validateScreenPostures(YAML.parse(readFileSync(posturesFile, 'utf8'))).postures
    : ({} as LoadedScreen['postures']);
  const loaded: LoadedScreen = {
    screen: {
      screen: surfaceGraph.screen,
      url: surfaceGraph.url,
      sections: surfaceGraph.sections,
    },
    surfaces: surfaceGraph.surfaces,
    elements: mergeElementHints(elements, hints),
    postures,
  };
  cache.set(screenId, loaded);
  return loaded;
}

export function loadScreenRegistry(screenIds: readonly ScreenId[]): ScreenRegistry {
  return Object.fromEntries(screenIds.map((screenId) => [screenId, loadScreen(screenId)]));
}

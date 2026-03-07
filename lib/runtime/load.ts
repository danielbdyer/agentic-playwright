import path from 'path';
import { readFileSync } from 'fs';
import YAML from 'yaml';
import { ScreenId } from '../domain/identity';
import { ScreenElements, ScreenPostures, SurfaceGraph } from '../domain/types';
import { validateScreenElements, validateScreenPostures, validateSurfaceGraph } from '../domain/validation';

export interface LoadedScreen {
  screen: Pick<SurfaceGraph, 'screen' | 'url' | 'sections'>;
  surfaces: SurfaceGraph['surfaces'];
  elements: ScreenElements['elements'];
  postures: ScreenPostures['postures'];
}

export type ScreenRegistry = Record<string, LoadedScreen>;

const cache = new Map<ScreenId, LoadedScreen>();

export function loadScreen(screenId: ScreenId): LoadedScreen {
  const cached = cache.get(screenId);
  if (cached) {
    return cached;
  }

  const root = process.cwd();
  const surfaceFile = path.join(root, 'knowledge', 'surfaces', `${screenId}.surface.yaml`);
  const elementsFile = path.join(root, 'knowledge', 'screens', `${screenId}.elements.yaml`);
  const posturesFile = path.join(root, 'knowledge', 'screens', `${screenId}.postures.yaml`);
  const surfaceGraph = validateSurfaceGraph(YAML.parse(readFileSync(surfaceFile, 'utf8')));
  const elements = validateScreenElements(YAML.parse(readFileSync(elementsFile, 'utf8')));
  const postures = validateScreenPostures(YAML.parse(readFileSync(posturesFile, 'utf8')));
  const loaded: LoadedScreen = {
    screen: {
      screen: surfaceGraph.screen,
      url: surfaceGraph.url,
      sections: surfaceGraph.sections,
    },
    surfaces: surfaceGraph.surfaces,
    elements: elements.elements,
    postures: postures.postures,
  };
  cache.set(screenId, loaded);
  return loaded;
}

export function loadScreenRegistry(screenIds: readonly ScreenId[]): ScreenRegistry {
  return Object.fromEntries(screenIds.map((screenId) => [screenId, loadScreen(screenId)]));
}


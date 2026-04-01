import type { ScreenId, SnapshotTemplateId } from '../kernel/identity';
import type { ScreenElements, ScreenPostures, SurfaceGraph } from '../types';

export interface LoadedScreen {
  screen: Pick<SurfaceGraph, 'screen' | 'url' | 'sections'>;
  surfaces: SurfaceGraph['surfaces'];
  elements: ScreenElements['elements'];
  postures: ScreenPostures['postures'];
}

export type ScreenRegistry = Record<string, LoadedScreen>;

export interface ScreenRegistryLoader {
  loadScreen(screenId: ScreenId): LoadedScreen;
  loadScreenRegistry(screenIds: readonly ScreenId[]): ScreenRegistry;
}

export interface SnapshotTemplateLoader {
  has(snapshotTemplate: SnapshotTemplateId): boolean;
  read(snapshotTemplate: SnapshotTemplateId): string;
}

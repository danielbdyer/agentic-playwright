import type { ScreenId } from '../domain/identity';
import { RuntimeError } from '../domain/errors';
import type { LoadedScreen, ScreenRegistry, ScreenRegistryLoader } from '../domain/runtime-loaders';
export type { LoadedScreen, ScreenRegistry, ScreenRegistryLoader } from '../domain/runtime-loaders';

let screenRegistryLoader: ScreenRegistryLoader | null = null;

function requireScreenRegistryLoader(): ScreenRegistryLoader {
  if (!screenRegistryLoader) {
    throw new RuntimeError('runtime-loader-not-configured', 'ScreenRegistryLoader is not configured', { loader: 'ScreenRegistryLoader' });
  }
  return screenRegistryLoader;
}

export function configureScreenRegistryLoader(loader: ScreenRegistryLoader): void {
  screenRegistryLoader = loader;
}

export function loadScreen(screenId: ScreenId): LoadedScreen {
  return requireScreenRegistryLoader().loadScreen(screenId);
}

export function loadScreenRegistry(screenIds: readonly ScreenId[]): ScreenRegistry {
  return requireScreenRegistryLoader().loadScreenRegistry(screenIds);
}

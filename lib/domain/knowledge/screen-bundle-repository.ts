import type { ScreenBundle } from './screen-bundle';

export interface ScreenBundleLoadResult {
  readonly found: boolean;
  readonly bundle: ScreenBundle | null;
}

export interface ScreenBundleRepository {
  readonly load: (screen: string, basePath: string) => Promise<ScreenBundleLoadResult>;
  readonly save: (screen: string, basePath: string, bundle: ScreenBundle) => Promise<ScreenBundle>;
  readonly list: (basePath: string) => Promise<readonly string[]>;
}

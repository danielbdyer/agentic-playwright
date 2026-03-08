import type { SnapshotTemplateId } from '../domain/identity';
import { RuntimeError } from '../domain/errors';
import type { SnapshotTemplateLoader } from '../domain/runtime-loaders';
export type { SnapshotTemplateLoader } from '../domain/runtime-loaders';

let snapshotTemplateLoader: SnapshotTemplateLoader | null = null;

function requireSnapshotTemplateLoader(): SnapshotTemplateLoader {
  if (!snapshotTemplateLoader) {
    throw new RuntimeError('runtime-loader-not-configured', 'SnapshotTemplateLoader is not configured', { loader: 'SnapshotTemplateLoader' });
  }
  return snapshotTemplateLoader;
}

export function configureSnapshotTemplateLoader(loader: SnapshotTemplateLoader): void {
  snapshotTemplateLoader = loader;
}

export function hasSnapshotTemplate(snapshotTemplate: SnapshotTemplateId): boolean {
  return requireSnapshotTemplateLoader().has(snapshotTemplate);
}

export function readSnapshotTemplate(snapshotTemplate: SnapshotTemplateId): string {
  return requireSnapshotTemplateLoader().read(snapshotTemplate);
}

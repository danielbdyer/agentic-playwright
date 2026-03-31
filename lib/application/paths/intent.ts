import path from 'path';
import type { AdoId } from '../../domain/identity';
import type { ProjectPaths } from './types';
import { resolvePathWithinRoot } from './shared';

export function snapshotPath(paths: ProjectPaths, adoId: AdoId): string {
  return path.join(paths.intent.snapshotDir, `${adoId}.json`);
}

export function archiveSnapshotPath(paths: ProjectPaths, adoId: AdoId, revision: number): string {
  return path.join(paths.intent.archiveDir, adoId, `${revision}.json`);
}

export function scenarioPath(paths: ProjectPaths, suitePath: string, adoId: AdoId): string {
  return resolvePathWithinRoot(paths.intent.scenariosDir, path.join(suitePath, `${adoId}.scenario.yaml`), 'suitePath');
}

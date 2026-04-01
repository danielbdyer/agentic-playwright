import { existsSync, readFileSync } from 'fs';
import path from 'path';
import type { SnapshotTemplateId } from '../../domain/kernel/identity';
import type { SnapshotTemplateLoader } from '../../domain/execution/runtime-loaders';

function snapshotTemplatePath(rootDir: string, snapshotTemplate: SnapshotTemplateId): string {
  return path.join(rootDir, 'knowledge', snapshotTemplate);
}

export function createLocalSnapshotTemplateLoader(rootDir: string): SnapshotTemplateLoader {
  return {
    has(snapshotTemplate: SnapshotTemplateId): boolean {
      return existsSync(snapshotTemplatePath(rootDir, snapshotTemplate));
    },
    read(snapshotTemplate: SnapshotTemplateId): string {
      return readFileSync(snapshotTemplatePath(rootDir, snapshotTemplate), 'utf8');
    },
  };
}

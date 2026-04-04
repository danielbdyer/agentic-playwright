import type { ManifestEntry } from '../../domain/types';

export function hasSnapshotDrift(
  previous: ManifestEntry | undefined,
  next: { revision: number; contentHash: string },
): boolean {
  if (!previous) {
    return true;
  }

  return previous.revision !== next.revision || previous.contentHash !== next.contentHash;
}


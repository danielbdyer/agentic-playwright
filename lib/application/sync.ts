import { Effect } from 'effect';
import { createDiagnostic } from '../domain/diagnostics';
import { AdoId } from '../domain/identity';
import { Manifest, SyncResult } from '../domain/types';
import { validateAdoSnapshot, validateManifest } from '../domain/validation';
import { AdoSource, FileSystem } from './ports';
import {
  archiveSnapshotPath,
  ProjectPaths,
  relativeProjectPath,
  snapshotPath,
} from './paths';
import { hasSnapshotDrift } from './diff';
import { trySync } from './effect';

function emptyManifest(): Manifest {
  return { entries: {} };
}

function loadManifest(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const exists = yield* fs.exists(paths.manifestPath);
    if (!exists) {
      return emptyManifest();
    }

    const raw = yield* fs.readJson(paths.manifestPath);
    return yield* trySync(
      () => validateManifest(raw),
      'manifest-validation-failed',
      'Manifest failed validation',
    );
  });
}

export function syncSnapshots(options: { adoId?: AdoId; all?: boolean; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const ado = yield* AdoSource;
    const manifest = yield* loadManifest(options.paths);
    const ids = options.all
      ? yield* ado.listSnapshotIds()
      : options.adoId
        ? [options.adoId]
        : [];

    if (ids.length === 0) {
      return yield* Effect.fail(new Error('sync requires --all or --ado-id'));
    }

    const nextEntries = { ...manifest.entries };
    const snapshots: SyncResult['snapshots'] = [];
    const diagnostics: SyncResult['diagnostics'] = [];

    yield* fs.ensureDir(options.paths.snapshotDir);

    for (const adoId of ids) {
      const rawSnapshot = yield* ado.loadSnapshot(adoId);
      const snapshot = yield* trySync(
        () => validateAdoSnapshot(rawSnapshot),
        'snapshot-validation-failed',
        `Snapshot ${adoId} failed validation`,
      );
      const targetPath = snapshotPath(options.paths, snapshot.id);
      const exists = yield* fs.exists(targetPath);
      const previousEntry = nextEntries[snapshot.id];

      if (exists) {
        const previousRaw = yield* fs.readJson(targetPath);
        const previousSnapshot = yield* trySync(
          () => validateAdoSnapshot(previousRaw),
          'snapshot-validation-failed',
          `Existing snapshot ${snapshot.id} failed validation`,
        );

        if (hasSnapshotDrift(previousEntry, snapshot)) {
          yield* fs.writeJson(archiveSnapshotPath(options.paths, snapshot.id, previousSnapshot.revision), previousSnapshot);
        }
      }

      yield* fs.writeJson(targetPath, snapshot);
      nextEntries[snapshot.id] = {
        adoId: snapshot.id,
        revision: snapshot.revision,
        contentHash: snapshot.contentHash,
        syncedAt: snapshot.syncedAt,
        sourcePath: relativeProjectPath(options.paths, targetPath),
      };
      snapshots.push(snapshot);
      diagnostics.push(
        createDiagnostic({
          code: exists && hasSnapshotDrift(previousEntry, snapshot) ? 'snapshot-updated' : exists ? 'snapshot-unchanged' : 'snapshot-created',
          severity: 'info',
          message: `Synced snapshot ${snapshot.id}`,
          adoId: snapshot.id,
          artifactPath: relativeProjectPath(options.paths, targetPath),
          provenance: {
            contentHash: snapshot.contentHash,
            snapshotPath: relativeProjectPath(options.paths, targetPath),
            sourceRevision: snapshot.revision,
          },
        }),
      );
    }

    const nextManifest = { entries: nextEntries };
    yield* fs.writeJson(options.paths.manifestPath, nextManifest);
    return {
      manifest: nextManifest,
      snapshots,
      diagnostics,
    };
  });
}


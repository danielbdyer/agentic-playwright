import { Effect } from 'effect';
import { createDiagnostic } from '../../domain/governance/diagnostics';
import type { AdoId } from '../../domain/kernel/identity';
import type { Manifest } from '../../domain/governance/workflow-types';
import { validateAdoSnapshot, validateManifest } from '../../domain/validation';
import { AdoSource, FileSystem } from '../ports';
import type {
  ProjectPaths} from '../paths';
import {
  archiveSnapshotPath,
  relativeProjectPath,
  snapshotPath,
} from '../paths';
import { hasSnapshotDrift } from './diff';
import { trySync } from '../effect';
import type { AdoSnapshot } from '../../domain/intent/types';
import type { CompilerDiagnostic } from '../../domain/governance/workflow-types';

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

    yield* Effect.succeed(ids).pipe(
      Effect.filterOrFail(
        (items) => items.length > 0,
        () => new Error('sync requires --all or --ado-id'),
      ),
    );

    yield* fs.ensureDir(options.paths.snapshotDir);

    type SyncAcc = {
      readonly entries: typeof manifest.entries;
      readonly snapshots: readonly AdoSnapshot[];
      readonly diagnostics: readonly CompilerDiagnostic[];
    };

    const syncStep = (
      remaining: readonly AdoId[],
      acc: SyncAcc,
    ): Effect.Effect<SyncAcc, unknown, any> =>
      Effect.gen(function* () {
        if (remaining.length === 0) return acc;
        const [adoId, ...rest] = remaining;
        const rawSnapshot = yield* ado.loadSnapshot(adoId!);
        const snapshot = yield* trySync(
          () => validateAdoSnapshot(rawSnapshot),
          'snapshot-validation-failed',
          `Snapshot ${adoId} failed validation`,
        );
        const targetPath = snapshotPath(options.paths, snapshot.id);
        const exists = yield* fs.exists(targetPath);
        const previousEntry = acc.entries[snapshot.id];

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
        const nextAcc: SyncAcc = {
          entries: {
            ...acc.entries,
            [snapshot.id]: {
              adoId: snapshot.id,
              revision: snapshot.revision,
              contentHash: snapshot.contentHash,
              syncedAt: snapshot.syncedAt,
              sourcePath: relativeProjectPath(options.paths, targetPath),
            },
          },
          snapshots: [...acc.snapshots, snapshot],
          diagnostics: [...acc.diagnostics, createDiagnostic({
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
          })],
        };
        return yield* syncStep(rest, nextAcc);
      });

    const syncResult = yield* syncStep(ids, { entries: { ...manifest.entries }, snapshots: [], diagnostics: [] });
    const nextEntries = syncResult.entries;
    const snapshots = syncResult.snapshots;
    const diagnostics = syncResult.diagnostics;

    const nextManifest = { entries: nextEntries };
    yield* fs.writeJson(options.paths.manifestPath, nextManifest);
    return {
      manifest: nextManifest,
      snapshots,
      diagnostics,
    };
  });
}


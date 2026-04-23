/**
 * Scoreboard snapshot store.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z7, the snapshot store:
 *
 *   - Writes per-cycle scoreboards to
 *     <logDir>/scoreboard-snapshots/<ISO>-<fp>.json.
 *   - Reads the most-recent-prior snapshot (by ISO-timestamp sort).
 *   - Exposes the pass-list of that snapshot (derived from
 *     lastRegression.newlyPassing + any persisted passing set) so
 *     the next computeScoreboard call can diff O(delta) rather
 *     than O(all receipts ever).
 *
 * Snapshots are append-only + sorted by filename. No editing; no
 * deletion.
 *
 * Fingerprinting: the snapshot carries a content-addressed
 * fingerprint so the regression detector can name the baseline
 * precisely (ZC26 round-trip law).
 */

import { Effect } from 'effect';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  fingerprintFor,
  type Fingerprint,
} from '../../../product/domain/kernel/hash';
import { logIoFailed, type CompoundingError } from '../domain/compounding-error';
import type { CompoundingScoreboard } from '../domain/scoreboard';

export interface SnapshotEnvelope {
  readonly version: 1;
  readonly fingerprint: string;
  readonly scoreboard: CompoundingScoreboard;
  /** Passing artifact ids at snapshot time — precomputed so the
   *  next cycle's regression detector can diff in O(delta). */
  readonly passingArtifactIds: readonly string[];
}

export interface SnapshotStoreOptions {
  readonly logDir: string;
  readonly snapshotsDir?: string;
}

export function createSnapshotStore(options: SnapshotStoreOptions) {
  const dir = path.join(options.logDir, options.snapshotsDir ?? 'scoreboard-snapshots');

  const write = (
    scoreboard: CompoundingScoreboard,
    passingArtifactIds: readonly string[],
  ): Effect.Effect<SnapshotEnvelope, CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(dir, { recursive: true });
        const fp = fingerprintFor('scenario', {
          generatedAt: scoreboard.generatedAt,
          probeCoverageRatio: scoreboard.probeCoverageRatio,
          scenarioPassRatio: scoreboard.scenarioPassRatio,
          trajectories: scoreboard.trajectories,
          graduation: scoreboard.graduation,
          gaps: scoreboard.gaps,
          substrateVersion: scoreboard.substrateVersion,
          passingArtifactIds,
        }) as string;
        const envelope: SnapshotEnvelope = {
          version: 1,
          fingerprint: fp,
          scoreboard,
          passingArtifactIds,
        };
        const ts = scoreboard.generatedAt.replace(/[:.]/g, '-');
        const file = path.join(dir, `${ts}-${fp.slice(0, 12)}.json`);
        await writeFile(file, `${JSON.stringify(envelope, null, 2)}\n`, 'utf-8');
        return envelope;
      },
      catch: (cause) => logIoFailed(dir, String(cause)),
    });

  const readMostRecent = (): Effect.Effect<SnapshotEnvelope | null, CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        try {
          const entries = await readdir(dir);
          const jsonFiles = entries.filter((e) => e.endsWith('.json')).sort();
          if (jsonFiles.length === 0) return null;
          const latest = jsonFiles[jsonFiles.length - 1]!;
          const contents = await readFile(path.join(dir, latest), 'utf-8');
          return JSON.parse(contents) as SnapshotEnvelope;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
          throw err;
        }
      },
      catch: (cause) => logIoFailed(dir, String(cause)),
    });

  const listAll = (): Effect.Effect<readonly SnapshotEnvelope[], CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        try {
          const entries = await readdir(dir);
          const jsonFiles = entries.filter((e) => e.endsWith('.json')).sort();
          const out: SnapshotEnvelope[] = [];
          for (const file of jsonFiles) {
            const contents = await readFile(path.join(dir, file), 'utf-8');
            out.push(JSON.parse(contents) as SnapshotEnvelope);
          }
          return out;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [] as SnapshotEnvelope[];
          throw err;
        }
      },
      catch: (cause) => logIoFailed(dir, String(cause)),
    });

  return { write, readMostRecent, listAll };
}

/** Convenience: compute the snapshot fingerprint without writing. */
export function scoreboardFingerprint(
  scoreboard: CompoundingScoreboard,
  passingArtifactIds: readonly string[],
): Fingerprint<'scenario'> {
  return fingerprintFor('scenario', {
    generatedAt: scoreboard.generatedAt,
    probeCoverageRatio: scoreboard.probeCoverageRatio,
    scenarioPassRatio: scoreboard.scenarioPassRatio,
    trajectories: scoreboard.trajectories,
    graduation: scoreboard.graduation,
    gaps: scoreboard.gaps,
    substrateVersion: scoreboard.substrateVersion,
    passingArtifactIds,
  });
}

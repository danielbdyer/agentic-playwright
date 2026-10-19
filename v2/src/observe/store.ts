/**
 * Snapshot records on disk: .tesseract/snapshots/<snapshotId>.json, with
 * the screenshot alongside as <snapshotId>.png when one was taken.
 * Records are written once and never rewritten (a re-observe mints a new
 * snapshotId), gitignored by the workspace, and pruned by age.
 *
 * Replaces workshop/substrate-study/infrastructure/snapshot-store.ts, whose
 * hour-bucket dedup returned a stale record for a re-observe after an
 * action and whose bucket ids depended on the machine's timezone.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { ToolError } from '../core/errors.js';
import { readJson, relativePosix, writeFileAtomic, writeJson } from '../core/fsio.js';
import type { Workspace } from '../workspace/workspace.js';
import { SNAPSHOT_RECORD_VERSION, type SnapshotRecord } from './observe.js';

const SNAPSHOT_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

const checkId = (snapshotId: string): string => {
  if (!SNAPSHOT_ID.test(snapshotId) || snapshotId.includes('..')) {
    throw new ToolError('invalid-input', `invalid snapshotId: ${JSON.stringify(snapshotId)}`);
  }
  return snapshotId;
};

export const snapshotPath = (workspace: Workspace, snapshotId: string): string =>
  path.join(workspace.paths.snapshots, `${checkId(snapshotId)}.json`);

export const screenshotPathFor = (workspace: Workspace, snapshotId: string): string =>
  path.join(workspace.paths.snapshots, `${checkId(snapshotId)}.png`);

export interface SavedSnapshot {
  /** Absolute path of the JSON record. */
  readonly path: string;
  /** Workspace-relative POSIX path of the PNG, when a screenshot was saved. */
  readonly screenshotPath?: string;
  readonly record: SnapshotRecord;
}

/**
 * Write the record (and the screenshot, if given). The saved record's
 * screenshotPath is workspace-relative so it reads the same on any machine.
 */
export const saveSnapshotRecord = async (
  workspace: Workspace,
  record: SnapshotRecord,
  screenshot?: Buffer,
): Promise<SavedSnapshot> => {
  const file = snapshotPath(workspace, record.snapshotId);
  let saved = record;
  let screenshotPath: string | undefined;
  if (screenshot !== undefined) {
    const png = screenshotPathFor(workspace, record.snapshotId);
    await writeFileAtomic(png, screenshot);
    screenshotPath = relativePosix(workspace.paths.root, png);
    saved = { ...record, screenshotPath };
  }
  await writeJson(file, saved);
  return { path: file, record: saved, ...(screenshotPath !== undefined ? { screenshotPath } : {}) };
};

/** Write the record and return the path of the JSON file. */
export const saveSnapshot = async (workspace: Workspace, record: SnapshotRecord, screenshot?: Buffer): Promise<string> =>
  (await saveSnapshotRecord(workspace, record, screenshot)).path;

/** Load a record. A missing (pruned, never saved) or unreadable record is ToolError('stale-snapshot'). */
export const loadSnapshot = async (workspace: Workspace, snapshotId: string): Promise<SnapshotRecord> => {
  const file = snapshotPath(workspace, snapshotId);
  let record: SnapshotRecord | null;
  try {
    record = await readJson<SnapshotRecord>(file);
  } catch (error) {
    throw new ToolError('stale-snapshot', `snapshot ${snapshotId} is unreadable: ${error instanceof Error ? error.message : String(error)}`, {
      snapshotId,
    });
  }
  if (record === null) {
    throw new ToolError('stale-snapshot', `snapshot ${snapshotId} not found; it was pruned or never saved. Observe the page again.`, {
      snapshotId,
    });
  }
  if (record.version !== SNAPSHOT_RECORD_VERSION || !Array.isArray(record.candidates)) {
    throw new ToolError('stale-snapshot', `snapshot ${snapshotId} was written by an incompatible version; observe the page again.`, {
      snapshotId,
    });
  }
  return record;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Delete snapshot files (records and screenshots) older than
 * config.snapshotRetentionDays, by modification time. Returns the removed
 * file names. Retention of 0 or less keeps everything.
 */
export const pruneSnapshots = async (workspace: Workspace, now: Date): Promise<readonly string[]> => {
  const days = workspace.config.snapshotRetentionDays;
  if (!(days > 0)) return [];
  const cutoff = now.getTime() - days * DAY_MS;
  let entries: string[];
  try {
    entries = await fs.readdir(workspace.paths.snapshots);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const candidates = entries.filter((name) => name.endsWith('.json') || name.endsWith('.png'));
  const removed = await Promise.all(
    candidates.map(async (name) => {
      const file = path.join(workspace.paths.snapshots, name);
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile() || stat.mtimeMs >= cutoff) return null;
        await fs.unlink(file);
        return name;
      } catch {
        return null;
      }
    }),
  );
  return removed.filter((name): name is string => name !== null).sort();
};

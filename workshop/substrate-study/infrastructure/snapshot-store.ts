/**
 * SnapshotStore — the append-only persistence layer for
 * SnapshotRecord artifacts from the external-snapshot harness.
 *
 * Per `docs/v2-substrate-ladder-plan.d0a-harness-design.md §4.5,
 * §8 L8`, snapshot records are append-only: within an
 * hour-bucket for a given (url, substrateVersion) pair, repeat
 * runs return the existing record rather than overwriting.
 *
 * ## Sample ID
 *
 * computeSampleId produces a sha256 hash over the tuple
 *   (url, fetchedAt-bucketed-to-hour, substrateVersion)
 *
 * This gives deterministic dedup within a one-hour window while
 * still allowing fresh captures across substrate-version bumps
 * or hour boundaries. The hour bucket balances repeat-run
 * efficiency against capturing genuine short-term drift.
 *
 * ## Storage layout
 *
 *   <rootDir>/<quarter>/<sample-id>.json
 *
 * Quarter: YYYY-QN computed from fetchedAt. Keeps directory
 * listings bounded as corpus accumulates.
 *
 * Infrastructure adapter — touches the filesystem. All other
 * modules speak to it through the `SnapshotStoreService`
 * interface; tests inject a fake.
 */

import { Effect } from 'effect';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { SnapshotRecord } from '../domain/snapshot-record';

/** The store's port shape. */
export interface SnapshotStoreService {
  /** Write a SnapshotRecord. Returns the persisted path.
   *  Refuses to overwrite an existing record in the same
   *  hour-bucket; that call yields the existing path and does
   *  not re-persist (L-Record-Append-Only). */
  readonly write: (record: SnapshotRecord) => Effect.Effect<string, Error, never>;
  /** Read a record by sample-id. Returns null if absent. */
  readonly read: (sampleId: string) => Effect.Effect<SnapshotRecord | null, Error, never>;
  /** List every sample-id under the store. Ordered by quarter
   *  then alphabetically. */
  readonly listIds: () => Effect.Effect<readonly string[], Error, never>;
}

export interface SnapshotStoreOptions {
  /** Root directory for snapshot persistence. Default:
   *  `workshop/substrate-study/logs/snapshots`. */
  readonly rootDir?: string;
}

const DEFAULT_ROOT_DIR = path.join(
  'workshop',
  'substrate-study',
  'logs',
  'snapshots',
);

// ─── Sample-ID computation ───────────────────────────────────

/** Bucket a timestamp to hour granularity. Returns an ISO-like
 *  string with minutes/seconds zeroed out. Pure. */
export function bucketToHour(iso: string): string {
  // Accepts an ISO-8601 timestamp; strips minutes/seconds/ms.
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`bucketToHour: invalid timestamp ${JSON.stringify(iso)}`);
  }
  const hour = new Date(
    parsed.getUTCFullYear(),
    parsed.getUTCMonth(),
    parsed.getUTCDate(),
    parsed.getUTCHours(),
    0,
    0,
    0,
  );
  return hour.toISOString();
}

/** Compute the deterministic sample-id for a (url,
 *  fetchedAt, substrateVersion) triple. Pure; no IO. */
export function computeSampleId(input: {
  readonly url: string;
  readonly fetchedAt: string;
  readonly substrateVersion: string;
}): string {
  const bucket = bucketToHour(input.fetchedAt);
  const hash = createHash('sha256');
  hash.update(input.url);
  hash.update('\x00');
  hash.update(bucket);
  hash.update('\x00');
  hash.update(input.substrateVersion);
  return hash.digest('hex');
}

/** Compute the quarter slug (YYYY-QN) from an ISO timestamp.
 *  Used as the parent directory for organization. Pure. */
export function quarterSlug(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`quarterSlug: invalid timestamp ${JSON.stringify(iso)}`);
  }
  const year = parsed.getUTCFullYear();
  const month = parsed.getUTCMonth(); // 0-11
  const quarter = Math.floor(month / 3) + 1;
  return `${year}-Q${quarter}`;
}

/** Given a SnapshotRecord, derive its sample-id. Helper over
 *  computeSampleId that sources the inputs from the record. */
export function sampleIdOfRecord(record: SnapshotRecord): string {
  return computeSampleId({
    url: record.payload.url,
    fetchedAt: record.payload.fetchedAt,
    substrateVersion: record.payload.substrateVersion,
  });
}

// ─── Local filesystem store ──────────────────────────────────

export function createLocalSnapshotStore(
  options: SnapshotStoreOptions = {},
): SnapshotStoreService {
  const rootDir = options.rootDir ?? DEFAULT_ROOT_DIR;

  const pathForSample = (sampleId: string, quarter: string): string =>
    path.join(rootDir, quarter, `${sampleId}.json`);

  const findExistingPath = (sampleId: string): string | null => {
    // A sample-id is globally unique; its quarter is encoded in
    // the fetchedAt used to produce it. We don't know the quarter
    // from the id alone, so we scan quarter directories.
    if (!existsSync(rootDir)) return null;
    // Cheap scan: the rootDir contains at most a handful of
    // YYYY-QN directories across the lifetime of the harness.
    // A production implementation would maintain a flat index;
    // v1 keeps it simple.
    const { readdirSync } = require('node:fs') as typeof import('node:fs');
    const quarters = readdirSync(rootDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
    for (const q of quarters) {
      const candidate = pathForSample(sampleId, q);
      if (existsSync(candidate)) return candidate;
    }
    return null;
  };

  return {
    write: (record) =>
      Effect.try({
        try: () => {
          const sampleId = sampleIdOfRecord(record);
          const existing = findExistingPath(sampleId);
          if (existing !== null) {
            return existing; // L-Record-Append-Only: do not overwrite.
          }
          const quarter = quarterSlug(record.payload.fetchedAt);
          const outDir = path.join(rootDir, quarter);
          mkdirSync(outDir, { recursive: true });
          const outPath = pathForSample(sampleId, quarter);
          writeFileSync(outPath, JSON.stringify(record, null, 2), 'utf-8');
          return outPath;
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),

    read: (sampleId) =>
      Effect.try({
        try: () => {
          const existing = findExistingPath(sampleId);
          if (existing === null) return null;
          const raw = readFileSync(existing, 'utf-8');
          return JSON.parse(raw) as SnapshotRecord;
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),

    listIds: () =>
      Effect.try({
        try: () => {
          if (!existsSync(rootDir)) return [] as readonly string[];
          const { readdirSync } = require('node:fs') as typeof import('node:fs');
          const ids: string[] = [];
          const quarters = readdirSync(rootDir, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort();
          for (const q of quarters) {
            const files = readdirSync(path.join(rootDir, q), {
              withFileTypes: true,
            })
              .filter((e) => e.isFile() && e.name.endsWith('.json'))
              .map((e) => e.name.replace(/\.json$/, ''))
              .sort();
            ids.push(...files);
          }
          return ids as readonly string[];
        },
        catch: (cause) =>
          cause instanceof Error ? cause : new Error(String(cause)),
      }),
  };
}

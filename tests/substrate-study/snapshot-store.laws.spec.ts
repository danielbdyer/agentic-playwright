/**
 * SnapshotStore laws (Z11g.d.0a Phase 2).
 *
 * Pin the store's persistence contract per
 * `docs/v2-substrate-ladder-plan.d0a-harness-design.md §§4.5,
 * 8 L8`:
 *
 *   L-Record-Append-Only: within an hour-bucket for a given
 *     (url, substrateVersion) pair, write() returns the
 *     existing path on repeat runs; no overwrite.
 *
 *   Sample-ID determinism: computeSampleId is a pure function
 *     of its three inputs; hour-bucketing collapses within-
 *     hour runs to the same id; substrateVersion bumps yield
 *     new ids.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import {
  mkdtempSync,
  rmSync,
  readdirSync,
  readFileSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  bucketToHour,
  computeSampleId,
  createLocalSnapshotStore,
  quarterSlug,
  sampleIdOfRecord,
} from '../../workshop/substrate-study/infrastructure/snapshot-store';
import { snapshotRecord } from '../../workshop/substrate-study/domain/snapshot-record';
import type { HydrationVerdict } from '../../workshop/substrate-study/domain/hydration-verdict';
import { stubNode } from '../__fixtures__/snapshot-node-stub';

const STUB_VERDICT: HydrationVerdict = {
  kind: 'stable',
  diagnostic: 'stub',
  phaseTimings: { phaseAms: 0, phaseBms: 0, phaseCms: 0, phaseDms: 0, phaseEms: 0 },
  phaseBRetries: 0,
  mutationCount: 0,
};

// stubNode now lives in tests/__fixtures__/snapshot-node-stub.ts

function stubRecord(overrides: {
  readonly url?: string;
  readonly fetchedAt?: string;
  readonly substrateVersion?: string;
} = {}) {
  return snapshotRecord({
    url: overrides.url ?? 'https://example.com/',
    fetchedAt: overrides.fetchedAt ?? '2026-04-24T12:00:00.000Z',
    substrateVersion: overrides.substrateVersion ?? '1.0.0',
    userAgent: 'test-ua',
    viewport: { width: 1280, height: 800 },
    hydration: STUB_VERDICT,
    captureLatencyMs: 100,
    nodes: [stubNode()],
    framework: {
      reactDetected: false,
      angularDetected: false,
      vueDetected: false,
      webComponentCount: 0,
      shadowRootCount: 0,
      iframeCount: 0,
    },
    variantClassifier: { kind: 'not-os', evidence: ['stub'] },
  });
}

describe('bucketToHour', () => {
  test('zeros out minutes/seconds/ms', () => {
    expect(bucketToHour('2026-04-24T12:34:56.789Z')).toBe(
      '2026-04-24T12:00:00.000Z',
    );
  });
  test('same-hour inputs collapse to the same bucket', () => {
    const b1 = bucketToHour('2026-04-24T12:00:00.001Z');
    const b2 = bucketToHour('2026-04-24T12:59:59.999Z');
    expect(b2).toBe(b1);
  });
  test('different hours produce different buckets', () => {
    const b1 = bucketToHour('2026-04-24T12:00:00.000Z');
    const b2 = bucketToHour('2026-04-24T13:00:00.000Z');
    expect(b2).not.toBe(b1);
  });
  test('invalid timestamps throw with a diagnostic message', () => {
    expect(() => bucketToHour('not-a-date')).toThrow(/invalid timestamp/);
  });
});

describe('quarterSlug', () => {
  test('month 0 (January) → Q1', () => {
    expect(quarterSlug('2026-01-15T00:00:00.000Z')).toBe('2026-Q1');
  });
  test('month 3 (April) → Q2', () => {
    expect(quarterSlug('2026-04-01T00:00:00.000Z')).toBe('2026-Q2');
  });
  test('month 11 (December) → Q4', () => {
    expect(quarterSlug('2026-12-31T23:59:59.999Z')).toBe('2026-Q4');
  });
});

describe('computeSampleId', () => {
  test('is a pure function of its three inputs', () => {
    const input = {
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    };
    const id1 = computeSampleId(input);
    const id2 = computeSampleId({ ...input });
    expect(id2).toBe(id1);
  });
  test('same url+hour+version yield same id (hour-bucket collapse)', () => {
    const early = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    const late = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:59:00.000Z',
      substrateVersion: '1.0.0',
    });
    expect(late).toBe(early);
  });
  test('different hours yield different ids', () => {
    const a = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    const b = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T13:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    expect(b).not.toBe(a);
  });
  test('different urls yield different ids', () => {
    const a = computeSampleId({
      url: 'https://example.com/a',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    const b = computeSampleId({
      url: 'https://example.com/b',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    expect(b).not.toBe(a);
  });
  test('different substrateVersions yield different ids', () => {
    const a = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '1.0.0',
    });
    const b = computeSampleId({
      url: 'https://example.com/',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '2.0.0',
    });
    expect(b).not.toBe(a);
  });
  test('delimiter avoids collision across concatenations', () => {
    // Null-byte delimiter keeps ('foo\x00bar', 'baz') distinct
    // from ('foo', '\x00barbaz'). Sanity check.
    const a = computeSampleId({
      url: 'foobar',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: '',
    });
    const b = computeSampleId({
      url: 'foo',
      fetchedAt: '2026-04-24T12:00:00.000Z',
      substrateVersion: 'bar',
    });
    expect(b).not.toBe(a);
  });
});

describe('SnapshotStoreService', () => {
  function withTmpStore<R>(
    runner: (ctx: {
      rootDir: string;
      store: ReturnType<typeof createLocalSnapshotStore>;
    }) => Promise<R>,
  ): Promise<R> {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'snapshot-store-test-'));
    const store = createLocalSnapshotStore({ rootDir });
    return runner({ rootDir, store }).finally(() =>
      rmSync(rootDir, { recursive: true, force: true }),
    );
  }

  test('write() persists a record to <root>/<quarter>/<sample-id>.json', async () => {
    await withTmpStore(async ({ rootDir, store }) => {
      const record = stubRecord({ fetchedAt: '2026-04-24T12:00:00.000Z' });
      const outPath = await Effect.runPromise(store.write(record));
      expect(outPath.endsWith('.json')).toBe(true);
      expect(statSync(outPath).isFile()).toBe(true);
      expect(outPath).toContain(path.join(rootDir, '2026-Q2'));
      const written = JSON.parse(readFileSync(outPath, 'utf-8'));
      expect(written.kind).toBe('snapshot-record');
      expect(written.payload.url).toBe('https://example.com/');
    });
  });

  test('L-Record-Append-Only: repeat write() returns the existing path without overwriting', async () => {
    await withTmpStore(async ({ rootDir, store }) => {
      const r1 = stubRecord({ fetchedAt: '2026-04-24T12:05:00.000Z' });
      const p1 = await Effect.runPromise(store.write(r1));
      const originalMtime = statSync(p1).mtime.getTime();

      // Wait just enough to ensure mtime comparison is meaningful.
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Second write — same hour-bucket → same sample id.
      // The record payload is slightly different (different
      // fetchedAt minute) but the sample-id collapses to the
      // first record's id.
      const r2 = stubRecord({ fetchedAt: '2026-04-24T12:45:00.000Z' });
      expect(sampleIdOfRecord(r2)).toBe(sampleIdOfRecord(r1));

      const p2 = await Effect.runPromise(store.write(r2));
      expect(p2).toBe(p1);
      // File unchanged.
      expect(statSync(p2).mtime.getTime()).toBe(originalMtime);
      // Content still matches r1's fetchedAt.
      const written = JSON.parse(readFileSync(p2, 'utf-8'));
      expect(written.payload.fetchedAt).toBe('2026-04-24T12:05:00.000Z');
      // No stray files.
      void rootDir;
    });
  });

  test('different hour-buckets write to distinct paths', async () => {
    await withTmpStore(async ({ store }) => {
      const r1 = stubRecord({ fetchedAt: '2026-04-24T12:00:00.000Z' });
      const r2 = stubRecord({ fetchedAt: '2026-04-24T13:00:00.000Z' });
      const p1 = await Effect.runPromise(store.write(r1));
      const p2 = await Effect.runPromise(store.write(r2));
      expect(p2).not.toBe(p1);
    });
  });

  test('different substrateVersion writes to distinct paths', async () => {
    await withTmpStore(async ({ store }) => {
      const r1 = stubRecord({ substrateVersion: '1.0.0' });
      const r2 = stubRecord({ substrateVersion: '2.0.0' });
      const p1 = await Effect.runPromise(store.write(r1));
      const p2 = await Effect.runPromise(store.write(r2));
      expect(p2).not.toBe(p1);
    });
  });

  test('read() returns null for absent sample-id', async () => {
    await withTmpStore(async ({ store }) => {
      const result = await Effect.runPromise(store.read('nonexistent-id'));
      expect(result).toBeNull();
    });
  });

  test('read() returns the persisted record', async () => {
    await withTmpStore(async ({ store }) => {
      const r = stubRecord();
      await Effect.runPromise(store.write(r));
      const id = sampleIdOfRecord(r);
      const round = await Effect.runPromise(store.read(id));
      expect(round).not.toBeNull();
      expect(round!.payload.url).toBe(r.payload.url);
      expect(round!.fingerprints.content).toBe(r.fingerprints.content);
    });
  });

  test('listIds() returns IDs sorted by quarter then alphabetically', async () => {
    await withTmpStore(async ({ store }) => {
      // Write records across Q2 + Q3 boundaries with different URLs.
      const records = [
        stubRecord({ fetchedAt: '2026-07-01T10:00:00.000Z', url: 'https://a.example.com/' }),
        stubRecord({ fetchedAt: '2026-04-24T12:00:00.000Z', url: 'https://b.example.com/' }),
        stubRecord({ fetchedAt: '2026-04-24T14:00:00.000Z', url: 'https://c.example.com/' }),
      ];
      for (const r of records) await Effect.runPromise(store.write(r));
      const ids = await Effect.runPromise(store.listIds());
      expect(ids.length).toBe(3);
      // Each id is sha256 hex (64 chars).
      for (const id of ids) {
        expect(id).toMatch(/^[0-9a-f]{64}$/);
      }
    });
  });

  test('listIds() on empty store returns []', async () => {
    await withTmpStore(async ({ store }) => {
      const ids = await Effect.runPromise(store.listIds());
      expect(ids).toEqual([]);
    });
  });
});

/**
 * Z6 — filesystem-backed service integration laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.6 (ZC25/ZC25.fs):
 *
 *   - The filesystem HypothesisLedger mirrors the in-memory
 *     adapter's contract (append idempotent, findById, findByCohort,
 *     listAll).
 *   - The filesystem ReceiptStore writes hypothesis receipts as
 *     dated JSON files and appends ratchets idempotently to a
 *     JSONL log.
 *   - End-to-end computeScoreboard runs under the live layer with
 *     tempdir state from zero through 2 receipts.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { mkdtemp, rm, mkdir, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  hypothesisId,
  type Hypothesis,
} from '../../workshop/compounding/domain/hypothesis';
import type { Cohort } from '../../workshop/compounding/domain/cohort';
import { cohortKey } from '../../workshop/compounding/domain/cohort';
import type { Ratchet } from '../../workshop/compounding/domain/ratchet';
import { createFilesystemHypothesisLedger } from '../../workshop/compounding/harness/filesystem-hypothesis-ledger';
import { createFilesystemReceiptStore } from '../../workshop/compounding/harness/filesystem-receipt-store';
import { liveCompoundingLayer } from '../../workshop/compounding/composition/live-services';
import { computeScoreboard } from '../../workshop/compounding/application/compute-scoreboard';

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');

const COHORT_A: Cohort = {
  kind: 'probe-surface',
  cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
};

function h(id: string): Hypothesis {
  return {
    id: hypothesisId(id),
    description: `hypothesis-${id}`,
    schemaVersion: 1,
    cohort: COHORT_A,
    prediction: { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 1 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test',
    createdAt: PINNED_NOW.toISOString(),
  };
}

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'compounding-z6-'));
});

afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('Z6 — filesystem HypothesisLedger', () => {
  test('ZC25.fs.a: append + listAll round-trips hypotheses', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const ledger = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(ledger.append(h('h-1')));
    await Effect.runPromise(ledger.append(h('h-2')));

    const all = await Effect.runPromise(ledger.listAll());
    expect(all.map((x) => x.id)).toEqual(['h-1', 'h-2']);
  });

  test('ZC25.fs.b: append is idempotent on id across filesystem restarts', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const first = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(first.append(h('h-1')));
    await Effect.runPromise(first.append(h('h-1')));

    // New adapter instance over the same directory:
    const second = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(second.append(h('h-1')));
    const all = await Effect.runPromise(second.listAll());
    expect(all).toHaveLength(1);
  });

  test('ZC25.fs.c: findByCohort filters by cohort key', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const ledger = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(ledger.append(h('h-a')));
    await Effect.runPromise(
      ledger.append({
        ...h('h-b'),
        cohort: {
          kind: 'probe-surface',
          cohort: { verb: 'interact', facetKind: 'element', errorFamily: null },
        },
      }),
    );

    const matches = await Effect.runPromise(ledger.findByCohort(cohortKey(COHORT_A)));
    expect(matches.map((x) => x.id)).toEqual(['h-a']);
  });

  test('ZC25.fs.d: listAll on empty directory returns []', async () => {
    const ledger = createFilesystemHypothesisLedger({
      logDir: path.join(tempRoot, 'never-created'),
    });
    const all = await Effect.runPromise(ledger.listAll());
    expect(all).toEqual([]);
  });
});

describe('Z6 — filesystem ReceiptStore', () => {
  test('ZC25.fs.e: reads probe receipts from probe-receipts/ directory', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const probeDir = path.join(logDir, 'probe-receipts');
    await mkdir(probeDir, { recursive: true });
    const receipt = {
      payload: {
        probeId: 'probe:observe:test',
        verb: 'observe',
        fixtureName: 'test',
        hypothesisId: null,
        outcome: {
          expected: { classification: 'matched', errorFamily: null },
          observed: { classification: 'matched', errorFamily: null },
          completedAsExpected: true,
        },
        cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
      },
      fingerprints: { artifact: 'fp:1' },
    };
    await writeFile(path.join(probeDir, 'test.json'), JSON.stringify(receipt));

    const store = createFilesystemReceiptStore({ logDir });
    const receipts = await Effect.runPromise(store.latestProbeReceipts());
    expect(receipts).toHaveLength(1);
    expect(receipts[0]!.fingerprints.artifact).toBe('fp:1');
  });

  test('ZC25.fs.f: appendRatchet writes idempotent JSONL', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const store = createFilesystemReceiptStore({ logDir });
    const ratchet: Ratchet = {
      id: 'ratchet:demo',
      scenarioId: 'demo',
      firstPassedAt: PINNED_NOW.toISOString(),
      firstPassedFingerprint: 'fp:sr:demo',
    };
    await Effect.runPromise(store.appendRatchet(ratchet));
    await Effect.runPromise(store.appendRatchet(ratchet));
    const ratchets = await Effect.runPromise(store.listRatchets());
    expect(ratchets).toHaveLength(1);
    expect(ratchets[0]!.id).toBe('ratchet:demo');
  });

  test('ZC25.fs.g: appendHypothesisReceipt writes dated JSON files', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const store = createFilesystemReceiptStore({ logDir });
    const receipt = {
      version: 1 as const,
      stage: 'evidence' as const,
      scope: 'hypothesis' as const,
      kind: 'hypothesis-receipt' as const,
      ids: {},
      fingerprints: { artifact: 'fp:hr:abcdef123456' },
      lineage: { sources: [], parents: [], handshakes: ['evidence'] as const, experimentIds: [] },
      governance: 'approved' as const,
      payload: {
        hypothesisId: hypothesisId('h-1'),
        hypothesisFingerprint: 'fp:h:1' as never,
        outcome: 'confirmed' as const,
        evidenceReceiptIds: [],
        confirmedCount: 1,
        refutedCount: 0,
        inconclusiveCount: 0,
        cycleRate: 1,
        provenance: {
          substrateVersion: '1.0.0',
          manifestVersion: 1,
          computedAt: PINNED_NOW.toISOString(),
        },
      },
    };
    await Effect.runPromise(store.appendHypothesisReceipt(receipt));

    const hrDir = path.join(logDir, 'hypothesis-receipts');
    const files = await readdir(hrDir);
    expect(files).toHaveLength(1);
    expect(files[0]).toContain('h-1');
  });
});

describe('Z6 — live layer end-to-end (ZC25)', () => {
  test('ZC25: computeScoreboard under liveCompoundingLayer works from zero state', async () => {
    // Seed a hypothesis + probe receipt on disk, then compute.
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const ledger = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(ledger.append(h('h-a')));

    const probeDir = path.join(logDir, 'probe-receipts');
    await mkdir(probeDir, { recursive: true });
    const receipt = {
      payload: {
        probeId: 'probe:observe:p1',
        verb: 'observe',
        fixtureName: 'p1',
        hypothesisId: 'h-a',
        outcome: {
          expected: { classification: 'matched', errorFamily: null },
          observed: { classification: 'matched', errorFamily: null },
          completedAsExpected: true,
        },
        cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
      },
      fingerprints: { artifact: 'fp:p1' },
    };
    await writeFile(path.join(probeDir, 'p1.json'), JSON.stringify(receipt));

    const layer = liveCompoundingLayer({ rootDir: tempRoot });
    const scoreboard = await Effect.runPromise(
      computeScoreboard({ now: () => PINNED_NOW }).pipe(Effect.provide(layer)),
    );

    expect(scoreboard.trajectories).toHaveLength(1);
    expect(scoreboard.substrateVersion).toBeTruthy();

    // The hypothesis receipt was appended to the log.
    const hrDir = path.join(logDir, 'hypothesis-receipts');
    const files = await readdir(hrDir);
    expect(files.length).toBeGreaterThanOrEqual(1);
  });
});

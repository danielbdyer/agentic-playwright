/**
 * Z7 — snapshot store + regression cache laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.7:
 *
 *   ZC26 (snapshot round-trip): writing a snapshot then reading
 *        via readMostRecent returns the same envelope.
 *   ZC27 (regression detection across snapshots): snapshot A has
 *        pass-list [r1, r2]; current receipts flip r1 to failing;
 *        regression report names r1 in newlyFailing AND (if
 *        ratchet for r1 exists) in ratchetBreaks.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSnapshotStore, scoreboardFingerprint } from '../../workshop/compounding/application/snapshot-store';
import { hypothesisId, type Hypothesis } from '../../workshop/compounding/domain/hypothesis';
import type { Cohort } from '../../workshop/compounding/domain/cohort';
import type { CompoundingScoreboard } from '../../workshop/compounding/domain/scoreboard';
import { GRADUATION_CONDITIONS } from '../../workshop/compounding/domain/graduation';
import { createFilesystemHypothesisLedger } from '../../workshop/compounding/harness/filesystem-hypothesis-ledger';
import { liveCompoundingLayer } from '../../workshop/compounding/composition/live-services';
import { computeScoreboard } from '../../workshop/compounding/application/compute-scoreboard';

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');
const PINNED_LATER = new Date('2026-04-24T00:00:00.000Z');

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

function sampleScoreboard(passing: readonly string[]): CompoundingScoreboard {
  return {
    generatedAt: PINNED_NOW.toISOString(),
    probeCoverageRatio: 1,
    scenarioPassRatio: 1,
    trajectories: [],
    activeRatchetCount: 0,
    brokenRatchetCount: 0,
    graduation: {
      state: 'holds',
      missingConditions: [],
      conditions: GRADUATION_CONDITIONS.map((name) => ({
        name,
        held: true,
        detail: 'ok',
      })),
    },
    gaps: { probeGaps: [], scenarioGaps: [], generatedAt: PINNED_NOW.toISOString() },
    lastRegression: null,
    substrateVersion: '1.0.0',
  };
}

let tempRoot: string;
beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'compounding-z7-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

describe('Z7 — snapshot store', () => {
  test('ZC26: write + readMostRecent round-trips the envelope', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const store = createSnapshotStore({ logDir });
    const sb = sampleScoreboard(['fp:1', 'fp:2']);
    const written = await Effect.runPromise(store.write(sb, ['fp:1', 'fp:2']));
    const read = await Effect.runPromise(store.readMostRecent());
    expect(read).not.toBeNull();
    expect(read!.fingerprint).toBe(written.fingerprint);
    expect(read!.scoreboard.generatedAt).toBe(sb.generatedAt);
    expect(read!.passingArtifactIds).toEqual(['fp:1', 'fp:2']);
  });

  test('ZC26.b: readMostRecent returns null when no snapshots exist', async () => {
    const store = createSnapshotStore({ logDir: path.join(tempRoot, 'never-written') });
    const read = await Effect.runPromise(store.readMostRecent());
    expect(read).toBeNull();
  });

  test('ZC26.c: readMostRecent sorts by timestamp (latest wins)', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const store = createSnapshotStore({ logDir });
    const early = { ...sampleScoreboard([]), generatedAt: PINNED_NOW.toISOString() };
    const late = { ...sampleScoreboard([]), generatedAt: PINNED_LATER.toISOString() };
    await Effect.runPromise(store.write(early, ['early']));
    await Effect.runPromise(store.write(late, ['late']));
    const read = await Effect.runPromise(store.readMostRecent());
    expect(read?.scoreboard.generatedAt).toBe(PINNED_LATER.toISOString());
    expect(read?.passingArtifactIds).toEqual(['late']);
  });

  test('ZC26.d: scoreboardFingerprint is stable under identical inputs', () => {
    const sb = sampleScoreboard(['fp:1']);
    const a = scoreboardFingerprint(sb, ['fp:1']);
    const b = scoreboardFingerprint(sb, ['fp:1']);
    expect(a).toBe(b);
  });

  test('ZC26.e: scoreboardFingerprint changes when passing set changes', () => {
    const sb = sampleScoreboard([]);
    const a = scoreboardFingerprint(sb, ['fp:1']);
    const b = scoreboardFingerprint(sb, ['fp:2']);
    expect(a).not.toBe(b);
  });
});

describe('Z7 — regression detection across snapshots (ZC27)', () => {
  test('ZC27: prior snapshot names passing ids; current cycle flips one to failing; newlyFailing caught', async () => {
    const logDir = path.join(tempRoot, 'workshop', 'logs');
    const ledger = createFilesystemHypothesisLedger({ logDir });
    await Effect.runPromise(ledger.append(h('h-a')));

    // Cycle 1: everything passing.
    const probeDir = path.join(logDir, 'probe-receipts');
    await mkdir(probeDir, { recursive: true });
    const makeProbe = (artifact: string, pass: boolean) => ({
      payload: {
        probeId: `probe:${artifact}`,
        verb: 'observe',
        fixtureName: artifact,
        hypothesisId: 'h-a',
        outcome: {
          expected: { classification: 'matched', errorFamily: null },
          observed: {
            classification: pass ? 'matched' : 'failed',
            errorFamily: pass ? null : 'not-visible',
          },
          completedAsExpected: pass,
        },
        cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
      },
      fingerprints: { artifact },
    });

    await writeFile(path.join(probeDir, 'p1.json'), JSON.stringify(makeProbe('fp:p1', true)));
    await writeFile(path.join(probeDir, 'p2.json'), JSON.stringify(makeProbe('fp:p2', true)));

    const layer = liveCompoundingLayer({ rootDir: tempRoot });
    const snapshotStore = createSnapshotStore({ logDir });

    const scoreboard1 = await Effect.runPromise(
      computeScoreboard({ now: () => PINNED_NOW }).pipe(Effect.provide(layer)),
    );
    await Effect.runPromise(snapshotStore.write(scoreboard1, ['fp:p1', 'fp:p2']));

    // Cycle 2: fp:p1 now fails.
    await writeFile(path.join(probeDir, 'p1.json'), JSON.stringify(makeProbe('fp:p1', false)));

    const prior = await Effect.runPromise(snapshotStore.readMostRecent());
    expect(prior).not.toBeNull();

    const scoreboard2 = await Effect.runPromise(
      computeScoreboard({
        now: () => PINNED_LATER,
        priorPassing: new Set(prior!.passingArtifactIds),
        priorScoreboardFingerprint: prior!.fingerprint,
      }).pipe(Effect.provide(layer)),
    );

    expect(scoreboard2.lastRegression).not.toBeNull();
    expect(scoreboard2.lastRegression!.newlyFailing).toContain('fp:p1');
  });
});

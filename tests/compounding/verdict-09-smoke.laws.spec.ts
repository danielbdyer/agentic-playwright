/**
 * Z10 — verdict-09 end-to-end smoke + dashboard projection laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.10 (ZC31, ZC32):
 *
 *   ZC31 (end-to-end smoke):
 *     1. Author 3 hypotheses (three distinct prediction kinds).
 *     2. Run a probe spike + scenario corpus cycle (emits
 *        receipts).
 *     3. Compute scoreboard.
 *     4. Assert: graduation state is `not-yet` at first run;
 *        exactly 3 hypothesis receipts; scoreboard snapshot
 *        written.
 *
 *   ZC32 (dashboard projection): projection reads the latest
 *        snapshot + renders it; the projection shape matches
 *        CompoundingScoreboardProjection.
 *
 * The smoke test runs entirely via in-memory seeds — the
 * filesystem path is pinned by Z6 + Z7 laws already. This
 * keeps the smoke fast and deterministic.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { authorHypothesis } from '../../workshop/compounding/application/authoring';
import { computeScoreboard } from '../../workshop/compounding/application/compute-scoreboard';
import {
  createSnapshotStore,
} from '../../workshop/compounding/application/snapshot-store';
import { passingArtifactIds } from '../../workshop/compounding/application/regression';
import {
  ReceiptStore,
} from '../../workshop/compounding/application/ports';
import {
  liveCompoundingLayer,
  defaultReceiptLogDir,
} from '../../workshop/compounding/composition/live-services';
import {
  projectCompoundingScoreboard,
  projectCompoundingScoreboardFromBoard,
} from '../../dashboard/src/projections/compounding-scoreboard';

let tempRoot: string;
beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'compounding-z10-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function seedProbeReceipt(params: {
  readonly artifact: string;
  readonly hypothesisId: string | null;
  readonly pass: boolean;
  readonly verb?: string;
  readonly facetKind?: string;
}) {
  const dir = path.join(tempRoot, 'workshop', 'logs', 'probe-receipts');
  await mkdir(dir, { recursive: true });
  const receipt = {
    payload: {
      probeId: `probe:${params.artifact}`,
      verb: params.verb ?? 'observe',
      fixtureName: params.artifact,
      hypothesisId: params.hypothesisId,
      outcome: {
        expected: { classification: 'matched', errorFamily: null },
        observed: {
          classification: params.pass ? 'matched' : 'failed',
          errorFamily: params.pass ? null : 'not-visible',
        },
        completedAsExpected: params.pass,
      },
      cohort: {
        verb: params.verb ?? 'observe',
        facetKind: params.facetKind ?? 'element',
        errorFamily: null,
      },
    },
    fingerprints: { artifact: params.artifact },
  };
  await writeFile(path.join(dir, `${params.artifact}.json`), JSON.stringify(receipt));
}

async function seedScenarioReceipt(params: {
  readonly artifact: string;
  readonly scenarioId: string;
  readonly verdict: string;
  readonly hypothesisId: string | null;
}) {
  const dir = path.join(tempRoot, 'workshop', 'logs', 'scenario-receipts');
  await mkdir(dir, { recursive: true });
  const receipt = {
    payload: {
      scenarioId: params.scenarioId,
      hypothesisId: params.hypothesisId,
      verdict: params.verdict,
    },
    fingerprints: { artifact: params.artifact },
  };
  await writeFile(path.join(dir, `${params.artifact}.json`), JSON.stringify(receipt));
}

describe('Z10 — verdict-09 end-to-end smoke (ZC31)', () => {
  test('ZC31: author 3 hypotheses of different kinds + emit scoreboard + snapshot + dashboard projection', async () => {
    const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');
    const layer = liveCompoundingLayer({ rootDir: tempRoot });

    // ── Seed receipts ──────────────────────────────────────
    await seedProbeReceipt({ artifact: 'fp:p1', hypothesisId: 'h-cr', pass: true });
    await seedProbeReceipt({ artifact: 'fp:p2', hypothesisId: 'h-cr', pass: true });
    await seedProbeReceipt({ artifact: 'fp:p3', hypothesisId: 'h-cr', pass: false });
    await seedProbeReceipt({
      artifact: 'fp:p4',
      hypothesisId: 'h-cg',
      pass: true,
      verb: 'interact',
      facetKind: 'element',
    });
    await seedScenarioReceipt({
      artifact: 'fp:sr:demo',
      scenarioId: 'demo',
      verdict: 'trajectory-holds',
      hypothesisId: 'h-rf',
    });

    // ── Author 3 hypotheses (confirmation-rate + coverage-growth + regression-freedom) ─
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* authorHypothesis({
          id: 'h-cr',
          description: 'confirmation-rate hypothesis',
          cohort: {
            kind: 'probe-surface',
            cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
          },
          prediction: { kind: 'confirmation-rate', atLeast: 0.5, overCycles: 1 },
          now: () => PINNED_NOW,
        });
        yield* authorHypothesis({
          id: 'h-cg',
          description: 'coverage-growth hypothesis',
          cohort: {
            kind: 'probe-surface',
            cohort: { verb: 'interact', facetKind: 'element', errorFamily: null },
          },
          prediction: {
            kind: 'coverage-growth',
            verb: 'interact',
            facetKind: 'element',
            fromRatio: 0.5,
            toRatio: 0.9,
          },
          now: () => PINNED_NOW,
        });
        yield* authorHypothesis({
          id: 'h-rf',
          description: 'regression-freedom hypothesis',
          cohort: {
            kind: 'scenario-trajectory',
            scenarioId: 'demo',
            topologyId: 'login-form',
          },
          prediction: { kind: 'regression-freedom', receiptIds: ['fp:sr:demo'] },
          now: () => PINNED_NOW,
        });
      }).pipe(Effect.provide(layer)),
    );

    // ── Run compounding cycle ──────────────────────────────
    const snapshotStore = createSnapshotStore({ logDir: defaultReceiptLogDir(tempRoot) });
    const result = await Effect.runPromise(
      Effect.gen(function* () {
        const scoreboard = yield* computeScoreboard({ now: () => PINNED_NOW });
        const store = yield* ReceiptStore;
        const [probes, scenarios] = yield* Effect.all([
          store.latestProbeReceipts(),
          store.latestScenarioReceipts(),
        ]);
        const currentPassing = Array.from(passingArtifactIds(probes, scenarios));
        const envelope = yield* snapshotStore.write(scoreboard, currentPassing);
        return { scoreboard, envelope };
      }).pipe(Effect.provide(layer)),
    );

    // ── Assertions ─────────────────────────────────────────
    // First-run graduation is not-yet (no prior baseline; coverage
    // incomplete because `probeTargets` wasn't provided).
    expect(result.scoreboard.graduation.state).toBe('not-yet');

    // Three hypothesis receipts were emitted to the log this cycle.
    const { readdir } = await import('node:fs/promises');
    const hrDir = path.join(tempRoot, 'workshop', 'logs', 'hypothesis-receipts');
    const hrFiles = await readdir(hrDir);
    expect(hrFiles).toHaveLength(3);

    // Scoreboard snapshot was written.
    expect(result.envelope.fingerprint).toBeTruthy();
    const snapshotReadback = await Effect.runPromise(snapshotStore.readMostRecent());
    expect(snapshotReadback?.fingerprint).toBe(result.envelope.fingerprint);

    // Trajectories: one per cohort with at least one entry.
    expect(result.scoreboard.trajectories.length).toBeGreaterThanOrEqual(1);
  });
});

describe('Z10 — dashboard projection (ZC32)', () => {
  test('ZC32: projectCompoundingScoreboard reads snapshot + renders the expected shape', async () => {
    const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');
    const layer = liveCompoundingLayer({ rootDir: tempRoot });
    await seedProbeReceipt({ artifact: 'fp:p1', hypothesisId: null, pass: true });

    const snapshotStore = createSnapshotStore({ logDir: defaultReceiptLogDir(tempRoot) });
    await Effect.runPromise(
      Effect.gen(function* () {
        const scoreboard = yield* computeScoreboard({ now: () => PINNED_NOW });
        yield* snapshotStore.write(scoreboard, ['fp:p1']);
      }).pipe(Effect.provide(layer)),
    );

    const snapshot = await Effect.runPromise(snapshotStore.readMostRecent());
    const projection = projectCompoundingScoreboard(snapshot);
    expect(projection).not.toBeNull();
    expect(projection!.graduationPanel.state).toMatch(/holds|not-yet|regressed/);
    expect(projection!.gauges.probeCoverageRatio).toBeGreaterThanOrEqual(0);
    expect(projection!.gauges.probeCoverageRatio).toBeLessThanOrEqual(1);
    expect(projection!.gauges.scenarioPassRatio).toBeGreaterThanOrEqual(0);
    expect(projection!.ratchetPanel.active).toBeGreaterThanOrEqual(0);
    expect(projection!.snapshotFingerprint).toBe(snapshot!.fingerprint);
  });

  test('ZC32.b: projectCompoundingScoreboard returns null when no snapshot exists', () => {
    const projection = projectCompoundingScoreboard(null);
    expect(projection).toBeNull();
  });

  test('ZC32.c: projectCompoundingScoreboardFromBoard exposes probe/scenario gaps within topN', () => {
    const board = {
      generatedAt: '2026-04-23T00:00:00.000Z',
      probeCoverageRatio: 0,
      scenarioPassRatio: 0,
      trajectories: [],
      activeRatchetCount: 0,
      brokenRatchetCount: 0,
      graduation: {
        state: 'not-yet' as const,
        missingConditions: ['probe-coverage-is-100'],
        conditions: [
          { name: 'probe-coverage-is-100', held: false, detail: 'none' },
          { name: 'scenario-corpus-all-passes', held: false, detail: 'none' },
          { name: 'hypothesis-confirmation-rate-sustained', held: false, detail: 'none' },
          { name: 'no-ratchet-regressions', held: true, detail: 'none' },
        ],
      },
      gaps: {
        probeGaps: [
          { verb: 'a', facetKind: 'element', errorFamily: null },
          { verb: 'b', facetKind: 'element', errorFamily: null },
          { verb: 'c', facetKind: 'element', errorFamily: null },
        ],
        scenarioGaps: [{ topologyId: 't1', uncoveredInvariants: ['i1'] }],
        generatedAt: '2026-04-23T00:00:00.000Z',
      },
      lastRegression: null,
      substrateVersion: '1.0.0',
    };
    const projection = projectCompoundingScoreboardFromBoard(board, { topN: 2 });
    expect(projection.gapPanel.topProbeGaps).toHaveLength(2);
    expect(projection.gapPanel.probeGapCount).toBe(3);
    expect(projection.gapPanel.topScenarioGaps).toHaveLength(1);
  });
});

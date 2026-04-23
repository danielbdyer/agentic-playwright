/**
 * Z8 — compounding CLI laws.
 *
 * Per docs/v2-compounding-engine-plan.md §9.8 (ZC28):
 *   ZC28 (exit discipline):
 *     - `tesseract compounding-scoreboard` always exits 0 on
 *       success.
 *     - `tesseract compounding-improve` exits 0 when there are no
 *       ratchet breaks; exits 1 if any ratchet breaks are present.
 *
 * These laws exercise the CLI executors directly (bypassing the
 * top-level `bin/tesseract.ts` parser) — the exit-code discipline
 * is an ExecutionResult field the parser maps to process.exit.
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { Effect } from 'effect';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {
  compoundingScoreboardCommand,
} from '../../workshop/cli/commands/compounding-scoreboard';
import {
  compoundingImproveCommand,
} from '../../workshop/cli/commands/compounding-improve';
import { hypothesisId, type Hypothesis } from '../../workshop/compounding/domain/hypothesis';
import { createFilesystemHypothesisLedger } from '../../workshop/compounding/harness/filesystem-hypothesis-ledger';
import { createFilesystemReceiptStore } from '../../workshop/compounding/harness/filesystem-receipt-store';

const PINNED_NOW = new Date('2026-04-23T00:00:00.000Z');

function h(id: string): Hypothesis {
  return {
    id: hypothesisId(id),
    description: `hypothesis-${id}`,
    schemaVersion: 1,
    cohort: {
      kind: 'probe-surface',
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    },
    prediction: { kind: 'confirmation-rate', atLeast: 0.8, overCycles: 1 },
    requiredConsecutiveConfirmations: 3,
    supersedes: null,
    author: 'test',
    createdAt: PINNED_NOW.toISOString(),
  };
}

let tempRoot: string;
beforeEach(async () => {
  tempRoot = await mkdtemp(path.join(os.tmpdir(), 'compounding-cli-'));
});
afterEach(async () => {
  await rm(tempRoot, { recursive: true, force: true });
});

async function seedHypothesis(id: string) {
  const logDir = path.join(tempRoot, 'workshop', 'logs');
  const ledger = createFilesystemHypothesisLedger({ logDir });
  await Effect.runPromise(ledger.append(h(id)));
}

async function seedProbeReceipt(params: {
  readonly artifact: string;
  readonly pass: boolean;
  readonly hypothesisId: string | null;
}) {
  const dir = path.join(tempRoot, 'workshop', 'logs', 'probe-receipts');
  await mkdir(dir, { recursive: true });
  const receipt = {
    payload: {
      probeId: `probe:${params.artifact}`,
      verb: 'observe',
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
      cohort: { verb: 'observe', facetKind: 'element', errorFamily: null },
    },
    fingerprints: { artifact: params.artifact },
  };
  await writeFile(path.join(dir, `${params.artifact}.json`), JSON.stringify(receipt));
}

async function seedRatchet(params: {
  readonly scenarioId: string;
  readonly fingerprint: string;
}) {
  const logDir = path.join(tempRoot, 'workshop', 'logs');
  const store = createFilesystemReceiptStore({ logDir });
  await Effect.runPromise(
    store.appendRatchet({
      id: `ratchet:${params.scenarioId}`,
      scenarioId: params.scenarioId,
      firstPassedAt: PINNED_NOW.toISOString(),
      firstPassedFingerprint: params.fingerprint,
    }),
  );
}

async function seedScenarioReceipt(params: {
  readonly artifact: string;
  readonly scenarioId: string;
  readonly verdict: string;
}) {
  const dir = path.join(tempRoot, 'workshop', 'logs', 'scenario-receipts');
  await mkdir(dir, { recursive: true });
  const receipt = {
    payload: {
      scenarioId: params.scenarioId,
      hypothesisId: null,
      verdict: params.verdict,
    },
    fingerprints: { artifact: params.artifact },
  };
  await writeFile(path.join(dir, `${params.artifact}.json`), JSON.stringify(receipt));
}

describe('Z8 — compounding CLI (ZC28)', () => {
  test('ZC28: compounding-scoreboard always succeeds on an empty corpus', async () => {
    const execution = compoundingScoreboardCommand.parse({ flags: {} as never });
    const paths = { rootDir: tempRoot } as never;
    const result = await Effect.runPromise(
      execution.execute(paths, {} as never) as unknown as Effect.Effect<unknown, unknown, never>,
    );
    expect(result).toMatchObject({ scoreboard: expect.anything() });
  });

  test('ZC28.b: compounding-improve exits 0 when no ratchet breaks', async () => {
    await seedHypothesis('h-a');
    await seedProbeReceipt({ artifact: 'fp:p1', pass: true, hypothesisId: 'h-a' });

    const execution = compoundingImproveCommand.parse({ flags: {} as never });
    const paths = { rootDir: tempRoot } as never;
    const result = (await Effect.runPromise(
      execution.execute(paths, {} as never) as unknown as Effect.Effect<unknown, unknown, never>,
    )) as { readonly exitCode: number; readonly ratchetBreaks: readonly unknown[] };
    expect(result.exitCode).toBe(0);
    expect(result.ratchetBreaks).toEqual([]);
  });

  test('ZC28.c: compounding-improve exits 1 when ratchet breaks are present', async () => {
    // Cycle 1: scenario passing + ratchet it.
    await seedScenarioReceipt({
      artifact: 'fp:sr:demo',
      scenarioId: 'demo',
      verdict: 'trajectory-holds',
    });
    await seedRatchet({ scenarioId: 'demo', fingerprint: 'fp:sr:demo' });

    // Snapshot the current cycle (so priorPassing is populated).
    const snapshotExec = compoundingScoreboardCommand.parse({ flags: {} as never });
    await Effect.runPromise(
      snapshotExec.execute({ rootDir: tempRoot } as never, {} as never) as unknown as Effect.Effect<
        unknown,
        unknown,
        never
      >,
    );

    // Cycle 2: scenario now fails — ratchet break.
    await seedScenarioReceipt({
      artifact: 'fp:sr:demo',
      scenarioId: 'demo',
      verdict: 'step-diverged',
    });

    const execution = compoundingImproveCommand.parse({ flags: {} as never });
    const result = (await Effect.runPromise(
      execution.execute({ rootDir: tempRoot } as never, {} as never) as unknown as Effect.Effect<
        unknown,
        unknown,
        never
      >,
    )) as { readonly exitCode: number; readonly ratchetBreaks: readonly unknown[] };
    expect(result.exitCode).toBe(1);
    expect(result.ratchetBreaks.length).toBeGreaterThanOrEqual(1);
  });
});

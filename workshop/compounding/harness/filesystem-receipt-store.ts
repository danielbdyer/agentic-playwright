/**
 * Filesystem-backed ReceiptStore.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z6, the live adapter:
 *
 *   - Reads probe receipts from <logDir>/probe-receipts/*.json
 *   - Reads scenario receipts from <logDir>/scenario-receipts/*.json
 *   - Appends hypothesis receipts to
 *       <logDir>/hypothesis-receipts/<timestamp>-<fingerprint>.json
 *   - Appends ratchets to <logDir>/ratchets.jsonl (idempotent on id).
 *   - Reads ratchets from the same file.
 *
 * The storage layout mirrors the existing probe / scenario receipt
 * log patterns used by the harness side of those features. File-
 * per-receipt for probe + scenario (existing convention); JSONL
 * for hypothesis-receipts + ratchets (append-only discipline).
 *
 * Reads are eager + unsorted across the cycle's receipt set. Larger
 * logs can add date-bucketed subdirectories later; for now the
 * "cycle" = "all files in the directory" is fine.
 */

import { Effect } from 'effect';
import { mkdir, appendFile, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HypothesisId } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import type { Ratchet } from '../domain/ratchet';
import {
  logIoFailed,
  type CompoundingError,
} from '../domain/compounding-error';
import type {
  ProbeReceiptLike,
  ReceiptStoreService,
  ScenarioReceiptLike,
} from '../application/ports';

export interface FilesystemReceiptStoreOptions {
  readonly logDir: string;
  /** Directory (relative to logDir) holding probe-receipt JSON
   *  files. Default 'probe-receipts'. */
  readonly probeReceiptsDir?: string;
  /** Directory (relative to logDir) holding scenario-receipt JSON
   *  files. Default 'scenario-receipts'. */
  readonly scenarioReceiptsDir?: string;
  /** Directory (relative to logDir) for hypothesis-receipt output.
   *  Default 'hypothesis-receipts'. */
  readonly hypothesisReceiptsDir?: string;
  /** Filename (relative to logDir) for the ratchets JSONL. Default
   *  'ratchets.jsonl'. */
  readonly ratchetsFile?: string;
}

export function createFilesystemReceiptStore(
  options: FilesystemReceiptStoreOptions,
): ReceiptStoreService {
  const probeDir = path.join(options.logDir, options.probeReceiptsDir ?? 'probe-receipts');
  const scenarioDir = path.join(options.logDir, options.scenarioReceiptsDir ?? 'scenario-receipts');
  const hrDir = path.join(options.logDir, options.hypothesisReceiptsDir ?? 'hypothesis-receipts');
  const ratchetsFile = path.join(options.logDir, options.ratchetsFile ?? 'ratchets.jsonl');

  const readJsonFiles = <T>(dir: string): Effect.Effect<readonly T[], CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        try {
          const entries = await readdir(dir);
          const jsonFiles = entries.filter((e) => e.endsWith('.json')).sort();
          const out: T[] = [];
          for (const file of jsonFiles) {
            const content = await readFile(path.join(dir, file), 'utf-8');
            out.push(JSON.parse(content) as T);
          }
          return out;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [] as T[];
          throw err;
        }
      },
      catch: (cause) => logIoFailed(dir, String(cause)),
    });

  const readRatchets = (): Effect.Effect<readonly Ratchet[], CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        try {
          const contents = await readFile(ratchetsFile, 'utf-8');
          const lines = contents.split('\n').filter((l) => l.trim().length > 0);
          const seen = new Set<string>();
          const out: Ratchet[] = [];
          for (const line of lines) {
            const r = JSON.parse(line) as Ratchet;
            if (!seen.has(r.id)) {
              seen.add(r.id);
              out.push(r);
            }
          }
          return out;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [] as Ratchet[];
          throw err;
        }
      },
      catch: (cause) => logIoFailed(ratchetsFile, String(cause)),
    });

  const latestProbeReceipts = (): Effect.Effect<
    readonly ProbeReceiptLike[],
    CompoundingError,
    never
  > => readJsonFiles<ProbeReceiptLike>(probeDir);

  const latestScenarioReceipts = (): Effect.Effect<
    readonly ScenarioReceiptLike[],
    CompoundingError,
    never
  > => readJsonFiles<ScenarioReceiptLike>(scenarioDir);

  const probeReceiptsForHypothesis = (
    id: HypothesisId,
  ): Effect.Effect<readonly ProbeReceiptLike[], CompoundingError, never> =>
    Effect.map(latestProbeReceipts(), (all) => all.filter((r) => r.payload.hypothesisId === id));

  const scenarioReceiptsForHypothesis = (
    id: HypothesisId,
  ): Effect.Effect<readonly ScenarioReceiptLike[], CompoundingError, never> =>
    Effect.map(latestScenarioReceipts(), (all) =>
      all.filter((r) => r.payload.hypothesisId === id),
    );

  const appendHypothesisReceipt = (
    r: HypothesisReceipt,
  ): Effect.Effect<void, CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        await mkdir(hrDir, { recursive: true });
        const ts = r.payload.provenance.computedAt.replace(/[:.]/g, '-');
        const fp = r.fingerprints.artifact.slice(0, 12);
        const file = path.join(hrDir, `${ts}-${r.payload.hypothesisId}-${fp}.json`);
        await writeFile(file, `${JSON.stringify(r, null, 2)}\n`, 'utf-8');
      },
      catch: (cause) => logIoFailed(hrDir, String(cause)),
    });

  /** Z10c — read all accumulated hypothesis receipts so multi-cycle
   *  trajectories reconstruct deterministically across CLI
   *  invocations. Filename sort (timestamp-prefixed) gives ascending
   *  computedAt order; a final in-memory sort defends against
   *  filename drift. */
  const listHypothesisReceipts = (): Effect.Effect<
    readonly HypothesisReceipt[],
    CompoundingError,
    never
  > =>
    Effect.map(
      readJsonFiles<HypothesisReceipt>(hrDir),
      (receipts) =>
        [...receipts].sort((a, b) =>
          a.payload.provenance.computedAt.localeCompare(b.payload.provenance.computedAt),
        ),
    );

  const appendRatchet = (r: Ratchet): Effect.Effect<void, CompoundingError, never> =>
    Effect.gen(function* () {
      const existing = yield* readRatchets();
      if (existing.some((e) => e.id === r.id)) return;
      yield* Effect.tryPromise({
        try: async () => {
          await mkdir(options.logDir, { recursive: true });
          await appendFile(ratchetsFile, `${JSON.stringify(r)}\n`, 'utf-8');
        },
        catch: (cause) => logIoFailed(ratchetsFile, String(cause)),
      });
    });

  const listRatchets = (): Effect.Effect<readonly Ratchet[], CompoundingError, never> =>
    readRatchets();

  return {
    probeReceiptsForHypothesis,
    scenarioReceiptsForHypothesis,
    latestProbeReceipts,
    latestScenarioReceipts,
    appendHypothesisReceipt,
    listHypothesisReceipts,
    appendRatchet,
    listRatchets,
  };
}

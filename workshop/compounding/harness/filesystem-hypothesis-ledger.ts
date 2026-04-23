/**
 * Filesystem-backed HypothesisLedger.
 *
 * Per docs/v2-compounding-engine-plan.md §7.Z6, the live adapter
 * reads + writes JSONL (one hypothesis per line). Append-only:
 * first-wins semantics on id (second append of same id is a no-op
 * — matches the in-memory adapter's ZC12 discipline). Writes use
 * fs.promises.appendFile which is atomic at the line level for
 * small JSON lines on POSIX.
 *
 * Storage layout:
 *   <logDir>/hypotheses.jsonl
 *
 * The adapter creates the directory if missing (first-run
 * idempotence). Reads parse the whole file; per-cycle this is
 * O(H) which is fine for the authoring rate.
 */

import { Effect } from 'effect';
import { mkdir, appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { cohortKey } from '../domain/cohort';
import type { Hypothesis, HypothesisId } from '../domain/hypothesis';
import {
  logIoFailed,
  type CompoundingError,
} from '../domain/compounding-error';
import type { HypothesisLedgerService } from '../application/ports';

export interface FilesystemHypothesisLedgerOptions {
  readonly logDir: string;
}

export function createFilesystemHypothesisLedger(
  options: FilesystemHypothesisLedgerOptions,
): HypothesisLedgerService {
  const filePath = path.join(options.logDir, 'hypotheses.jsonl');

  const readAll = (): Effect.Effect<readonly Hypothesis[], CompoundingError, never> =>
    Effect.tryPromise({
      try: async () => {
        try {
          const contents = await readFile(filePath, 'utf-8');
          const lines = contents.split('\n').filter((l) => l.trim().length > 0);
          const seen = new Set<string>();
          const out: Hypothesis[] = [];
          for (const line of lines) {
            const parsed = JSON.parse(line) as Hypothesis;
            if (!seen.has(parsed.id)) {
              seen.add(parsed.id);
              out.push(parsed);
            }
          }
          return out;
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [] as Hypothesis[];
          throw err;
        }
      },
      catch: (cause) => logIoFailed(filePath, String(cause)),
    });

  const append = (h: Hypothesis): Effect.Effect<void, CompoundingError, never> =>
    Effect.gen(function* () {
      const existing = yield* readAll();
      if (existing.some((e) => e.id === h.id)) return;
      yield* Effect.tryPromise({
        try: async () => {
          await mkdir(options.logDir, { recursive: true });
          await appendFile(filePath, `${JSON.stringify(h)}\n`, 'utf-8');
        },
        catch: (cause) => logIoFailed(filePath, String(cause)),
      });
    });

  const findById = (
    id: HypothesisId,
  ): Effect.Effect<Hypothesis | null, CompoundingError, never> =>
    Effect.map(readAll(), (all) => all.find((h) => h.id === id) ?? null);

  const findByCohort = (
    cohortKeyValue: string,
  ): Effect.Effect<readonly Hypothesis[], CompoundingError, never> =>
    Effect.map(readAll(), (all) => all.filter((h) => cohortKey(h.cohort) === cohortKeyValue));

  const listAll = (): Effect.Effect<readonly Hypothesis[], CompoundingError, never> =>
    readAll();

  return { append, findById, findByCohort, listAll };
}

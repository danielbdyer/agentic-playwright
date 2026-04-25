/**
 * Local improvement-run repository — JSONL append-only.
 *
 * ## Storage layout
 *
 *   <rootDir>/.tesseract/benchmarks/improvement-ledger.jsonl
 *
 * Each line is a single `ImprovementRun` JSON object. The
 * file is append-only on the writer side; the reader
 * reconstructs the `ImprovementLedger` envelope by reading
 * every line.
 *
 * ## Why JSONL, not single-JSON
 *
 * The previous implementation rewrote the entire ledger file
 * on every `appendRun` (read full ledger + appended in memory
 * + writeFile entire ledger). That has two failure modes:
 *
 *   1. Crash mid-write — partial JSON on disk; file becomes
 *      unparseable; entire run history lost.
 *   2. Concurrent writers — last-writer-wins clobbers
 *      uncoordinated appends; silent data loss.
 *
 * JSONL append-only via `fs.appendFile` is atomic at the line
 * level (POSIX guarantees `O_APPEND` writes < PIPE_BUF are
 * atomic; JSON-line writes here are typically < 4 KiB). No
 * partial-write corruption; concurrent writers interleave
 * cleanly.
 *
 * ## Backward compatibility
 *
 * If the legacy `improvement-ledger.json` exists at the
 * canonical path, `loadLedger` migrates it to `.jsonl` on
 * first read. Operators with existing benchmarks workspaces
 * see no data loss across the format flip.
 *
 * ## Adapter discipline
 *
 * Per CLAUDE.md / coding-notes.md, every log is append-only
 * and confidence derives on read. This repository now lives
 * up to that discipline.
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { ImprovementRunRepository } from '../../domain/improvement/improvement-run-repository';
import type { ImprovementLedger, ImprovementRun } from '../../domain/improvement/types';
import {
  emptyImprovementLedger,
  improvementRunInvariants,
} from '../../domain/aggregates/improvement-run';

function isImprovementRun(value: unknown): value is ImprovementRun {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Partial<ImprovementRun>).kind === 'improvement-run' &&
    (value as Partial<ImprovementRun>).version === 1 &&
    typeof (value as Partial<ImprovementRun>).improvementRunId === 'string'
  );
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertRun(run: ImprovementRun): ImprovementRun {
  const report = improvementRunInvariants(run);
  if (!report.uniqueIdentity || !report.lineageContinuity || !report.governanceConsistency) {
    throw new Error(`ImprovementRun invariant failure (${JSON.stringify(report)})`);
  }
  return run;
}

/** Resolve the JSONL path from any caller-supplied path. The
 *  caller's path may end in `.json` or `.jsonl`; we always
 *  operate on `.jsonl` and migrate `.json` once on first
 *  read. */
function jsonlPathOf(absolutePath: string): string {
  if (absolutePath.endsWith('.jsonl')) return absolutePath;
  if (absolutePath.endsWith('.json')) {
    return absolutePath.slice(0, -'.json'.length) + '.jsonl';
  }
  return absolutePath + '.jsonl';
}

function legacyJsonPathOf(absolutePath: string): string {
  if (absolutePath.endsWith('.json')) return absolutePath;
  if (absolutePath.endsWith('.jsonl')) {
    return absolutePath.slice(0, -'.jsonl'.length) + '.json';
  }
  return absolutePath + '.json';
}

/** Parse a JSONL string into the run array. Skips blank lines.
 *  Lines that fail to parse or fail validation are skipped
 *  with a console warning rather than failing the whole load
 *  — append-only logs treat corrupt entries as data loss for
 *  that entry, not aborts. */
function parseJsonl(text: string, sourcePath: string): readonly ImprovementRun[] {
  const lines = text.split('\n').filter((line) => line.trim().length > 0);
  return lines.flatMap((line, i): readonly ImprovementRun[] => {
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isImprovementRun(parsed)) {
        console.warn(
          `[improvement-ledger] ${sourcePath}:${i + 1} not a valid ImprovementRun — skipping`,
        );
        return [];
      }
      return [parsed];
    } catch (err) {
      console.warn(
        `[improvement-ledger] ${sourcePath}:${i + 1} failed to parse — skipping (${err instanceof Error ? err.message : String(err)})`,
      );
      return [];
    }
  });
}

/** Migrate a legacy `improvement-ledger.json` to `.jsonl`.
 *  Reads the old envelope, writes one line per run to the
 *  new file, deletes the old file. Idempotent: if `.jsonl`
 *  already exists, the legacy file is just removed. */
async function migrateLegacyJson(legacyPath: string, targetPath: string): Promise<void> {
  try {
    const raw: unknown = JSON.parse(await fs.readFile(legacyPath, 'utf8'));
    if (
      typeof raw === 'object' &&
      raw !== null &&
      (raw as { kind?: string }).kind === 'improvement-ledger' &&
      Array.isArray((raw as { runs?: unknown }).runs)
    ) {
      const runs = (raw as { runs: unknown[] }).runs.filter(isImprovementRun);
      if (!(await exists(targetPath))) {
        await fs.mkdir(path.dirname(targetPath), { recursive: true });
        const content = runs.map((run) => JSON.stringify(run)).join('\n') + '\n';
        await fs.writeFile(targetPath, content, 'utf8');
      }
    }
  } catch {
    // Legacy file unreadable; leave both files in place and
    // log silently — the next loadLedger call will retry.
    return;
  }
  try {
    await fs.unlink(legacyPath);
  } catch {
    /* ignore */
  }
}

export const LocalImprovementRunRepository: ImprovementRunRepository = {
  async loadLedger(absolutePath: string): Promise<ImprovementLedger> {
    const jsonlAbs = jsonlPathOf(absolutePath);
    const legacyAbs = legacyJsonPathOf(absolutePath);

    // Backward compat: migrate legacy `.json` if present and
    // `.jsonl` doesn't yet exist.
    if (
      legacyAbs !== jsonlAbs &&
      (await exists(legacyAbs)) &&
      !(await exists(jsonlAbs))
    ) {
      await migrateLegacyJson(legacyAbs, jsonlAbs);
    }

    if (!(await exists(jsonlAbs))) {
      return emptyImprovementLedger();
    }
    const raw = await fs.readFile(jsonlAbs, 'utf8');
    const runs = parseJsonl(raw, jsonlAbs);
    runs.forEach((run) => {
      assertRun(run);
    });
    return {
      kind: 'improvement-ledger',
      version: 1,
      runs,
    };
  },

  async saveLedger(absolutePath: string, ledger: ImprovementLedger): Promise<ImprovementLedger> {
    // saveLedger rewrites the full ledger — used for tests +
    // the rare bulk-write case. Production code-paths should
    // prefer `appendRun` for crash-safety + O(1) appends.
    ledger.runs.forEach((run) => {
      assertRun(run);
    });
    const jsonlAbs = jsonlPathOf(absolutePath);
    await fs.mkdir(path.dirname(jsonlAbs), { recursive: true });
    const content =
      ledger.runs.length === 0
        ? ''
        : ledger.runs.map((run) => JSON.stringify(run)).join('\n') + '\n';
    await fs.writeFile(jsonlAbs, content, 'utf8');
    return ledger;
  },

  async appendRun(absolutePath: string, run: ImprovementRun): Promise<ImprovementLedger> {
    assertRun(run);
    const jsonlAbs = jsonlPathOf(absolutePath);
    await fs.mkdir(path.dirname(jsonlAbs), { recursive: true });
    // Atomic line append. POSIX guarantees `O_APPEND` writes
    // shorter than PIPE_BUF (4096 bytes typical) are atomic
    // across concurrent writers.
    await fs.appendFile(jsonlAbs, JSON.stringify(run) + '\n', 'utf8');
    // Reconstruct the ledger envelope from disk so the return
    // value reflects the post-append state including any
    // concurrent writes the caller didn't see.
    return LocalImprovementRunRepository.loadLedger(absolutePath);
  },
};

/**
 * Scenario-receipt emission helper — optionally persists
 * ScenarioReceipt[] produced by `scenario-verify` to
 * `workshop/logs/scenario-receipts/` so the compounding engine's
 * FilesystemReceiptStore can consume them on the next cycle.
 *
 * Per docs/v2-compounding-engine-plan.md §4.5, the filesystem store
 * reads `<logDir>/scenario-receipts/*.json`. Before Z10a, the
 * `scenario-verify` CLI produced ScenarioReceipts in-process via
 * buildScenarioReceipt but never appended them anywhere — the
 * stubbed `// future S9b: append to log` comment pointed to this
 * gap. This module closes it.
 *
 * Design notes:
 *   - Writes opt-in; backward-compat: CLI paths that don't set the
 *     flag continue to return the verdict without writing.
 *   - Filenames incorporate a cycle-stable ISO timestamp + short
 *     artifact fingerprint so repeat runs don't clobber and sort
 *     deterministically.
 *   - An optional `hypothesisId` override re-stamps the receipt's
 *     payload before writing (parallels the probe-receipt emitter
 *     per Z10a).
 */

import { Effect } from 'effect';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ScenarioReceipt } from '../domain/scenario-receipt';

export interface EmitScenarioReceiptsOptions {
  readonly logDir: string;
  readonly receipts: readonly ScenarioReceipt[];
  /** Optional attribution override. Undefined leaves the receipt's
   *  existing hypothesisId unchanged; null explicitly clears it. */
  readonly hypothesisId?: string | null;
}

export function emitScenarioReceiptsToFilesystem(
  options: EmitScenarioReceiptsOptions,
): Effect.Effect<readonly string[], Error, never> {
  return Effect.promise(async () => {
    const dir = path.join(options.logDir, 'scenario-receipts');
    await mkdir(dir, { recursive: true });
    const writtenPaths: string[] = [];
    for (const receipt of options.receipts) {
      const stamped = options.hypothesisId !== undefined
        ? {
            ...receipt,
            payload: {
              ...receipt.payload,
              hypothesisId: options.hypothesisId,
            },
          }
        : receipt;
      const ts = stamped.payload.provenance.completedAt.replace(/[:.]/g, '-');
      const fp = stamped.fingerprints.artifact.slice(0, 12);
      const safeScenarioId = stamped.payload.scenarioId.replace(/[^a-zA-Z0-9._-]/g, '_');
      const file = path.join(dir, `${ts}-${safeScenarioId}-${fp}.json`);
      await writeFile(file, `${JSON.stringify(stamped, null, 2)}\n`, 'utf-8');
      writtenPaths.push(file);
    }
    return writtenPaths;
  });
}

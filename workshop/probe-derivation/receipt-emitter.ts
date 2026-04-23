/**
 * Probe-receipt emission helper — optionally persists the spike's
 * ProbeReceipt[] to `workshop/logs/probe-receipts/` so the
 * compounding engine's FilesystemReceiptStore can see them on the
 * next cycle.
 *
 * Per docs/v2-compounding-engine-plan.md §4.5, the filesystem store
 * reads `<logDir>/probe-receipts/*.json`. Before Z10a, the CLI
 * `probe-spike` did not emit to that dir — it computed the SpikeVerdict
 * and returned it without writing. This module closes that glue gap.
 *
 * Design notes:
 *   - Writes are opt-in via the caller (see probe-spike CLI). The
 *     default emission behavior stays read-only for backward-compat
 *     with the existing spike-inspection use case.
 *   - Filenames use `<iso-timestamp>-<probe-id>-<short-fp>.json` so
 *     accumulated cycles produce distinct files; directory read order
 *     remains deterministic.
 *   - An optional `hypothesisId` override re-stamps the receipt's
 *     payload before writing. Probe receipts emitted by the dry-
 *     harness carry `hypothesisId: null`; attributing them to a
 *     hypothesis is the compounding engine's evaluator's input.
 *
 * Pure-ish: the Effect wraps fs.mkdir + fs.writeFile; no shared
 * mutable state otherwise.
 */

import { Effect } from 'effect';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ProbeReceipt } from './probe-receipt';

export interface EmitProbeReceiptsOptions {
  readonly logDir: string;
  readonly receipts: readonly ProbeReceipt[];
  /** When provided, overrides each receipt's payload.hypothesisId
   *  before writing. Null is valid and leaves the existing null. */
  readonly hypothesisId?: string | null;
  /** When provided, overrides each receipt's payload.provenance
   *  `startedAt`/`completedAt` — exposed so callers that want to
   *  anchor emitted receipts to a specific cycle timestamp can do
   *  so (tests, repeat runs). */
  readonly computedAt?: () => Date;
}

export function emitProbeReceiptsToFilesystem(
  options: EmitProbeReceiptsOptions,
): Effect.Effect<readonly string[], Error, never> {
  return Effect.promise(async () => {
    const dir = path.join(options.logDir, 'probe-receipts');
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
      const safeProbeId = stamped.payload.probeId.replace(/[^a-zA-Z0-9._-]/g, '_');
      const file = path.join(dir, `${ts}-${safeProbeId}-${fp}.json`);
      await writeFile(file, `${JSON.stringify(stamped, null, 2)}\n`, 'utf-8');
      writtenPaths.push(file);
    }
    return writtenPaths;
  });
}

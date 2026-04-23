/**
 * `tesseract probe-spike` — runs the Probe IR spike end-to-end.
 *
 * Per docs/v2-direction.md §6 Step 5 and docs/v2-substrate.md §6a,
 * this is the Step 5 entry point. The `--adapter` flag picks one
 * of four named harnesses:
 *
 *   dry-harness      — seam-proof (rung 1). Default.
 *   fixture-replay   — shape + hook substrate (rung 2).
 *   playwright-live  — real Chromium + synthetic substrate (rung 3).
 *   production       — live customer tenant (rung 4; pending Step 10).
 *
 * The synchronous three adapters (dry-harness, fixture-replay) route
 * through `createProbeHarnessForAdapter`. The scoped adapters
 * (playwright-live) route through their own runners that manage
 * server + browser acquire-release via Effect.scoped.
 */

import { Effect, Layer } from 'effect';
import path from 'node:path';
import { deriveProbesFromDisk } from '../../probe-derivation/derive-probes';
import { ProbeHarness } from '../../probe-derivation/probe-harness';
import { createProbeHarnessForAdapter } from '../../probe-derivation/adapter-factory';
import { runSpike } from '../../probe-derivation/spike-harness';
import { runPlaywrightLiveSpike } from '../../probe-derivation/playwright-live-harness';
import { emitProbeReceiptsToFilesystem } from '../../probe-derivation/receipt-emitter';
import { createCommandSpec } from '../../../product/cli/shared';

export const probeSpikeCommand = createCommandSpec({
  flags: ['--adapter', '--emit-receipts', '--hypothesis-id'] as const,
  parse: (context) => ({
    command: 'probe-spike',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const { manifest, derivation } = deriveProbesFromDisk(paths.rootDir);
      const adapter = context.flags.adapter ?? 'dry-harness';
      const emission = {
        emitReceipts: context.flags.emitReceipts === true,
        hypothesisId: context.flags.hypothesisId,
      } as const;
      const logDir = path.join(paths.rootDir, 'workshop', 'logs');

      return Effect.gen(function* () {
        let verdict;
        if (adapter === 'playwright-live') {
          verdict = yield* runPlaywrightLiveSpike({
            rootDir: paths.rootDir,
            manifest,
            derivation,
          });
        } else {
          const harness = createProbeHarnessForAdapter(adapter);
          verdict = yield* runSpike({ manifest, derivation }).pipe(
            Effect.provide(Layer.succeed(ProbeHarness, harness)),
          );
        }
        if (emission.emitReceipts) {
          yield* emitProbeReceiptsToFilesystem({
            logDir,
            receipts: verdict.receipts,
            hypothesisId: emission.hypothesisId,
          });
        }
        return {
          ...verdict,
          receiptsEmittedTo: emission.emitReceipts ? logDir : null,
          hypothesisId: emission.emitReceipts ? (emission.hypothesisId ?? null) : null,
        };
      });
    },
  }),
});


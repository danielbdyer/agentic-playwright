/**
 * `tesseract probe-spike` — runs the Probe IR spike end-to-end.
 *
 * Per docs/v2-direction.md §6 Step 5 and docs/v2-substrate.md §6a,
 * this is the Step 5 entry point: walk manifest, load fixtures,
 * derive probes, execute through the injected harness, summarize
 * the coverage verdict.
 *
 * At Step 5 entry the default harness is the dry-harness — receipts
 * confirm trivially. The `--adapter` flag picks one of four named
 * harnesses; dry-harness is the default and is what ships today.
 * The three substrate-backed adapters (fixture-replay, playwright-
 * live, production) are named in the flag enum for forward-
 * compatibility but only fixture-replay is landing in Step 5.5;
 * the other two are Step 6+ work.
 *
 * The command is workshop-scoped — it lives in workshop/cli/
 * commands/ and composes into the merged CLI registry at
 * bin/cli-registry.ts.
 */

import { Effect, Layer } from 'effect';
import { deriveProbesFromDisk } from '../../probe-derivation/derive-probes';
import { ProbeHarness } from '../../probe-derivation/probe-harness';
import { createProbeHarnessForAdapter } from '../../probe-derivation/adapter-factory';
import { runSpike } from '../../probe-derivation/spike-harness';
import { createCommandSpec } from '../../../product/cli/shared';

export const probeSpikeCommand = createCommandSpec({
  flags: ['--adapter'] as const,
  parse: (context) => ({
    command: 'probe-spike',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const { manifest, derivation } = deriveProbesFromDisk(paths.rootDir);
      const adapter = context.flags.adapter ?? 'dry-harness';
      const harness = createProbeHarnessForAdapter(adapter);
      return runSpike({ manifest, derivation }).pipe(
        Effect.provide(Layer.succeed(ProbeHarness, harness)),
      );
    },
  }),
});

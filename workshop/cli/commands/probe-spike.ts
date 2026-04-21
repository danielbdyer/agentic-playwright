/**
 * `tesseract probe-spike` — runs the Probe IR spike end-to-end.
 *
 * Per docs/v2-direction.md §6 Step 5 and docs/v2-substrate.md §6a,
 * this is the Step 5 entry point: walk manifest, load fixtures,
 * derive probes, execute through the injected harness, summarize
 * the coverage verdict.
 *
 * At Step 5 entry the default harness is the dry-harness — receipts
 * confirm trivially. When substrate-backed harnesses land at Step 6+
 * (fixture-replay, playwright-live), CLI flags will pick them;
 * today the command runs one-shot against the manifest under
 * `product/manifest/manifest.json` and prints the verdict as JSON.
 *
 * The command is workshop-scoped — it lives in workshop/cli/
 * commands/ and composes into the merged CLI registry at
 * bin/cli-registry.ts.
 */

import { Effect, Layer } from 'effect';
import { deriveProbesFromDisk } from '../../probe-derivation/derive-probes';
import {
  ProbeHarness,
  createDryProbeHarness,
} from '../../probe-derivation/probe-harness';
import { runSpike } from '../../probe-derivation/spike-harness';
import { createCommandSpec } from '../../../product/cli/shared';

export const probeSpikeCommand = createCommandSpec({
  flags: [],
  parse: () => ({
    command: 'probe-spike',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => {
      const { manifest, derivation } = deriveProbesFromDisk(paths.rootDir);
      const harness = createDryProbeHarness();
      return runSpike({ manifest, derivation }).pipe(
        Effect.provide(Layer.succeed(ProbeHarness, harness)),
      );
    },
  }),
});

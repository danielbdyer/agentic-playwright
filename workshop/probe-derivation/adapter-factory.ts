/**
 * ProbeHarness adapter factory — maps a `ProbeAdapter` CLI flag
 * value to a `ProbeHarnessService` instance.
 *
 * Per `docs/v2-probe-ir-spike.md §6`, four adapters live on the
 * substrate ladder (dry-harness → fixture-replay → playwright-live
 * → production). The spike's Step 5.5 deliverable is fixture-
 * replay; playwright-live and production are named in the union
 * for forward-compatibility but do not have implementations yet.
 *
 * Adapter selection is a pure `switch` over the `ProbeAdapter`
 * enum. Adding a value to the enum without adding its case here
 * is a typecheck error by design — the `_exhaustive: never`
 * assertion at the bottom of the switch enforces it.
 *
 * Scope today: scope 3a of the Step 5.5 work ships only the
 * `'dry-harness'` branch; the others throw a clear "pending"
 * error with the step pointer. Scope 3c wires the fixture-replay
 * branch to `createFixtureReplayProbeHarness`.
 */

import type { ProbeAdapter } from '../../product/cli/shared';
import type { ProbeHarnessService } from './probe-harness';
import { createDryProbeHarness } from './probe-harness';
import { createFixtureReplayProbeHarness } from './fixture-replay-harness';
import { createDefaultVerbClassifierRegistry } from './classifiers/default-registry';

/** Pick the harness implementation for a given adapter tag. Pure —
 *  adapter-specific IO happens inside each harness's `execute`. */
export function createProbeHarnessForAdapter(
  adapter: ProbeAdapter,
): ProbeHarnessService {
  switch (adapter) {
    case 'dry-harness':
      return createDryProbeHarness();
    case 'fixture-replay':
      return createFixtureReplayProbeHarness({
        registry: createDefaultVerbClassifierRegistry(),
      });
    case 'playwright-live':
      // The playwright-live adapter needs a scoped lifecycle
      // (substrate server + headed browser acquired + released
      // around the spike). The synchronous factory shape cannot
      // express that, so the CLI command routes 'playwright-live'
      // directly to `runPlaywrightLiveSpike` in
      // workshop/probe-derivation/playwright-live-harness.ts.
      // Reaching this branch means a caller is using the factory
      // instead of the spike runner — surface that mistake loudly.
      throw new Error(
        'createProbeHarnessForAdapter: the playwright-live adapter requires a scoped ' +
          'lifecycle; use runPlaywrightLiveSpike directly (see ' +
          'workshop/probe-derivation/playwright-live-harness.ts).',
      );
    case 'production':
      throw new Error(
        'probe-spike --adapter production: pending Step 10. ' +
          'See docs/v2-probe-ir-spike.md §6.3.',
      );
    default: {
      const _exhaustive: never = adapter;
      throw new Error(`createProbeHarnessForAdapter: unknown adapter ${String(_exhaustive)}`);
    }
  }
}

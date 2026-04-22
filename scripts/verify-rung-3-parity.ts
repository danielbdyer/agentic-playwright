/**
 * Rung-3 parity verification — standalone.
 *
 * Runs the probe spike under both rung-1 (dry-harness) and rung-3
 * (playwright-live), diffs the (classification, errorFamily) tuples
 * for probes whose verb has a rung-3 classifier, and exits 0 on
 * parity / 1 on any divergence.
 *
 * Why not a vitest spec: vitest aliases `@playwright/test` to a
 * shim (tests/support/vitest-playwright-shim.ts) that exports the
 * runner API but not `chromium.launch`. The rung-3 path needs a
 * real browser launch, so it runs outside vitest. This script is
 * the alternate entry point.
 *
 * Usage:
 *   npm run verify:rung-3-parity
 *   # or: npx tsx scripts/verify-rung-3-parity.ts
 *
 * Exits:
 *   0  - every rung-3-classified probe agrees across rungs.
 *   1  - divergence (printed to stderr with probe IDs).
 */

import { Effect } from 'effect';
import path from 'node:path';
import { deriveProbesFromDisk } from '../workshop/probe-derivation/derive-probes';
import { createDryProbeHarness } from '../workshop/probe-derivation/probe-harness';
import { runPlaywrightLiveSpike } from '../workshop/probe-derivation/playwright-live-harness';
import { createDefaultRung3ClassifierRegistry } from '../workshop/probe-derivation/classifiers/rung-3/registry';

const REPO_ROOT = path.resolve(__dirname, '..');
const FIXED_TIME = new Date('2026-04-22T12:00:00.000Z');

async function main(): Promise<void> {
  const { manifest, derivation } = deriveProbesFromDisk(REPO_ROOT);
  const rung3Registry = createDefaultRung3ClassifierRegistry();
  const rung3Verbs = new Set(rung3Registry.classifiers.keys());

  const classifiedProbes = derivation.probes.filter((p) => rung3Verbs.has(p.verb));
  process.stdout.write(
    `rung-3 parity: ${classifiedProbes.length} probes across ${rung3Verbs.size} classified verbs ` +
      `(${[...rung3Verbs].sort().join(', ')})\n`,
  );

  // Rung-1 baseline (dry-harness trivially confirms expectations).
  const dry = createDryProbeHarness({ now: () => FIXED_TIME });
  const dryByProbeId = new Map<string, { classification: string; errorFamily: string | null }>();
  for (const probe of classifiedProbes) {
    const receipt = await Effect.runPromise(dry.execute(probe));
    dryByProbeId.set(receipt.payload.probeId, receipt.payload.outcome.observed);
  }

  // Rung 3 — real browser.
  process.stdout.write('rung-3 parity: launching Chromium + substrate server...\n');
  const verdict = await Effect.runPromise(
    runPlaywrightLiveSpike({ rootDir: REPO_ROOT, manifest, derivation }),
  );
  const rung3ByProbeId = new Map<string, { classification: string; errorFamily: string | null }>();
  for (const receipt of verdict.receipts) {
    if (!rung3Verbs.has(receipt.payload.verb)) continue;
    rung3ByProbeId.set(receipt.payload.probeId, receipt.payload.outcome.observed);
  }

  const divergences: string[] = [];
  for (const [probeId, dryOutcome] of dryByProbeId) {
    const rung3Outcome = rung3ByProbeId.get(probeId);
    if (rung3Outcome === undefined) {
      divergences.push(`${probeId}: missing rung-3 receipt`);
      continue;
    }
    if (
      rung3Outcome.classification !== dryOutcome.classification ||
      rung3Outcome.errorFamily !== dryOutcome.errorFamily
    ) {
      divergences.push(
        `${probeId}: dry=${dryOutcome.classification}/${dryOutcome.errorFamily ?? 'null'} ` +
          `rung-3=${rung3Outcome.classification}/${rung3Outcome.errorFamily ?? 'null'}`,
      );
    }
  }

  if (divergences.length === 0) {
    process.stdout.write(
      `rung-3 parity: PASS — ${classifiedProbes.length}/${classifiedProbes.length} probes agree across rungs\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`rung-3 parity: FAIL — ${divergences.length} divergence(s):\n`);
  for (const line of divergences) process.stderr.write(`  ${line}\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`rung-3 parity: error — ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

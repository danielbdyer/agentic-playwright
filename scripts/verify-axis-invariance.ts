/**
 * Axis-invariance verification — the entropy perturbation law.
 *
 * Claim (memo §8.6): rung-3 classifier outcomes are invariant under
 * EntropyProfile perturbation. Running the same probe twice with
 * different entropy seeds produces the same (classification,
 * errorFamily) tuple — only the chrome around the semantic surfaces
 * varies; the axes the classifier reads stay fixed.
 *
 * This script exercises every browser-bound probe (those whose
 * worldSetup carries entropy) under two different seeds and asserts
 * receipt equivalence on the semantic axes.
 *
 * Why not a vitest law: the @playwright/test alias shim blocks
 * dynamic Chromium launches (see scripts/verify-rung-3-parity.ts
 * for the same rationale).
 *
 * Usage:
 *   npm run verify:axis-invariance
 *   # or: npx tsx scripts/verify-axis-invariance.ts
 *
 * Exits:
 *   0 — every probe with entropy produces identical (classification,
 *       errorFamily) under both seeds.
 *   1 — at least one probe diverges. Classifier reads something
 *       entropy perturbs — substrate drift or axis leakage.
 */

import { Effect } from 'effect';
import path from 'node:path';
import { deriveProbesFromDisk } from '../workshop/probe-derivation/derive-probes';
import { runPlaywrightLiveSpike } from '../workshop/probe-derivation/playwright-live-harness';
import type { Probe } from '../workshop/probe-derivation/probe-ir';
import type { ProbeDerivation } from '../workshop/probe-derivation/probe-ir';

const REPO_ROOT = path.resolve(__dirname, '..');

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Stamp a new seed on every browser-bound probe's entropy profile. */
function withSeed(derivation: ProbeDerivation, seed: string): ProbeDerivation {
  const probes: Probe[] = derivation.probes.map((p) => {
    const world = isRecord(p.worldSetup) ? p.worldSetup : null;
    if (world === null) return p;
    const entropy = isRecord(world['entropy']) ? world['entropy'] : null;
    if (entropy === null) return p;
    return {
      ...p,
      worldSetup: {
        ...world,
        entropy: { ...entropy, seed },
      },
    };
  });
  return { ...derivation, probes };
}

async function main(): Promise<void> {
  const { manifest, derivation } = deriveProbesFromDisk(REPO_ROOT);
  const probesWithEntropy = derivation.probes.filter((p) => {
    const world = isRecord(p.worldSetup) ? p.worldSetup : null;
    return world !== null && isRecord(world['entropy']);
  });

  process.stdout.write(
    `axis-invariance: ${probesWithEntropy.length} probes carry entropy profiles ` +
      `across ${new Set(probesWithEntropy.map((p) => p.verb)).size} verbs\n`,
  );

  // Run rung-3 under seed A and seed B.
  process.stdout.write('axis-invariance: running under seed=alpha-swarm...\n');
  const verdictA = await Effect.runPromise(
    runPlaywrightLiveSpike({
      rootDir: REPO_ROOT,
      manifest,
      derivation: withSeed(derivation, 'alpha-swarm'),
    }),
  );

  process.stdout.write('axis-invariance: running under seed=beta-drift...\n');
  const verdictB = await Effect.runPromise(
    runPlaywrightLiveSpike({
      rootDir: REPO_ROOT,
      manifest,
      derivation: withSeed(derivation, 'beta-drift'),
    }),
  );

  const outcomesA = new Map<string, { classification: string; errorFamily: string | null }>();
  for (const r of verdictA.receipts) {
    outcomesA.set(r.payload.probeId, r.payload.outcome.observed);
  }

  const divergences: string[] = [];
  const entropyProbeIds = new Set(probesWithEntropy.map((p) => p.id));
  for (const r of verdictB.receipts) {
    if (!entropyProbeIds.has(r.payload.probeId)) continue;
    const a = outcomesA.get(r.payload.probeId);
    const b = r.payload.outcome.observed;
    if (a === undefined) {
      divergences.push(`${r.payload.probeId}: missing seed-A receipt`);
      continue;
    }
    if (a.classification !== b.classification || a.errorFamily !== b.errorFamily) {
      divergences.push(
        `${r.payload.probeId}: seed-A=${a.classification}/${a.errorFamily ?? 'null'} ` +
          `seed-B=${b.classification}/${b.errorFamily ?? 'null'}`,
      );
    }
  }

  if (divergences.length === 0) {
    process.stdout.write(
      `axis-invariance: PASS — ${entropyProbeIds.size} probes invariant under entropy perturbation\n`,
    );
    process.exit(0);
  }

  process.stderr.write(`axis-invariance: FAIL — ${divergences.length} divergence(s):\n`);
  for (const line of divergences) process.stderr.write(`  ${line}\n`);
  process.exit(1);
}

main().catch((err) => {
  process.stderr.write(`axis-invariance: error — ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});

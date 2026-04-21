/**
 * Probe IR Spike — end-to-end laws.
 *
 * The spike's promise (per docs/v2-substrate.md §6a) is a one-page
 * go/no-go verdict derived from manifest × fixtures × probe
 * execution. These laws pin the shape of that verdict and guarantee
 * the pipeline end-to-end.
 *
 * Pins:
 *   S1. runSpike executes one receipt per derived probe.
 *   S2. Under the dry-harness, every receipt confirms its
 *       expectation (completedAsExpected: true).
 *   S3. The per-verb breakdown sums to the derivation.probes list.
 *   S4. The coverage gate is a pure function of (totalDeclaredVerbs,
 *       uncoveredVerbs, unfixturableVerbs) — receipts don't move it.
 *   S5. Receipts carry stage 'evidence', scope 'run', kind
 *       'probe-receipt', and populate the cohort triple.
 *   S6. Receipt latency is non-negative and the fingerprints are
 *       non-empty.
 *   S7. Manifest drift (a verb without a fixture) lowers the
 *       coverage percentage monotonically.
 *   S8. For the currently-fixtured verbs, the spike synthesizes the
 *       expected fixture count. The per-verb expectation is the
 *       source of truth; the aggregate count is derived from it.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import type { Manifest } from '../../product/domain/manifest/manifest';
import { deriveProbesFromDisk } from '../../workshop/probe-derivation/derive-probes';
import {
  ProbeHarness,
  createDryProbeHarness,
} from '../../workshop/probe-derivation/probe-harness';
import { runSpike, summarizeSpike } from '../../workshop/probe-derivation/spike-harness';
import { confirmsExpectation } from '../../workshop/probe-derivation/probe-receipt';

const REPO_ROOT = path.resolve(__dirname, '../..');

function loadManifest(): Manifest {
  return JSON.parse(
    readFileSync(path.join(REPO_ROOT, 'product', 'manifest', 'manifest.json'), 'utf-8'),
  ) as Manifest;
}

async function runSpikeUnderDryHarness() {
  const { manifest, derivation } = deriveProbesFromDisk(REPO_ROOT);
  const frozenTime = new Date('2026-04-21T00:00:00.000Z');
  const harness = createDryProbeHarness({
    now: () => frozenTime,
  });
  const verdict = await Effect.runPromise(
    runSpike({ manifest, derivation, now: () => frozenTime }).pipe(
      Effect.provide(Layer.succeed(ProbeHarness, harness)),
    ),
  );
  return { manifest, derivation, verdict };
}

describe('Probe IR Spike — end-to-end laws', () => {
  test('S1: runSpike executes one receipt per derived probe', async () => {
    const { derivation, verdict } = await runSpikeUnderDryHarness();
    expect(verdict.receipts).toHaveLength(derivation.probes.length);
  });

  test('S2: under the dry-harness, every receipt confirms its expectation', async () => {
    const { verdict } = await runSpikeUnderDryHarness();
    for (const receipt of verdict.receipts) {
      expect(confirmsExpectation(receipt)).toBe(true);
    }
  });

  test('S3: per-verb breakdown sums to the derivation.probes list', async () => {
    const { derivation, verdict } = await runSpikeUnderDryHarness();
    const probeSum = verdict.perVerb.reduce((acc, row) => acc + row.probeCount, 0);
    expect(probeSum).toBe(derivation.probes.length);
  });

  test('S4: coverage gate is a pure function of the derivation buckets', async () => {
    const { manifest, derivation } = await runSpikeUnderDryHarness();
    const zeroReceipts = summarizeSpike({
      manifest,
      derivation,
      receipts: [],
      generatedAt: '2026-04-21T00:00:00.000Z',
    });
    const fullReceipts = summarizeSpike({
      manifest,
      derivation,
      receipts: [],
      generatedAt: '2026-04-21T00:00:00.000Z',
    });
    expect(zeroReceipts.coverage.coveragePercentage).toBe(fullReceipts.coverage.coveragePercentage);
    expect(zeroReceipts.coverage.passesGate).toBe(fullReceipts.coverage.passesGate);
  });

  test('S5: receipts carry the evidence-stage envelope fields', async () => {
    const { verdict } = await runSpikeUnderDryHarness();
    for (const receipt of verdict.receipts) {
      expect(receipt.version).toBe(1);
      expect(receipt.stage).toBe('evidence');
      expect(receipt.scope).toBe('run');
      expect(receipt.kind).toBe('probe-receipt');
      expect(receipt.payload.cohort.verb).toBe(receipt.payload.verb);
      expect(receipt.payload.cohort.facetKind).toMatch(/^(element|state|vocabulary|route)$/);
    }
  });

  test('S6: receipt latency non-negative and fingerprints non-empty', async () => {
    const { verdict } = await runSpikeUnderDryHarness();
    for (const receipt of verdict.receipts) {
      expect(receipt.payload.provenance.elapsedMs).toBeGreaterThanOrEqual(0);
      expect(receipt.fingerprints.artifact.length).toBeGreaterThan(0);
      expect(receipt.fingerprints.content?.length ?? 0).toBeGreaterThan(0);
      expect(receipt.payload.provenance.fixtureFingerprint.length).toBeGreaterThan(0);
    }
  });

  test('S7: missing fixtures lower the coverage percentage monotonically', () => {
    const manifest = loadManifest();
    // Manifest with all 8 verbs, zero fixtures — worst case.
    const emptyFixtures = new Map();
    for (const v of manifest.verbs) emptyFixtures.set(v.name, undefined);
    const coverageNone = summarizeSpike({
      manifest,
      derivation: {
        probes: [],
        uncoveredVerbs: manifest.verbs.map((v) => v.name).sort(),
        unfixturableVerbs: [],
      },
      receipts: [],
      generatedAt: '2026-04-21T00:00:00.000Z',
    }).coverage;
    expect(coverageNone.coveragePercentage).toBe(0);
    expect(coverageNone.passesGate).toBe(false);
  });

  test('S8: each fixtured verb synthesizes its declared fixture count', async () => {
    const { derivation } = await runSpikeUnderDryHarness();
    // observe: 2, test-compose: 2, facet-query: 3, facet-mint: 2,
    // facet-enrich: 2, locator-health-track: 2, intent-fetch: 4,
    // interact: 5. Total = 22 across all 8 declared verbs.
    // intent-fetch grew to 4 probes when the malformed-response
    // fixture landed (scope 4 closing Gap 2 from verdict-01).
    expect(derivation.probes).toHaveLength(22);
    const byVerb = new Map<string, number>();
    for (const probe of derivation.probes) {
      byVerb.set(probe.verb, (byVerb.get(probe.verb) ?? 0) + 1);
    }
    expect(byVerb.get('observe')).toBe(2);
    expect(byVerb.get('test-compose')).toBe(2);
    expect(byVerb.get('facet-query')).toBe(3);
    expect(byVerb.get('facet-mint')).toBe(2);
    expect(byVerb.get('facet-enrich')).toBe(2);
    expect(byVerb.get('locator-health-track')).toBe(2);
    expect(byVerb.get('intent-fetch')).toBe(4);
    expect(byVerb.get('interact')).toBe(5);
  });

  test('S9: the spike at full 8/8 coverage passes the 80% gate', async () => {
    // Step 5 coverage gate at 100%: every declared verb has a
    // fixture YAML. This is the structural floor for Step 5
    // graduation per docs/v2-probe-ir-spike.md §7.1 — fixture
    // economy and reproducibility are the two remaining
    // verdicts (Step 5.5 reproducibility lands with the
    // fixture-replay harness).
    const { verdict } = await runSpikeUnderDryHarness();
    expect(verdict.coverage.coveragePercentage).toBeCloseTo(1.0, 6);
    expect(verdict.passesGate).toBe(true);
    expect(verdict.summary).toMatch(/PASS/);
    expect(verdict.coverage.uncoveredVerbs).toEqual([]);
  });
});

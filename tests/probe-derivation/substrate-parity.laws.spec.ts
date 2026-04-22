/**
 * Substrate parity laws — the bridge between adjacent substrate
 * rungs on the four-rung ladder of docs/v2-probe-ir-spike.md §8.3.
 *
 * Claim: for every probe whose verb has a registered classifier
 * under rung N, the receipts produced at rung N-1 and rung N agree
 * on the (classification, errorFamily) tuple. This is the invariant-
 * band check from memo §8.6.
 *
 * The invariant is narrow by design:
 *
 *   - Only probes with registered classifiers participate. A probe
 *     whose verb lacks a classifier at rung N returns an ambiguous
 *     receipt and parity is undefined — that's the structural
 *     signal "register the classifier."
 *   - Only the classification + errorFamily axes are compared. The
 *     receipts' fingerprints, latency, timestamps, and adapter tags
 *     legitimately differ across rungs — parity pins what must not
 *     drift, not what must be identical.
 *
 * Pins:
 *   P1. Every probe whose verb has a registered classifier produces
 *       identical (classification, errorFamily) under dry-harness
 *       and fixture-replay. Fail = classifier says one thing,
 *       fixture says another — the spike's core output signal.
 *   P2. The set of verbs that have parity-checked receipts is
 *       exactly the set of verbs registered in the default
 *       classifier registry. (Discipline against forgetting to
 *       exercise a newly-registered classifier in the parity test.)
 *   P3. Reproducibility: re-running both harnesses on the same
 *       fixtures with pinned `now` produces byte-identical receipts
 *       on each side. Memo §7 graduation metric 3.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import path from 'node:path';
import { deriveProbesFromDisk } from '../../workshop/probe-derivation/derive-probes';
import { createDryProbeHarness } from '../../workshop/probe-derivation/probe-harness';
import { createFixtureReplayProbeHarness } from '../../workshop/probe-derivation/fixture-replay-harness';
import { createDefaultVerbClassifierRegistry } from '../../workshop/probe-derivation/classifiers/default-registry';

const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXED_TIME = new Date('2026-04-21T12:00:00.000Z');

async function runBothHarnesses() {
  const { derivation } = deriveProbesFromDisk(REPO_ROOT);
  const registry = createDefaultVerbClassifierRegistry();
  const dry = createDryProbeHarness({ now: () => FIXED_TIME });
  const replay = createFixtureReplayProbeHarness({
    registry,
    now: () => FIXED_TIME,
  });

  const classifiedVerbs = new Set(registry.classifiers.keys());
  const classifiedProbes = derivation.probes.filter((p) => classifiedVerbs.has(p.verb));

  const dryReceipts = await Promise.all(
    classifiedProbes.map((p) => Effect.runPromise(dry.execute(p))),
  );
  const replayReceipts = await Promise.all(
    classifiedProbes.map((p) => Effect.runPromise(replay.execute(p))),
  );

  return { classifiedVerbs, classifiedProbes, dryReceipts, replayReceipts };
}

describe('substrate parity laws (dry-harness ↔ fixture-replay)', () => {
  test('P1: classified probes have identical classification + errorFamily across rungs', async () => {
    const { classifiedProbes, dryReceipts, replayReceipts } = await runBothHarnesses();
    expect(dryReceipts).toHaveLength(classifiedProbes.length);
    expect(replayReceipts).toHaveLength(classifiedProbes.length);

    for (let i = 0; i < classifiedProbes.length; i++) {
      const probe = classifiedProbes[i]!;
      const dry = dryReceipts[i]!;
      const replay = replayReceipts[i]!;
      expect(dry.payload.outcome.observed.classification).toBe(
        replay.payload.outcome.observed.classification,
      );
      expect(dry.payload.outcome.observed.errorFamily).toBe(
        replay.payload.outcome.observed.errorFamily,
      );
      // And for fully-classified probes, both must confirm the
      // fixture's expectation (parity plus expectation-alignment
      // is what makes a Step-5.5 classifier "working").
      expect(dry.payload.outcome.completedAsExpected).toBe(true);
      expect(replay.payload.outcome.completedAsExpected).toBe(true);
      // Sanity: the probe is tagged against the verb we expect.
      expect(dry.payload.verb).toBe(probe.verb);
      expect(replay.payload.verb).toBe(probe.verb);
    }
  });

  test('P2: the parity set equals the registered classifier set', async () => {
    const { classifiedVerbs } = await runBothHarnesses();
    // The registered classifier set grows as each verb gains a
    // shape-level (or higher-rung) classifier. Updating this
    // assertion is a deliberate gesture — new entry means new
    // probes exercised under both harnesses. Prevents silent
    // drift where a classifier ships without the parity check
    // covering it.
    expect([...classifiedVerbs].sort()).toEqual([
      'facet-enrich',
      'facet-mint',
      'facet-query',
      'interact',
      'locator-health-track',
      'observe',
      'test-compose',
    ]);
  });

  test('P3: reproducibility — two runs produce byte-identical receipts on each side', async () => {
    const first = await runBothHarnesses();
    const second = await runBothHarnesses();
    expect(JSON.stringify(first.dryReceipts)).toEqual(JSON.stringify(second.dryReceipts));
    expect(JSON.stringify(first.replayReceipts)).toEqual(JSON.stringify(second.replayReceipts));
  });
});

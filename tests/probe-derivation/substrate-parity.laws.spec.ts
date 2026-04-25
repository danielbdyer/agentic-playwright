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
import {
  checkRungParity,
  checkToleranceBound,
} from '../../workshop/probe-derivation/check-rung-parity';
import { parityFailureRecord } from '../../workshop/probe-derivation/parity-failure';
import { asFingerprint } from '../../product/domain/kernel/hash';

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
      'intent-fetch',
      'interact',
      'locator-health-track',
      'navigate',
      'observe',
      'test-compose',
    ]);
    // 9/9 classifier coverage — navigate added at T8.
    expect(classifiedVerbs.size).toBe(9);
  });

  test('P3: reproducibility — two runs produce byte-identical receipts on each side', async () => {
    const first = await runBothHarnesses();
    const second = await runBothHarnesses();
    expect(JSON.stringify(first.dryReceipts)).toEqual(JSON.stringify(second.dryReceipts));
    expect(JSON.stringify(first.replayReceipts)).toEqual(JSON.stringify(second.replayReceipts));
  });

  test('L-DryReplay-Parity: checkRungParity returns null for every classified probe at dry ↔ replay', async () => {
    // The formal Z11g.b law: invariantContent-based parity check
    // across every probe whose verb has a registered classifier.
    // P1 asserts the axes match by value; this test pushes it
    // through the pure parity checker so the engine's null/record
    // contract is exercised end-to-end.
    const { classifiedProbes, dryReceipts, replayReceipts } = await runBothHarnesses();
    for (let i = 0; i < classifiedProbes.length; i++) {
      const failure = checkRungParity({
        lower: dryReceipts[i]!,
        higher: replayReceipts[i]!,
        now: () => FIXED_TIME,
      });
      expect(
        failure,
        `parity should hold for probe ${dryReceipts[i]!.payload.probeId}; got ${JSON.stringify(failure)}`,
      ).toBeNull();
    }
  });

  test('L-Parity-Failure-Provenance: synthesized mismatch produces a record carrying both fingerprints + named axis', async () => {
    // Construct a synthetic divergence by mutating one receipt's
    // observed classification; confirm the checker emits the right
    // shape. No real-world rung disagrees today, so this is the
    // construction-level law — the record must always carry the
    // post-hoc-audit payload the plan §9.2 requires.
    const { dryReceipts, replayReceipts } = await runBothHarnesses();
    const dry = dryReceipts[0]!;
    const replay = replayReceipts[0]!;
    // Synthesize a divergent "higher" receipt by flipping the
    // observed classification. We use the real receipt's shape
    // plus a mutated observed axis + recomputed invariantContent
    // (via the real probe-receipt constructor is heavier than we
    // need; we just mutate the payload in place for this law).
    const divergent = {
      ...replay,
      payload: {
        ...replay.payload,
        outcome: {
          ...replay.payload.outcome,
          observed: {
            classification: 'failed' as const,
            errorFamily: 'unavailable' as string | null,
          },
        },
        provenance: {
          ...replay.payload.provenance,
          invariantContent: asFingerprint('probe-receipt-invariant', 'synthetic-divergent'),
        },
      },
    };
    const failure = checkRungParity({
      lower: dry,
      higher: divergent,
      now: () => FIXED_TIME,
    });
    expect(failure).not.toBeNull();
    expect(failure!.payload.rungPair).toEqual(['dry-harness', 'fixture-replay']);
    expect(failure!.payload.probeId).toBe(dry.payload.probeId);
    expect(failure!.payload.substrateVersion).toBe(dry.payload.provenance.substrateVersion);
    expect(failure!.payload.divergence.axis).toBe('classification');
    expect(failure!.payload.observedFingerprints).toEqual([
      dry.payload.provenance.invariantContent,
      divergent.payload.provenance.invariantContent,
    ]);
    // Envelope discipline: stage, kind, governance.
    expect(failure!.stage).toBe('evidence');
    expect(failure!.kind).toBe('parity-failure');
    expect(failure!.governance).toBe('approved');
    expect(failure!.fingerprints.artifact.length).toBeGreaterThan(0);
    expect(failure!.fingerprints.content.length).toBeGreaterThan(0);
  });

  test('L-Tolerance-Bound: checkToleranceBound applies default 100× ratio + edge-case semantics', () => {
    // Pure function; exercised directly. The default bound is
    // upper/lower ≤ 100 per plan §5.3. Edge cases: either value
    // 0 returns true (the check is degenerate when one substrate
    // does no work — e.g., dry harness).
    expect(checkToleranceBound({ lowerElapsedMs: 0, higherElapsedMs: 0 })).toBe(true);
    expect(checkToleranceBound({ lowerElapsedMs: 0, higherElapsedMs: 500 })).toBe(true);
    expect(checkToleranceBound({ lowerElapsedMs: 5, higherElapsedMs: 0 })).toBe(true);
    expect(checkToleranceBound({ lowerElapsedMs: 1, higherElapsedMs: 100 })).toBe(true);
    expect(checkToleranceBound({ lowerElapsedMs: 1, higherElapsedMs: 101 })).toBe(false);
    expect(checkToleranceBound({ lowerElapsedMs: 10, higherElapsedMs: 10 })).toBe(true);
    expect(checkToleranceBound({ lowerElapsedMs: 500, higherElapsedMs: 1 })).toBe(false);
    expect(checkToleranceBound({ lowerElapsedMs: 50, higherElapsedMs: 1 })).toBe(true);
    // Custom ratio override.
    expect(
      checkToleranceBound({ lowerElapsedMs: 2, higherElapsedMs: 10, maxRatio: 5 }),
    ).toBe(true);
    expect(
      checkToleranceBound({ lowerElapsedMs: 2, higherElapsedMs: 11, maxRatio: 5 }),
    ).toBe(false);
  });

  test('parity-checker precondition: cross-probe or cross-substrate-version comparisons throw', async () => {
    const { dryReceipts, replayReceipts } = await runBothHarnesses();
    const a = dryReceipts[0]!;
    const b = replayReceipts[1]!; // different probe
    expect(() =>
      checkRungParity({ lower: a, higher: b, now: () => FIXED_TIME }),
    ).toThrow(/probeId mismatch/);
    // Substrate-version mismatch
    const c = {
      ...replayReceipts[0]!,
      payload: {
        ...replayReceipts[0]!.payload,
        provenance: {
          ...replayReceipts[0]!.payload.provenance,
          substrateVersion: '99.9.9',
        },
      },
    };
    expect(() =>
      checkRungParity({ lower: a, higher: c, now: () => FIXED_TIME }),
    ).toThrow(/substrateVersion mismatch/);
  });
});

describe('parityFailureRecord constructor (Z11g.b)', () => {
  test('fingerprints are deterministic for identical payload', () => {
    const payload = {
      probeId: 'probe:observe:visible-button',
      fixtureRef: { verb: 'observe', fixtureName: 'visible-button' },
      substrateVersion: '1.0.0',
      rungPair: ['dry-harness', 'fixture-replay'] as const,
      divergence: {
        axis: 'classification' as const,
        lowerRungValue: 'matched' as string | null,
        higherRungValue: 'failed' as string | null,
      },
      detectedAt: '2026-04-24T12:00:00.000Z',
      observedFingerprints: [
        asFingerprint('probe-receipt-invariant', 'a'),
        asFingerprint('probe-receipt-invariant', 'b'),
      ] as const,
    };
    const first = parityFailureRecord(payload);
    const second = parityFailureRecord(payload);
    expect(second.fingerprints.artifact).toBe(first.fingerprints.artifact);
    expect(second.fingerprints.content).toBe(first.fingerprints.content);
  });
});

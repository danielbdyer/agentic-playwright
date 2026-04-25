/**
 * ProbeReceipt invariance + reproducibility laws (Z11g.a).
 *
 * Pin the contract the substrate-ladder plan commits to at
 * `docs/v2-substrate-ladder-plan.md §§5.1, 9.1`:
 *
 *   L-Dry-BIR (byte-identical reproducibility):
 *     Three consecutive `runSpike(F)` invocations against the
 *     dry harness with an injected deterministic `now` yield
 *     identical `fingerprints.content` AND identical
 *     `provenance.invariantContent` for every receipt.
 *
 *   L-Invariant-Content-Pure:
 *     `computeInvariantContent` is a pure function of its five
 *     inputs: (probeId, observedClassification, observedErrorFamily,
 *     fixtureFingerprint, substrateVersion). Varying any one of
 *     those inputs changes the fingerprint; varying no
 *     invariant-band input leaves the fingerprint unchanged;
 *     variant-band fields (elapsedMs, adapter, startedAt,
 *     completedAt, manifestVersion) do not contribute to the
 *     fingerprint at all — a receipt constructed through
 *     `probeReceipt` with those fields varying yields the same
 *     `provenance.invariantContent`.
 *
 *   L-Invariant-Content-Total:
 *     Every ProbeReceipt produced by any harness carries a
 *     non-empty `provenance.invariantContent`.
 *
 * These are the rung-1 pre-conditions the cross-rung parity laws
 * of Z11g.b will build on (`docs/v2-substrate-ladder-plan.md §9.2`).
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import path from 'node:path';
import { deriveProbesFromDisk } from '../../workshop/probe-derivation/derive-probes';
import { createDryProbeHarness } from '../../workshop/probe-derivation/probe-harness';
import { createFixtureReplayProbeHarness } from '../../workshop/probe-derivation/fixture-replay-harness';
import { createDefaultVerbClassifierRegistry } from '../../workshop/probe-derivation/classifiers/default-registry';
import {
  computeInvariantContent,
  probeReceipt,
} from '../../workshop/probe-derivation/probe-receipt';
import { asFingerprint } from '../../product/domain/kernel/hash';
import type { ProbeSurfaceCohort } from '../../workshop/metrics/probe-surface-cohort';

const REPO_ROOT = path.resolve(__dirname, '../..');
const FIXED_TIME = new Date('2026-04-24T12:00:00.000Z');

async function runDryOnce() {
  const { derivation } = deriveProbesFromDisk(REPO_ROOT);
  const dry = createDryProbeHarness({ now: () => FIXED_TIME });
  return Promise.all(derivation.probes.map((p) => Effect.runPromise(dry.execute(p))));
}

async function runReplayOnce() {
  const { derivation } = deriveProbesFromDisk(REPO_ROOT);
  const registry = createDefaultVerbClassifierRegistry();
  const replay = createFixtureReplayProbeHarness({
    registry,
    now: () => FIXED_TIME,
  });
  const classifiedVerbs = new Set(registry.classifiers.keys());
  const classifiedProbes = derivation.probes.filter((p) => classifiedVerbs.has(p.verb));
  return Promise.all(classifiedProbes.map((p) => Effect.runPromise(replay.execute(p))));
}

describe('probe-receipt laws (Z11g.a)', () => {
  test('L-Dry-BIR: three consecutive dry runs produce identical content + invariantContent per receipt', async () => {
    const [first, second, third] = await Promise.all([
      runDryOnce(),
      runDryOnce(),
      runDryOnce(),
    ]);
    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(first.length);
    expect(third).toHaveLength(first.length);
    for (let i = 0; i < first.length; i++) {
      const a = first[i]!;
      const b = second[i]!;
      const c = third[i]!;
      // Envelope-level content fingerprint: byte-identical.
      expect(b.fingerprints.content).toBe(a.fingerprints.content);
      expect(c.fingerprints.content).toBe(a.fingerprints.content);
      // Provenance-level invariant-band sub-fingerprint: byte-identical.
      expect(b.payload.provenance.invariantContent).toBe(
        a.payload.provenance.invariantContent,
      );
      expect(c.payload.provenance.invariantContent).toBe(
        a.payload.provenance.invariantContent,
      );
    }
  });

  test('L-Invariant-Content-Pure (a): same five inputs yield the same fingerprint', () => {
    const inputs = {
      probeId: 'probe:observe:visible-button',
      observedClassification: 'matched' as const,
      observedErrorFamily: null as string | null,
      fixtureFingerprint: asFingerprint('content', 'fixture-fp-42'),
      substrateVersion: '1.2.3',
    };
    const first = computeInvariantContent(inputs);
    const second = computeInvariantContent({ ...inputs });
    expect(second).toBe(first);
  });

  test('L-Invariant-Content-Pure (b): varying each invariant-band input changes the fingerprint', () => {
    const base = {
      probeId: 'probe:observe:visible-button',
      observedClassification: 'matched' as const,
      observedErrorFamily: null as string | null,
      fixtureFingerprint: asFingerprint('content', 'fixture-fp-42'),
      substrateVersion: '1.2.3',
    };
    const baseline = computeInvariantContent(base);
    // probeId
    expect(computeInvariantContent({ ...base, probeId: 'probe:observe:hidden-button' })).not.toBe(
      baseline,
    );
    // observedClassification
    expect(
      computeInvariantContent({ ...base, observedClassification: 'failed' }),
    ).not.toBe(baseline);
    // observedErrorFamily
    expect(computeInvariantContent({ ...base, observedErrorFamily: 'rate-limited' })).not.toBe(
      baseline,
    );
    // fixtureFingerprint
    expect(
      computeInvariantContent({
        ...base,
        fixtureFingerprint: asFingerprint('content', 'fixture-fp-99'),
      }),
    ).not.toBe(baseline);
    // substrateVersion
    expect(computeInvariantContent({ ...base, substrateVersion: '2.0.0' })).not.toBe(
      baseline,
    );
  });

  test('L-Invariant-Content-Pure (c): variant-band field changes do not affect invariantContent', () => {
    // Construct two ProbeReceipts that differ only on variant-band
    // axes (adapter, startedAt, completedAt, elapsedMs,
    // manifestVersion). Their invariantContent fingerprints must
    // be identical.
    const cohort: ProbeSurfaceCohort = {
      verb: 'observe',
      facetKind: 'widget',
      errorFamily: null,
    };
    const commonInput = {
      probeId: 'probe:observe:visible-button',
      verb: 'observe',
      fixtureName: 'visible-button',
      cohort,
      expected: { classification: 'matched' as const, errorFamily: null as string | null },
      observed: { classification: 'matched' as const, errorFamily: null as string | null },
      runRecordRef: null,
      hypothesisId: null,
      artifactFingerprint: asFingerprint('artifact', 'artifact-a'),
      contentFingerprint: asFingerprint('content', 'content-a'),
    };
    const left = probeReceipt({
      ...commonInput,
      provenance: {
        adapter: 'dry-harness',
        manifestVersion: 1,
        substrateVersion: '1.2.3',
        fixtureFingerprint: asFingerprint('content', 'fixture-fp-42'),
        startedAt: '2026-04-24T12:00:00.000Z',
        completedAt: '2026-04-24T12:00:00.000Z',
        elapsedMs: 0,
      },
    });
    const right = probeReceipt({
      ...commonInput,
      artifactFingerprint: asFingerprint('artifact', 'artifact-b'),
      contentFingerprint: asFingerprint('content', 'content-b'),
      provenance: {
        adapter: 'fixture-replay',
        manifestVersion: 2,
        substrateVersion: '1.2.3', // same substrate version → same invariant
        fixtureFingerprint: asFingerprint('content', 'fixture-fp-42'),
        startedAt: '2030-11-01T00:00:00.000Z',
        completedAt: '2030-11-01T00:00:05.423Z',
        elapsedMs: 5423,
      },
    });
    expect(left.payload.provenance.invariantContent).toBe(
      right.payload.provenance.invariantContent,
    );
  });

  test('L-Invariant-Content-Total: every receipt from dry + fixture-replay carries a non-empty invariantContent', async () => {
    const dry = await runDryOnce();
    const replay = await runReplayOnce();
    for (const r of dry) {
      expect(r.payload.provenance.invariantContent).toMatch(/^[0-9a-f]+$/);
      expect(r.payload.provenance.invariantContent.length).toBeGreaterThan(0);
    }
    for (const r of replay) {
      expect(r.payload.provenance.invariantContent).toMatch(/^[0-9a-f]+$/);
      expect(r.payload.provenance.invariantContent.length).toBeGreaterThan(0);
    }
  });
});

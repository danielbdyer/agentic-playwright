/**
 * FixtureReplayProbeHarness — structural laws.
 *
 * Pins the behavior of the substrate-backed harness under two
 * regimes: verb-with-classifier and verb-without-classifier.
 *
 * Pins:
 *   F1. A probe whose verb has NO registered classifier produces a
 *       receipt with observed.classification === 'ambiguous' and
 *       errorFamily === null. The adapter tag is 'fixture-replay'.
 *   F2. A probe whose verb HAS a registered classifier delegates —
 *       the receipt's observed matches exactly what the classifier
 *       returned.
 *   F3. completedAsExpected is the two-axis join — it equals
 *       (expected.classification === observed.classification) AND
 *       (expected.errorFamily === observed.errorFamily). No other
 *       semantics.
 *   F4. Latency non-negative; fingerprints non-empty; cohort's
 *       facetKind is drawn from input.surface.facet-kind or
 *       input.facet-kind or defaults to 'element'.
 *   F5. Reproducibility — with pinned `now`, two runs over the
 *       same probe and the same registry produce byte-identical
 *       receipts. (Memo §7 graduation metric 3.)
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import type { Probe } from '../../workshop/probe-derivation/probe-ir';
import { createFixtureReplayProbeHarness } from '../../workshop/probe-derivation/fixture-replay-harness';
import {
  EMPTY_CLASSIFIER_REGISTRY,
  verbClassifierRegistry,
  type VerbClassifier,
} from '../../workshop/probe-derivation/verb-classifier';

const FIXED_TIME = new Date('2026-04-21T12:00:00.000Z');

function sampleProbe(overrides: Partial<Probe> = {}): Probe {
  return {
    id: 'probe:observe:sample',
    verb: 'observe',
    fixtureName: 'sample',
    declaredIn: 'product/instruments/observation/observe.probe.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input: { surface: { 'facet-kind': 'element' } },
    worldSetup: undefined,
    exercises: [],
    ...overrides,
  };
}

describe('FixtureReplayProbeHarness — structural laws', () => {
  test('F1: unregistered verb → observed is ambiguous/null', async () => {
    const harness = createFixtureReplayProbeHarness({
      registry: EMPTY_CLASSIFIER_REGISTRY,
      now: () => FIXED_TIME,
    });
    const receipt = await Effect.runPromise(harness.execute(sampleProbe()));
    expect(receipt.payload.outcome.observed.classification).toBe('ambiguous');
    expect(receipt.payload.outcome.observed.errorFamily).toBeNull();
    expect(receipt.payload.provenance.adapter).toBe('fixture-replay');
    // Fixture expected 'matched'; observed 'ambiguous' → not confirmed.
    expect(receipt.payload.outcome.completedAsExpected).toBe(false);
  });

  test('F2: registered classifier drives the observed outcome', async () => {
    const observeClassifier: VerbClassifier = {
      verb: 'observe',
      classify: () =>
        Effect.succeed({ classification: 'matched' as const, errorFamily: null }),
    };
    const harness = createFixtureReplayProbeHarness({
      registry: verbClassifierRegistry([observeClassifier]),
      now: () => FIXED_TIME,
    });
    const receipt = await Effect.runPromise(harness.execute(sampleProbe()));
    expect(receipt.payload.outcome.observed.classification).toBe('matched');
    expect(receipt.payload.outcome.observed.errorFamily).toBeNull();
    expect(receipt.payload.outcome.completedAsExpected).toBe(true);
  });

  test('F3: completedAsExpected is a two-axis join', async () => {
    // Classifier reports 'matched' but fixture expected 'failed'.
    const classifier: VerbClassifier = {
      verb: 'observe',
      classify: () =>
        Effect.succeed({ classification: 'matched' as const, errorFamily: null }),
    };
    const harness = createFixtureReplayProbeHarness({
      registry: verbClassifierRegistry([classifier]),
      now: () => FIXED_TIME,
    });
    const receipt = await Effect.runPromise(
      harness.execute(
        sampleProbe({
          expected: { classification: 'failed', errorFamily: 'not-visible' },
        }),
      ),
    );
    expect(receipt.payload.outcome.completedAsExpected).toBe(false);
  });

  test('F4: envelope shape and non-negative latency', async () => {
    const harness = createFixtureReplayProbeHarness({
      registry: EMPTY_CLASSIFIER_REGISTRY,
      now: () => FIXED_TIME,
    });
    const receipt = await Effect.runPromise(harness.execute(sampleProbe()));
    expect(receipt.stage).toBe('evidence');
    expect(receipt.scope).toBe('run');
    expect(receipt.kind).toBe('probe-receipt');
    expect(receipt.payload.provenance.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(receipt.fingerprints.artifact.length).toBeGreaterThan(0);
    expect(receipt.fingerprints.content?.length ?? 0).toBeGreaterThan(0);
    expect(receipt.payload.cohort.facetKind).toBe('element');
  });

  test('F5: reproducibility — two runs produce byte-identical receipts', async () => {
    const classifier: VerbClassifier = {
      verb: 'observe',
      classify: () =>
        Effect.succeed({ classification: 'matched' as const, errorFamily: null }),
    };
    const harness = createFixtureReplayProbeHarness({
      registry: verbClassifierRegistry([classifier]),
      now: () => FIXED_TIME,
    });
    const first = await Effect.runPromise(harness.execute(sampleProbe()));
    const second = await Effect.runPromise(harness.execute(sampleProbe()));
    expect(JSON.stringify(first)).toEqual(JSON.stringify(second));
  });
});

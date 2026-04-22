/**
 * facet-enrich classifier — laws.
 *
 * Pins:
 *   E1. Valid shape + no hook → matched/null.
 *   E2. Valid shape + world-setup.facet-missing=true → failed/assertion-like.
 *   E3. Missing evidence field → failed/unclassified.
 *   E4. Non-object input → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { facetEnrichClassifier } from '../../../workshop/probe-derivation/classifiers/facet-enrich';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, worldSetup: unknown = undefined): Probe {
  return {
    id: 'probe:facet-enrich:x',
    verb: 'facet-enrich',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup,
    exercises: [],
  };
}

const run = (input: unknown, worldSetup?: unknown) =>
  Effect.runPromise(facetEnrichClassifier.classify(probe(input, worldSetup)));
const VALID_INPUT = {
  'facet-kind': 'element',
  'facet-id': 'ns:foo',
  evidence: { kind: 'alias-observed', phrase: 'Foo' },
};

describe('facet-enrich classifier laws', () => {
  test('E1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('E2: valid shape + facet-missing hook → failed/assertion-like', async () => {
    expect(await run(VALID_INPUT, { 'facet-missing': true })).toEqual({
      classification: 'failed',
      errorFamily: 'assertion-like',
    });
  });

  test('E3: missing evidence → failed/unclassified', async () => {
    expect(
      await run({ 'facet-kind': 'element', 'facet-id': 'ns:foo' }),
    ).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });

  test('E4: non-object input → failed/unclassified', async () => {
    expect(await run(42)).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

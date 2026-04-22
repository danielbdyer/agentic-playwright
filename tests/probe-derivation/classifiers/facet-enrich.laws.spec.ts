/**
 * facet-enrich classifier — laws (first-principles revision).
 *
 *   E1. Valid shape + no catalog hook → matched.
 *   E2. Valid shape + world.catalog.facet-missing=true
 *       → failed/assertion-like.
 *   E3. Missing evidence → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { facetEnrichClassifier } from '../../../workshop/probe-derivation/classifiers/facet-enrich';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, world: unknown = undefined): Probe {
  return {
    id: 'probe:facet-enrich:x',
    verb: 'facet-enrich',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: world,
    exercises: [],
  };
}

const run = (input: unknown, world?: unknown) =>
  Effect.runPromise(facetEnrichClassifier.classify(probe(input, world)));

const VALID_INPUT = {
  'facet-kind': 'element',
  'facet-id': 'ns:foo',
  evidence: { kind: 'alias-observed', phrase: 'Foo' },
};

describe('facet-enrich classifier laws', () => {
  test('E1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('E2: catalog.facet-missing → assertion-like', async () => {
    expect(await run(VALID_INPUT, { catalog: { 'facet-missing': true } })).toEqual({
      classification: 'failed',
      errorFamily: 'assertion-like',
    });
  });

  test('E3: missing evidence → failed/unclassified', async () => {
    expect(
      await run({ 'facet-kind': 'element', 'facet-id': 'ns:foo' }),
    ).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });
});

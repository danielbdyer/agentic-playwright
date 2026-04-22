/**
 * facet-mint classifier — laws.
 *
 * Pins:
 *   M1. Valid shape + no hook → matched/null.
 *   M2. Valid shape + world-setup.id-collision=true → failed/assertion-like.
 *   M3. Missing a required field → failed/unclassified.
 *   M4. Non-object input → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { facetMintClassifier } from '../../../workshop/probe-derivation/classifiers/facet-mint';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, worldSetup: unknown = undefined): Probe {
  return {
    id: 'probe:facet-mint:x',
    verb: 'facet-mint',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup,
    exercises: [],
  };
}

const run = (input: unknown, worldSetup?: unknown) =>
  Effect.runPromise(facetMintClassifier.classify(probe(input, worldSetup)));
const VALID_INPUT = {
  'facet-kind': 'element',
  'stable-id': 'ns:foo',
  'display-name': 'Foo',
  'minting-instrument': 'agent-observation',
};

describe('facet-mint classifier laws', () => {
  test('M1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('M2: valid shape + id-collision hook → failed/assertion-like', async () => {
    expect(await run(VALID_INPUT, { 'id-collision': true })).toEqual({
      classification: 'failed',
      errorFamily: 'assertion-like',
    });
  });

  test('M3: missing field → failed/unclassified', async () => {
    const { 'stable-id': _, ...partial } = VALID_INPUT;
    expect(await run(partial)).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });

  test('M4: non-object input → failed/unclassified', async () => {
    expect(await run('not an object')).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

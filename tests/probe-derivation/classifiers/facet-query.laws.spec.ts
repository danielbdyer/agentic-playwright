/**
 * facet-query classifier — laws.
 *
 * Pins:
 *   F1. `{ by: 'id', id: string }` → matched/null.
 *   F2. `{ by: 'intent-phrase', phrase: string }` → matched/null.
 *   F3. `{ by: 'kind', kind: string }` → matched/null.
 *   F4. Missing discriminator → failed/unclassified.
 *   F5. Wrong-type selector → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { facetQueryClassifier } from '../../../workshop/probe-derivation/classifiers/facet-query';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown): Probe {
  return {
    id: 'probe:facet-query:x',
    verb: 'facet-query',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: undefined,
    exercises: [],
  };
}

const run = (input: unknown) => Effect.runPromise(facetQueryClassifier.classify(probe(input)));

describe('facet-query classifier laws', () => {
  test('F1: by=id → matched', async () => {
    expect(await run({ by: 'id', id: 'ns:foo' })).toEqual({
      classification: 'matched',
      errorFamily: null,
    });
  });

  test('F2: by=intent-phrase → matched', async () => {
    expect(await run({ by: 'intent-phrase', phrase: 'policy field' })).toEqual({
      classification: 'matched',
      errorFamily: null,
    });
  });

  test('F3: by=kind → matched', async () => {
    expect(await run({ by: 'kind', kind: 'element' })).toEqual({
      classification: 'matched',
      errorFamily: null,
    });
  });

  test('F4: missing discriminator → failed/unclassified', async () => {
    expect(await run({ id: 'ns:foo' })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });

  test('F5: wrong-type selector → failed/unclassified', async () => {
    expect(await run({ by: 'id', id: 42 })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

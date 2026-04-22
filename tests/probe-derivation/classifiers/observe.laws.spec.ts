/**
 * observe classifier — laws.
 *
 * Pins:
 *   O1. Valid shape + no hook → matched/null.
 *   O2. Valid shape + hide-target hook → failed/not-visible.
 *   O3. Valid shape + timeout hook → failed/timeout.
 *   O4. Missing surface or target → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { observeClassifier } from '../../../workshop/probe-derivation/classifiers/observe';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, worldSetup: unknown = undefined): Probe {
  return {
    id: 'probe:observe:x',
    verb: 'observe',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup,
    exercises: [],
  };
}

const run = (input: unknown, worldSetup?: unknown) =>
  Effect.runPromise(observeClassifier.classify(probe(input, worldSetup)));
const VALID_INPUT = {
  surface: { screen: 'policy-search', 'facet-kind': 'element' },
  target: { role: 'button', name: 'Search' },
};

describe('observe classifier laws', () => {
  test('O1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('O2: hide-target hook → failed/not-visible', async () => {
    expect(await run(VALID_INPUT, { 'hide-target': true })).toEqual({
      classification: 'failed',
      errorFamily: 'not-visible',
    });
  });

  test('O3: timeout hook → failed/timeout', async () => {
    expect(await run(VALID_INPUT, { timeout: true })).toEqual({
      classification: 'failed',
      errorFamily: 'timeout',
    });
  });

  test('O4: missing target → failed/unclassified', async () => {
    expect(
      await run({ surface: { screen: 's', 'facet-kind': 'element' } }),
    ).toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });
});

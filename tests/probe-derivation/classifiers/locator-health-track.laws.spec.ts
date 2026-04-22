/**
 * locator-health-track classifier — laws.
 *
 * Pins:
 *   L1. Valid { facet-id, strategy, outcome } triple → matched.
 *   L2. All 6 strategies (role/label/placeholder/text/test-id/css)
 *       are accepted.
 *   L3. Unknown strategy → failed/unclassified.
 *   L4. Missing outcome → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { locatorHealthTrackClassifier } from '../../../workshop/probe-derivation/classifiers/locator-health-track';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown): Probe {
  return {
    id: 'probe:locator-health-track:x',
    verb: 'locator-health-track',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: undefined,
    exercises: [],
  };
}

const run = (input: unknown) => Effect.runPromise(locatorHealthTrackClassifier.classify(probe(input)));
const MATCHED = { classification: 'matched' as const, errorFamily: null };
const FAILED_UNCLASSIFIED = { classification: 'failed' as const, errorFamily: 'unclassified' };

describe('locator-health-track classifier laws', () => {
  test('L1: valid triple → matched', async () => {
    expect(
      await run({ 'facet-id': 'ns:foo', strategy: 'role', outcome: 'success' }),
    ).toEqual(MATCHED);
  });

  test('L2: all 6 strategies accepted', async () => {
    for (const strategy of ['role', 'label', 'placeholder', 'text', 'test-id', 'css']) {
      expect(
        await run({ 'facet-id': 'ns:foo', strategy, outcome: 'success' }),
      ).toEqual(MATCHED);
    }
  });

  test('L3: unknown strategy → failed/unclassified', async () => {
    expect(
      await run({ 'facet-id': 'ns:foo', strategy: 'xpath', outcome: 'success' }),
    ).toEqual(FAILED_UNCLASSIFIED);
  });

  test('L4: missing outcome → failed/unclassified', async () => {
    expect(
      await run({ 'facet-id': 'ns:foo', strategy: 'role' }),
    ).toEqual(FAILED_UNCLASSIFIED);
  });
});

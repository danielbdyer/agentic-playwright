/**
 * intent-fetch classifier — laws (first-principles revision).
 *
 *   N1. Valid shape + no upstream hook → matched.
 *   N2. world.upstream.rate-limited → rate-limited.
 *   N3. world.upstream.transport-failure → unavailable.
 *   N4. world.upstream.malformed-payload → malformed-response.
 *   N5. Invalid source → failed/unclassified.
 *   N6. Missing id → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { intentFetchClassifier } from '../../../workshop/probe-derivation/classifiers/intent-fetch';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, world: unknown = undefined): Probe {
  return {
    id: 'probe:intent-fetch:x',
    verb: 'intent-fetch',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: world,
    exercises: [],
  };
}

const run = (input: unknown, world?: unknown) =>
  Effect.runPromise(intentFetchClassifier.classify(probe(input, world)));

const VALID_INPUT = { source: 'testbed', id: 'WORK-001' };

describe('intent-fetch classifier laws', () => {
  test('N1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('N2: upstream.rate-limited → rate-limited', async () => {
    expect(await run(VALID_INPUT, { upstream: { 'rate-limited': true } })).toEqual({
      classification: 'failed',
      errorFamily: 'rate-limited',
    });
  });

  test('N3: upstream.transport-failure → unavailable', async () => {
    expect(await run(VALID_INPUT, { upstream: { 'transport-failure': true } })).toEqual({
      classification: 'failed',
      errorFamily: 'unavailable',
    });
  });

  test('N4: upstream.malformed-payload → malformed-response', async () => {
    expect(await run(VALID_INPUT, { upstream: { 'malformed-payload': true } })).toEqual({
      classification: 'failed',
      errorFamily: 'malformed-response',
    });
  });

  test('N5: invalid source → failed/unclassified', async () => {
    expect(await run({ source: 'xyz', id: 'x' })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });

  test('N6: missing id → failed/unclassified', async () => {
    expect(await run({ source: 'ado' })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

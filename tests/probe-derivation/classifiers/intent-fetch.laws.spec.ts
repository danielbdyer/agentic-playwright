/**
 * intent-fetch classifier — laws.
 *
 * Pins:
 *   N1. Valid shape + no hook → matched.
 *   N2. simulate-rate-limit hook → failed/rate-limited.
 *   N3. simulate-transport-failure hook → failed/unavailable.
 *   N4. inject-malformed-payload hook → failed/malformed-response.
 *   N5. Invalid source → failed/unclassified.
 *   N6. Missing id → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { intentFetchClassifier } from '../../../workshop/probe-derivation/classifiers/intent-fetch';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, worldSetup: unknown = undefined): Probe {
  return {
    id: 'probe:intent-fetch:x',
    verb: 'intent-fetch',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup,
    exercises: [],
  };
}

const run = (input: unknown, worldSetup?: unknown) =>
  Effect.runPromise(intentFetchClassifier.classify(probe(input, worldSetup)));
const VALID_INPUT = { source: 'testbed', id: 'WORK-001' };

describe('intent-fetch classifier laws', () => {
  test('N1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('N2: simulate-rate-limit → rate-limited', async () => {
    expect(await run(VALID_INPUT, { 'simulate-rate-limit': true })).toEqual({
      classification: 'failed',
      errorFamily: 'rate-limited',
    });
  });

  test('N3: simulate-transport-failure → unavailable', async () => {
    expect(await run(VALID_INPUT, { 'simulate-transport-failure': true })).toEqual({
      classification: 'failed',
      errorFamily: 'unavailable',
    });
  });

  test('N4: inject-malformed-payload → malformed-response', async () => {
    expect(await run(VALID_INPUT, { 'inject-malformed-payload': true })).toEqual({
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

/**
 * interact classifier — laws.
 *
 * Pins the four-family hook routing + shape fallback.
 *
 *   I1. Valid shape + no hook → matched.
 *   I2. hide-target hook → failed/not-visible.
 *   I3. disable-target hook → failed/not-enabled.
 *   I4. detach-target-after-ms (number) → failed/timeout.
 *   I5. non-input-target hook → failed/assertion-like.
 *   I6. Missing action/facet-id/role → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { interactClassifier } from '../../../workshop/probe-derivation/classifiers/interact';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, worldSetup: unknown = undefined): Probe {
  return {
    id: 'probe:interact:x',
    verb: 'interact',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup,
    exercises: [],
  };
}

const run = (input: unknown, worldSetup?: unknown) =>
  Effect.runPromise(interactClassifier.classify(probe(input, worldSetup)));
const VALID_INPUT = { action: 'click', 'facet-id': 'ns:btn', role: 'button' };

describe('interact classifier laws', () => {
  test('I1: valid shape + no hook → matched', async () => {
    expect(await run(VALID_INPUT)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('I2: hide-target → not-visible', async () => {
    expect(await run(VALID_INPUT, { 'hide-target': true })).toEqual({
      classification: 'failed',
      errorFamily: 'not-visible',
    });
  });

  test('I3: disable-target → not-enabled', async () => {
    expect(await run(VALID_INPUT, { 'disable-target': true })).toEqual({
      classification: 'failed',
      errorFamily: 'not-enabled',
    });
  });

  test('I4: detach-target-after-ms → timeout', async () => {
    expect(await run(VALID_INPUT, { 'detach-target-after-ms': 1 })).toEqual({
      classification: 'failed',
      errorFamily: 'timeout',
    });
  });

  test('I5: non-input-target → assertion-like', async () => {
    expect(await run(VALID_INPUT, { 'non-input-target': true })).toEqual({
      classification: 'failed',
      errorFamily: 'assertion-like',
    });
  });

  test('I6: missing action → failed/unclassified', async () => {
    expect(await run({ 'facet-id': 'ns:btn', role: 'button' })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

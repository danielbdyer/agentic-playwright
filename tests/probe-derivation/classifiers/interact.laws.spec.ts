/**
 * interact classifier — laws (first-principles revision).
 *
 * Pins the five-way axis-based routing:
 *
 *   I1. Valid shape + matching visible/enabled surface → matched.
 *   I2. visibility !== 'visible' → failed/not-visible.
 *   I3. enabled === false → failed/not-enabled.
 *   I4. detachAfterMs present → failed/timeout.
 *   I5. action=input + inputBacking=div-with-role → failed/assertion-like.
 *   I6. Missing action / target → failed/unclassified.
 *   I7. No matching surface in world → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { interactClassifier } from '../../../workshop/probe-derivation/classifiers/interact';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, world: unknown = undefined): Probe {
  return {
    id: 'probe:interact:x',
    verb: 'interact',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: world,
    exercises: [],
  };
}

const run = (input: unknown, world?: unknown) =>
  Effect.runPromise(interactClassifier.classify(probe(input, world)));

const CLICK_INPUT = { action: 'click', target: { role: 'button', name: 'Action' } };
const FILL_INPUT = { action: 'input', target: { role: 'textbox', name: 'Field' }, value: 'x' };

describe('interact classifier laws', () => {
  test('I1: matching enabled visible surface → matched', async () => {
    const world = { surfaces: [{ role: 'button', name: 'Action' }] };
    expect(await run(CLICK_INPUT, world)).toEqual({
      classification: 'matched',
      errorFamily: null,
    });
  });

  test('I2: visibility: display-none → not-visible', async () => {
    const world = {
      surfaces: [{ role: 'button', name: 'Action', visibility: 'display-none' }],
    };
    expect(await run(CLICK_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'not-visible',
    });
  });

  test('I3: enabled: false → not-enabled', async () => {
    const world = { surfaces: [{ role: 'textbox', name: 'Field', enabled: false }] };
    expect(await run(FILL_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'not-enabled',
    });
  });

  test('I4: detachAfterMs present → timeout', async () => {
    const world = {
      surfaces: [{ role: 'button', name: 'Action', detachAfterMs: 1 }],
    };
    expect(await run(CLICK_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'timeout',
    });
  });

  test('I5: inputBacking: div-with-role → assertion-like (for input action)', async () => {
    const world = {
      surfaces: [{ role: 'textbox', name: 'Field', inputBacking: 'div-with-role' }],
    };
    expect(await run(FILL_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'assertion-like',
    });
  });

  test('I6: missing action → failed/unclassified', async () => {
    expect(await run({ target: { role: 'button', name: 'Action' } })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });

  test('I7: no matching surface → failed/unclassified', async () => {
    const world = { surfaces: [{ role: 'link', name: 'Other' }] };
    expect(await run(CLICK_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

/**
 * observe classifier — laws (first-principles revision).
 *
 * Pins the classifier's axis-based contract:
 *
 *   O1. Target present + matching surface (visible, no detach) → matched.
 *   O2. Matching surface + visibility !== 'visible' → failed/not-visible.
 *   O3. Matching surface + detachAfterMs present → failed/timeout.
 *   O4. No matching surface in world → failed/unclassified.
 *   O5. Missing target in input → failed/unclassified.
 */

import { describe, test, expect } from 'vitest';
import { Effect } from 'effect';
import { observeClassifier } from '../../../workshop/probe-derivation/classifiers/observe';
import type { Probe } from '../../../workshop/probe-derivation/probe-ir';

function probe(input: unknown, world: unknown = undefined): Probe {
  return {
    id: 'probe:observe:x',
    verb: 'observe',
    fixtureName: 'x',
    declaredIn: 'fixture.yaml',
    expected: { classification: 'matched', errorFamily: null },
    input,
    worldSetup: world,
    exercises: [],
  };
}

const run = (input: unknown, world?: unknown) =>
  Effect.runPromise(observeClassifier.classify(probe(input, world)));

const VALID_INPUT = { target: { role: 'button', name: 'Action' } };

describe('observe classifier laws', () => {
  test('O1: matching visible surface → matched', async () => {
    const world = { surfaces: [{ role: 'button', name: 'Action' }] };
    expect(await run(VALID_INPUT, world)).toEqual({
      classification: 'matched',
      errorFamily: null,
    });
  });

  test('O2: matching hidden surface → failed/not-visible', async () => {
    const world = {
      surfaces: [{ role: 'button', name: 'Action', visibility: 'display-none' }],
    };
    expect(await run(VALID_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'not-visible',
    });
  });

  test('O3: matching surface with detachAfterMs → failed/timeout', async () => {
    const world = {
      surfaces: [{ role: 'button', name: 'Action', detachAfterMs: 1 }],
    };
    expect(await run(VALID_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'timeout',
    });
  });

  test('O4: no matching surface → failed/unclassified', async () => {
    const world = { surfaces: [{ role: 'textbox', name: 'Field' }] };
    expect(await run(VALID_INPUT, world)).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });

  test('O5: missing target → failed/unclassified', async () => {
    expect(await run({ surface: { screen: 's' } })).toEqual({
      classification: 'failed',
      errorFamily: 'unclassified',
    });
  });
});

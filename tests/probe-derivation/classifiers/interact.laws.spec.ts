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

/**
 * Reality-study target shapes (docs/v2-substrate-reality-study.md §4).
 *
 *   I8.  role target reaches a placeholder-only textbox → matched.
 *   I9.  placeholder target → matched on the declaring surface.
 *   I10. text target on a roleless clickable → matched for click.
 *   I11. text target on a roleless surface → assertion-like for input.
 *   I12. text target on a hidden roleless surface → not-visible.
 *   I13. role target on a generic surface → unclassified (a role
 *        query cannot reach a roleless surface; the fixture is
 *        inconsistent).
 */
describe('interact classifier — reality-study target shapes', () => {
  const SEARCH_WORLD = { surfaces: [{ role: 'textbox', naming: 'none', placeholder: 'Search products' }] };

  test('I8: role target reaches a placeholder-only textbox', async () => {
    const input = { action: 'input', target: { role: 'textbox', name: 'Search products' }, value: 'x' };
    expect(await run(input, SEARCH_WORLD)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('I9: placeholder target matches the declaring surface', async () => {
    const input = { action: 'input', target: { placeholder: 'Search products' }, value: 'x' };
    expect(await run(input, SEARCH_WORLD)).toEqual({ classification: 'matched', errorFamily: null });
  });

  test('I10: click on a roleless clickable by text → matched', async () => {
    const world = { surfaces: [{ role: 'generic', name: 'Filter', clickable: true }] };
    expect(await run({ action: 'click', target: { text: 'Filter' } }, world))
      .toEqual({ classification: 'matched', errorFamily: null });
  });

  test('I11: fill on a roleless surface → assertion-like', async () => {
    const world = { surfaces: [{ role: 'generic', name: 'Filter', clickable: true }] };
    expect(await run({ action: 'input', target: { text: 'Filter' }, value: 'x' }, world))
      .toEqual({ classification: 'failed', errorFamily: 'assertion-like' });
  });

  test('I12: hidden roleless surface → not-visible', async () => {
    const world = { surfaces: [{ role: 'generic', name: 'Filter', clickable: true, visibility: 'display-none' }] };
    expect(await run({ action: 'click', target: { text: 'Filter' } }, world))
      .toEqual({ classification: 'failed', errorFamily: 'not-visible' });
  });

  test('I13: role target cannot reach a generic surface → unclassified', async () => {
    const world = { surfaces: [{ role: 'generic', name: 'Filter', clickable: true }] };
    expect(await run({ action: 'click', target: { role: 'generic', name: 'Filter' } }, world))
      .toEqual({ classification: 'failed', errorFamily: 'unclassified' });
  });
});

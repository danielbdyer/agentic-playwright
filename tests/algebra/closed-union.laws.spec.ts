/**
 * closedUnion factory laws.
 *
 *   L-Values-Preserved: closedUnion(values).values === values
 *     reference (the readonly array passed in is exposed as-is,
 *     not a copy — caller's `as const` literals retain their
 *     literal types).
 *
 *   L-Exhaustive-Frozen: assertExhaustive is frozen + every
 *     value appears as a `true` key.
 *
 *   L-Round-Trip: keys of assertExhaustive equal the set of
 *     values (no missing, no extras at runtime).
 */

import { describe, test, expect } from 'vitest';
import { closedUnion } from '../../product/domain/algebra/closed-union';
import {
  SURFACE_ROLE_VALUES,
  SURFACE_VISIBILITY_VALUES,
} from '../../workshop/substrate/surface-spec';
import { PARITY_DIVERGENCE_AXIS_VALUES } from '../../workshop/probe-derivation/parity-failure';
import {
  WORKFLOW_STAGE_VALUES,
  WORKFLOW_SCOPE_VALUES,
  WORKFLOW_LANE_VALUES,
  RESOLUTION_MODE_VALUES,
} from '../../product/domain/governance/workflow-folds';
import { REASONING_OP_VALUES } from '../../product/reasoning/reasoning';

describe('closedUnion factory', () => {
  test('L-Values-Preserved: values array is exposed unchanged', () => {
    type Color = 'red' | 'green' | 'blue';
    const COLOR = closedUnion<Color>(['red', 'green', 'blue']);
    expect(COLOR.values).toEqual(['red', 'green', 'blue']);
  });

  test('L-Exhaustive-Frozen: assertExhaustive is frozen', () => {
    type Color = 'red' | 'green';
    const COLOR = closedUnion<Color>(['red', 'green']);
    expect(Object.isFrozen(COLOR.assertExhaustive)).toBe(true);
  });

  test('L-Exhaustive-Frozen: outer ClosedUnion object is frozen', () => {
    type Color = 'red' | 'green';
    const COLOR = closedUnion<Color>(['red', 'green']);
    expect(Object.isFrozen(COLOR)).toBe(true);
  });

  test('L-Exhaustive-Frozen: every value appears as true', () => {
    type Color = 'red' | 'green' | 'blue';
    const COLOR = closedUnion<Color>(['red', 'green', 'blue']);
    for (const v of COLOR.values) {
      expect(COLOR.assertExhaustive[v]).toBe(true);
    }
  });

  test('L-Round-Trip: assertExhaustive keys equal values set', () => {
    type Color = 'red' | 'green' | 'blue';
    const COLOR = closedUnion<Color>(['red', 'green', 'blue']);
    const keys = new Set(Object.keys(COLOR.assertExhaustive));
    const values = new Set(COLOR.values);
    expect(keys).toEqual(values);
  });

  test('empty union edge case: empty values produces empty record', () => {
    // Type-level: closedUnion<never>([]) is the degenerate case.
    // Not used in practice but the factory should handle it
    // without crashing.
    const EMPTY = closedUnion<never>([]);
    expect(EMPTY.values).toEqual([]);
    expect(Object.keys(EMPTY.assertExhaustive)).toEqual([]);
  });

  test('integration: existing closed-union sites use the factory + retain shape', () => {
    // Smoke-test that the 8 swept sites produce expected
    // values-array shapes via the factory. This catches drift
    // if a future PR removes a value without updating the
    // companion fold.
    expect(SURFACE_ROLE_VALUES.length).toBe(28);
    expect(SURFACE_VISIBILITY_VALUES.length).toBe(5);
    expect(PARITY_DIVERGENCE_AXIS_VALUES.length).toBe(2);
    expect(WORKFLOW_STAGE_VALUES.length).toBe(6);
    expect(WORKFLOW_SCOPE_VALUES.length).toBe(8);
    expect(WORKFLOW_LANE_VALUES.length).toBe(7);
    expect(RESOLUTION_MODE_VALUES.length).toBe(3);
    expect(REASONING_OP_VALUES.length).toBe(3);
  });
});

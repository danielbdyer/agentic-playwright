/**
 * Ladder<RungId> + foldGroundingLattice laws.
 *
 *   L-Order-Total:           precedes is a total order.
 *   L-Meet-Join-Lattice:     meet ⊓ join form a bounded lattice.
 *   L-FindFirst-Walks-Order: findFirst returns rungs in the
 *                            ladder's declaration order.
 *   L-Lattice-Cartesian:     foldGroundingLattice covers every
 *                            (substrate, resolution) cell.
 */

import { describe, test, expect } from 'vitest';
import {
  foldGroundingLattice,
  groundingCellKey,
  makeLadder,
} from '../../product/domain/algebra/ladder';

describe('Ladder<RungId>', () => {
  type SubstrateRung =
    | 'dry-harness'
    | 'fixture-replay'
    | 'playwright-live'
    | 'commoncrawl-derived';

  const substrateLadder = makeLadder<SubstrateRung>([
    'dry-harness',
    'fixture-replay',
    'playwright-live',
    'commoncrawl-derived',
  ]);

  test('L-Bottom-Top: bottom is first value; top is last', () => {
    expect(substrateLadder.bottom).toBe('dry-harness');
    expect(substrateLadder.top).toBe('commoncrawl-derived');
  });

  test('L-Order-Total: precedes is a total order', () => {
    expect(substrateLadder.precedes('dry-harness', 'fixture-replay')).toBe(true);
    expect(substrateLadder.precedes('fixture-replay', 'dry-harness')).toBe(false);
    // Reflexive
    expect(substrateLadder.precedes('fixture-replay', 'fixture-replay')).toBe(true);
    // Transitive
    expect(substrateLadder.precedes('dry-harness', 'commoncrawl-derived')).toBe(true);
  });

  test('L-Meet: meet returns the lower of two rungs', () => {
    expect(substrateLadder.meet('fixture-replay', 'playwright-live')).toBe(
      'fixture-replay',
    );
    expect(substrateLadder.meet('playwright-live', 'fixture-replay')).toBe(
      'fixture-replay',
    );
    expect(substrateLadder.meet('dry-harness', 'dry-harness')).toBe('dry-harness');
  });

  test('L-Join: join returns the higher of two rungs', () => {
    expect(substrateLadder.join('fixture-replay', 'playwright-live')).toBe(
      'playwright-live',
    );
    expect(substrateLadder.join('playwright-live', 'fixture-replay')).toBe(
      'playwright-live',
    );
  });

  test('L-Lattice-Identity: meet(top, x) = x; join(bottom, x) = x', () => {
    for (const v of substrateLadder.union.values) {
      expect(substrateLadder.meet(substrateLadder.top, v)).toBe(v);
      expect(substrateLadder.join(substrateLadder.bottom, v)).toBe(v);
    }
  });

  test('L-FindFirst-Walks-Order: returns first rung satisfying predicate', () => {
    const interactive = substrateLadder.findFirst(
      (r) => r === 'playwright-live' || r === 'fixture-replay',
    );
    expect(interactive).toBe('fixture-replay');
  });

  test('findFirst: returns null when no rung satisfies', () => {
    expect(substrateLadder.findFirst(() => false)).toBeNull();
  });

  test('throws when constructed with empty values', () => {
    expect(() => makeLadder([])).toThrow(/at least one rung/);
  });
});

describe('foldGroundingLattice (2-D Substrate × Resolution)', () => {
  const substrate = makeLadder<'dry' | 'live'>(['dry', 'live']);
  const resolution = makeLadder<'pattern' | 'agent'>(['pattern', 'agent']);

  test('L-Lattice-Cartesian: every (substrate, resolution) cell is folded', () => {
    const cells = foldGroundingLattice({
      substrate,
      resolution,
      cell: ({ substrate: s, resolution: r }) => `${s}-${r}`,
    });
    expect(Object.keys(cells).sort()).toEqual([
      'dry|agent',
      'dry|pattern',
      'live|agent',
      'live|pattern',
    ]);
    expect(cells['dry|pattern']).toBe('dry-pattern');
    expect(cells['live|agent']).toBe('live-agent');
  });

  test('groundingCellKey produces the same key the lattice fold uses', () => {
    expect(groundingCellKey({ substrate: 'dry', resolution: 'pattern' })).toBe(
      'dry|pattern',
    );
  });

  test('result is frozen (cannot mutate after fold)', () => {
    const cells = foldGroundingLattice({
      substrate,
      resolution,
      cell: () => 1,
    });
    expect(Object.isFrozen(cells)).toBe(true);
  });
});

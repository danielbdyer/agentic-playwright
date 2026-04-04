/**
 * Governance Lattice — Algebraic Law Tests (W2.3)
 *
 * Verifies that the three-element governance lattice {approved, review-required, blocked}
 * satisfies all bounded lattice axioms under meet (most restrictive) and join (least restrictive).
 *
 * The lattice order is: blocked ⊑ review-required ⊑ approved
 *   (blocked = bottom = most restrictive, approved = top = most permissive)
 * Meet computes the greatest lower bound (most restrictive).
 * Join computes the least upper bound (most permissive).
 *
 * Tested structures:
 *   - GovernanceLattice (BoundedLattice<Governance>)
 *   - mergeGovernance (alias for meet — returns most restrictive)
 *   - meetAll / joinAll (fold over arrays)
 */

import { expect, test } from '@playwright/test';
import { GovernanceLattice, mergeGovernance, meetAll, joinAll } from '../lib/domain/algebra/lattice';
import type { Governance } from '../lib/domain/governance/workflow-types';
import { mulberry32, pick , LAW_SEED_COUNT } from './support/random';

const ALL_GOVERNANCE: readonly Governance[] = ['approved', 'review-required', 'blocked'];
const { meet, join, top, bottom, order } = GovernanceLattice;

// ─── Helpers ───

function governancePair(next: () => number): readonly [Governance, Governance] {
  return [pick(next, ALL_GOVERNANCE), pick(next, ALL_GOVERNANCE)];
}

function governanceTriple(next: () => number): readonly [Governance, Governance, Governance] {
  return [pick(next, ALL_GOVERNANCE), pick(next, ALL_GOVERNANCE), pick(next, ALL_GOVERNANCE)];
}

// ─── Law 1: Idempotency ───

test.describe('Law 1: Idempotency', () => {
  test('meet(a, a) === a for all governance values', () => {
    for (const g of ALL_GOVERNANCE) {
      expect(meet(g, g)).toBe(g);
    }
  });

  test('join(a, a) === a for all governance values', () => {
    for (const g of ALL_GOVERNANCE) {
      expect(join(g, g)).toBe(g);
    }
  });

  test('idempotency holds across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, ALL_GOVERNANCE);
      expect(meet(a, a)).toBe(a);
      expect(join(a, a)).toBe(a);
    }
  });
});

// ─── Law 2: Commutativity ───

test.describe('Law 2: Commutativity', () => {
  test('meet(a, b) === meet(b, a) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b] = governancePair(next);
      expect(meet(a, b)).toBe(meet(b, a));
    }
  });

  test('join(a, b) === join(b, a) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b] = governancePair(next);
      expect(join(a, b)).toBe(join(b, a));
    }
  });
});

// ─── Law 3: Associativity ───

test.describe('Law 3: Associativity', () => {
  test('meet(a, meet(b, c)) === meet(meet(a, b), c) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b, c] = governanceTriple(next);
      expect(meet(a, meet(b, c))).toBe(meet(meet(a, b), c));
    }
  });

  test('join(a, join(b, c)) === join(join(a, b), c) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b, c] = governanceTriple(next);
      expect(join(a, join(b, c))).toBe(join(join(a, b), c));
    }
  });
});

// ─── Law 4: Absorption ───

test.describe('Law 4: Absorption', () => {
  test('meet(a, join(a, b)) === a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b] = governancePair(next);
      expect(meet(a, join(a, b))).toBe(a);
    }
  });

  test('join(a, meet(a, b)) === a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b] = governancePair(next);
      expect(join(a, meet(a, b))).toBe(a);
    }
  });
});

// ─── Law 5: Bounded ───

test.describe('Law 5: Bounded identity elements', () => {
  test('meet(a, bottom) === bottom for all a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, ALL_GOVERNANCE);
      expect(meet(a, bottom)).toBe(bottom);
    }
  });

  test('join(a, top) === top for all a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, ALL_GOVERNANCE);
      expect(join(a, top)).toBe(top);
    }
  });

  test('meet(a, top) === a for all a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, ALL_GOVERNANCE);
      expect(meet(a, top)).toBe(a);
    }
  });

  test('join(a, bottom) === a for all a across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, ALL_GOVERNANCE);
      expect(join(a, bottom)).toBe(a);
    }
  });
});

// ─── Law 6: Monotonicity ───

test.describe('Law 6: Monotonicity — governance flows only toward more restrictive', () => {
  test('order is reflexive', () => {
    for (const g of ALL_GOVERNANCE) {
      expect(order(g, g)).toBe(true);
    }
  });

  test('order is antisymmetric', () => {
    for (const a of ALL_GOVERNANCE) {
      for (const b of ALL_GOVERNANCE) {
        if (order(a, b) && order(b, a)) {
          expect(a).toBe(b);
        }
      }
    }
  });

  test('order is transitive across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b, c] = governanceTriple(next);
      if (order(a, b) && order(b, c)) {
        expect(order(a, c)).toBe(true);
      }
    }
  });

  test('blocked ⊑ review-required ⊑ approved', () => {
    expect(order('blocked', 'review-required')).toBe(true);
    expect(order('review-required', 'approved')).toBe(true);
    expect(order('blocked', 'approved')).toBe(true);
  });

  test('approved is never ⊑ review-required or blocked (strict)', () => {
    expect(order('approved', 'review-required')).toBe(false);
    expect(order('approved', 'blocked')).toBe(false);
  });

  test('meet preserves order: if a <= b then meet(a, c) <= meet(b, c) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b, c] = governanceTriple(next);
      if (order(a, b)) {
        expect(order(meet(a, c), meet(b, c))).toBe(true);
      }
    }
  });
});

// ─── Law 7: mergeGovernance returns most restrictive ───

test.describe('Law 7: mergeGovernance returns most restrictive', () => {
  test('mergeGovernance agrees with meet across all pairs', () => {
    for (const a of ALL_GOVERNANCE) {
      for (const b of ALL_GOVERNANCE) {
        expect(mergeGovernance(a, b)).toBe(meet(a, b));
      }
    }
  });

  test('mergeGovernance(approved, blocked) === blocked', () => {
    expect(mergeGovernance('approved', 'blocked')).toBe('blocked');
  });

  test('mergeGovernance(approved, review-required) === review-required', () => {
    expect(mergeGovernance('approved', 'review-required')).toBe('review-required');
  });

  test('mergeGovernance(review-required, blocked) === blocked', () => {
    expect(mergeGovernance('review-required', 'blocked')).toBe('blocked');
  });

  test('mergeGovernance(approved, approved) === approved', () => {
    expect(mergeGovernance('approved', 'approved')).toBe('approved');
  });

  test('mergeGovernance is commutative across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const [a, b] = governancePair(next);
      expect(mergeGovernance(a, b)).toBe(mergeGovernance(b, a));
    }
  });
});

// ─── Law 8: meetAll / joinAll ───

test.describe('Law 8: meetAll and joinAll over arrays', () => {
  test('meetAll of empty array is top (identity for meet)', () => {
    expect(meetAll(GovernanceLattice, [])).toBe(top);
  });

  test('joinAll of empty array is bottom (identity for join)', () => {
    expect(joinAll(GovernanceLattice, [])).toBe(bottom);
  });

  test('meetAll of singleton is the element itself', () => {
    for (const g of ALL_GOVERNANCE) {
      expect(meetAll(GovernanceLattice, [g])).toBe(g);
    }
  });

  test('joinAll of singleton is the element itself', () => {
    for (const g of ALL_GOVERNANCE) {
      expect(joinAll(GovernanceLattice, [g])).toBe(g);
    }
  });

  test('meetAll of all three values is blocked (bottom)', () => {
    expect(meetAll(GovernanceLattice, [...ALL_GOVERNANCE])).toBe('blocked');
  });

  test('joinAll of all three values is approved (top)', () => {
    expect(joinAll(GovernanceLattice, [...ALL_GOVERNANCE])).toBe('approved');
  });

  test('meetAll agrees with sequential meet across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const values = Array.from({ length: 3 + Math.floor(next() * 5) }, () => pick(next, ALL_GOVERNANCE));
      const folded = meetAll(GovernanceLattice, values);
      const sequential = values.reduce((acc, v) => meet(acc, v), top);
      expect(folded).toBe(sequential);
    }
  });

  test('joinAll agrees with sequential join across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const values = Array.from({ length: 3 + Math.floor(next() * 5) }, () => pick(next, ALL_GOVERNANCE));
      const folded = joinAll(GovernanceLattice, values);
      const sequential = values.reduce((acc, v) => join(acc, v), bottom);
      expect(folded).toBe(sequential);
    }
  });
});

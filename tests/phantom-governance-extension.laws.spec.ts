/**
 * Phantom Governance Extension -- Law Tests (W4.13)
 *
 * Verifies the phantom-branded governance types, mint functions, foldGovernance
 * exhaustive dispatch, type guards (isApproved, isBlocked, isReviewRequired),
 * and the governance lattice meet preserving brands.
 *
 * 150 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import {
  foldGovernance,
  isApproved,
  isBlocked,
  isReviewRequired,
  mintApproved,
  mintBlocked,
  mintGovernance,
  mintReviewRequired,
  requireApproved,
  type Governance,
} from '../lib/domain/types/workflow';
import { GovernanceLattice } from '../lib/domain/algebra/lattice';
import { mulberry32, pick } from './support/random';

const ALL_GOVERNANCE: readonly Governance[] = ['approved', 'review-required', 'blocked'];

// --- Helpers ---

function randomGovernedItem(next: () => number): { readonly governance: Governance; readonly id: number } {
  return { governance: pick(next, ALL_GOVERNANCE), id: Math.floor(next() * 10000) };
}

// --- Law 1: mintApproved returns 'approved' string ---

test('mintApproved returns the literal string approved (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    // Minting is deterministic but we iterate seeds to confirm stability
    expect(mintApproved()).toBe('approved');
    expect(mintReviewRequired()).toBe('review-required');
    expect(mintBlocked()).toBe('blocked');
  }
});

// --- Law 2: foldGovernance is exhaustive ---

test('foldGovernance dispatches correctly for all three governance values (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const item = randomGovernedItem(next);

    const result = foldGovernance(item, {
      approved: (i) => `approved:${i.id}`,
      reviewRequired: (i) => `review:${i.id}`,
      blocked: (i) => `blocked:${i.id}`,
    });

    const expected =
      item.governance === 'approved' ? `approved:${item.id}`
        : item.governance === 'review-required' ? `review:${item.id}`
          : `blocked:${item.id}`;

    expect(result).toBe(expected);
  }
});

// --- Law 3: Governance lattice meet preserves brands ---

test('governance lattice meet preserves brands -- meet of two governances is valid (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const a = pick(next, ALL_GOVERNANCE);
    const b = pick(next, ALL_GOVERNANCE);

    const met = GovernanceLattice.meet(a, b);

    // The result must be a valid governance value
    expect(ALL_GOVERNANCE).toContain(met);

    // Meet is the most restrictive: met must be <= both a and b in the lattice order
    expect(GovernanceLattice.order(met, a)).toBe(true);
    expect(GovernanceLattice.order(met, b)).toBe(true);

    // Branding round-trip: wrapping met in an item and folding must dispatch correctly
    const item = { governance: met, id: seed };
    const tag = foldGovernance(item, {
      approved: () => 'approved' as const,
      reviewRequired: () => 'review-required' as const,
      blocked: () => 'blocked' as const,
    });
    expect(tag).toBe(met);
  }
});

// --- Law 4: foldGovernance on random governance values never throws (totality) ---

test('foldGovernance never throws for any governance value (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const item = randomGovernedItem(next);

    // This must not throw -- foldGovernance is total over the Governance union
    const result = foldGovernance(item, {
      approved: () => 'a',
      reviewRequired: () => 'r',
      blocked: () => 'b',
    });

    expect(['a', 'r', 'b']).toContain(result);
  }
});

// --- Law 5: Phantom brand type guards narrow correctly ---

test('isApproved / isBlocked / isReviewRequired narrow correctly (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const item = randomGovernedItem(next);

    // Exactly one guard should return true
    const guards = [isApproved(item), isReviewRequired(item), isBlocked(item)];
    const trueCount = guards.filter(Boolean).length;
    expect(trueCount).toBe(1);

    // The true guard must match the governance value
    if (item.governance === 'approved') {
      expect(isApproved(item)).toBe(true);
      expect(isBlocked(item)).toBe(false);
      expect(isReviewRequired(item)).toBe(false);
    } else if (item.governance === 'review-required') {
      expect(isReviewRequired(item)).toBe(true);
      expect(isApproved(item)).toBe(false);
      expect(isBlocked(item)).toBe(false);
    } else {
      expect(isBlocked(item)).toBe(true);
      expect(isApproved(item)).toBe(false);
      expect(isReviewRequired(item)).toBe(false);
    }
  }
});

// --- Supplementary: mintGovernance round-trips ---

test('mintGovernance returns the exact governance string passed in (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const g = pick(next, ALL_GOVERNANCE);
    expect(mintGovernance(g)).toBe(g);
  }
});

// --- Supplementary: requireApproved throws on non-approved ---

test('requireApproved throws for non-approved and succeeds for approved (150 seeds)', () => {
  for (let seed = 1; seed <= 150; seed += 1) {
    const next = mulberry32(seed);
    const item = randomGovernedItem(next);

    if (item.governance === 'approved') {
      expect(() => requireApproved(item)).not.toThrow();
    } else {
      expect(() => requireApproved(item)).toThrow();
    }
  }
});

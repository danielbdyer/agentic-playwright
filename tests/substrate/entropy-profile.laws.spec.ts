/**
 * EntropyProfile — RNG primitive laws.
 *
 *   EP1. seededRandom is deterministic — same seed yields identical
 *        sequence across instantiations.
 *   EP2. Different seeds yield different sequences.
 *   EP3. rngShuffle is a permutation (every element appears exactly once).
 *   EP4. rngSubset of size k yields k distinct elements drawn from the input.
 *   EP5. rngInt stays within bounds [min, max].
 */

import { describe, test, expect } from 'vitest';
import {
  BADGE_LABEL_POOL,
  CALLOUT_LABEL_POOL,
  rngInt,
  rngPick,
  rngShuffle,
  rngSubset,
  seededRandom,
} from '../../workshop/substrate/entropy-profile';

describe('EntropyProfile RNG laws', () => {
  test('EP1: seededRandom is deterministic', () => {
    const a = seededRandom('probe-x');
    const b = seededRandom('probe-x');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  test('EP2: different seeds diverge', () => {
    const a = seededRandom('probe-x');
    const b = seededRandom('probe-y');
    expect(a()).not.toBe(b());
  });

  test('EP3: rngShuffle is a permutation', () => {
    const input = [1, 2, 3, 4, 5];
    const rng = seededRandom('shuffle-seed');
    const out = rngShuffle(rng, input);
    expect(out.length).toBe(input.length);
    expect([...out].sort()).toEqual([...input].sort());
  });

  test('EP4: rngSubset yields k distinct elements', () => {
    const rng = seededRandom('subset-seed');
    const out = rngSubset(rng, BADGE_LABEL_POOL, 3);
    expect(out.length).toBe(3);
    expect(new Set(out).size).toBe(3);
    for (const item of out) {
      expect(BADGE_LABEL_POOL).toContain(item);
    }
  });

  test('EP5: rngInt stays within bounds', () => {
    const rng = seededRandom('int-seed');
    for (let i = 0; i < 100; i++) {
      const n = rngInt(rng, 3, 7);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(n).toBeLessThanOrEqual(7);
    }
  });

  test('EP6: rngPick returns an element from the input', () => {
    const rng = seededRandom('pick-seed');
    for (let i = 0; i < 20; i++) {
      const pick = rngPick(rng, CALLOUT_LABEL_POOL);
      expect(CALLOUT_LABEL_POOL).toContain(pick);
    }
  });
});

/**
 * Cohort trust guard — clean-room rule enforcement laws.
 *
 * Pins the spike §4.4 C2 invariant: held-out cohort role MUST NOT
 * permit canon writes. Cycle 4 of the cold-start cohort spike.
 *
 *   ZC39     training role passes the guard
 *   ZC39.b   held-out role raises HeldOutCanonWriteAttempt
 *   ZC39.c   the predicate form returns true for training, false
 *            for held-out
 */

import { describe, test, expect } from 'vitest';
import {
  assertCanonWritesAllowed,
  canonWritesAllowed,
  HeldOutCanonWriteAttempt,
} from '../../workshop/customer-backlog/application/cohort-trust-guard';

describe('Cohort trust guard — ZC39 clean-room laws', () => {
  test('ZC39: training role passes the guard without throwing', () => {
    expect(() => assertCanonWritesAllowed('training', 'unit test')).not.toThrow();
  });

  test('ZC39.b: held-out role raises HeldOutCanonWriteAttempt with the context detail', () => {
    expect(() => assertCanonWritesAllowed('held-out', 'sample context'))
      .toThrow(HeldOutCanonWriteAttempt);
    try {
      assertCanonWritesAllowed('held-out', 'sample context');
    } catch (err) {
      expect(err).toBeInstanceOf(HeldOutCanonWriteAttempt);
      expect((err as Error).message).toContain('sample context');
      expect((err as HeldOutCanonWriteAttempt).code).toBe('cohort-clean-room-violation');
    }
  });

  test('ZC39.c: predicate form returns training -> true, held-out -> false', () => {
    expect(canonWritesAllowed('training')).toBe(true);
    expect(canonWritesAllowed('held-out')).toBe(false);
  });
});

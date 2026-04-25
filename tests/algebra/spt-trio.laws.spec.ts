/**
 * S + P + T trio algebra laws.
 *
 *   S — KeyedSetMonoid<T, K>: identity + associativity +
 *       right-bias + dedupByKey integration.
 *   P — trajectoryMonoid: identity + associativity + cohort
 *       guard.
 *   T — graduationGateMonoid: identity + associativity +
 *       boolean-meet semantics + missingConditions union.
 */

import { describe, test, expect } from 'vitest';
import {
  dedupByKey,
  keyedSetMonoid,
} from '../../product/domain/algebra/keyed-set';
import { concatAll } from '../../product/domain/algebra/monoid';
import {
  emptyTrajectory,
  trajectoryMonoid,
  type Trajectory,
  type TrajectoryEntry,
} from '../../workshop/compounding/domain/trajectory';
import {
  conditionToGateFlag,
  graduationGateMonoid,
  type GraduationCondition,
} from '../../workshop/compounding/domain/graduation';

// ─── S — KeyedSetMonoid ─────────────────────────────────────

describe('S — keyedSetMonoid', () => {
  type Item = { readonly id: string; readonly value: number };
  const monoid = keyedSetMonoid<Item, string>({ keyOf: (i) => i.id });

  test('L-Left-Identity: combine(empty, m) ≡ m', () => {
    const m = new Map<string, Item>([['a', { id: 'a', value: 1 }]]);
    const result = monoid.combine(monoid.empty, m);
    expect([...result.entries()]).toEqual([...m.entries()]);
  });

  test('L-Right-Identity: combine(m, empty) ≡ m', () => {
    const m = new Map<string, Item>([['a', { id: 'a', value: 1 }]]);
    const result = monoid.combine(m, monoid.empty);
    expect([...result.entries()]).toEqual([...m.entries()]);
  });

  test('L-Associativity: combine(a, combine(b, c)) ≡ combine(combine(a, b), c)', () => {
    const a = new Map([['x', { id: 'x', value: 1 }]]);
    const b = new Map([['y', { id: 'y', value: 2 }]]);
    const c = new Map([['z', { id: 'z', value: 3 }]]);
    const left = monoid.combine(a, monoid.combine(b, c));
    const right = monoid.combine(monoid.combine(a, b), c);
    expect([...left.entries()].sort()).toEqual([...right.entries()].sort());
  });

  test('L-Right-Bias: combine(a, b) keeps b on key collision', () => {
    const a = new Map([['k', { id: 'k', value: 1 }]]);
    const b = new Map([['k', { id: 'k', value: 99 }]]);
    const merged = monoid.combine(a, b);
    expect(merged.get('k')!.value).toBe(99);
  });

  test('dedupByKey returns unique-by-key items, last-wins', () => {
    const items: Item[] = [
      { id: 'a', value: 1 },
      { id: 'b', value: 2 },
      { id: 'a', value: 99 },
    ];
    const result = dedupByKey({ items, keyOf: (i) => i.id });
    expect(result.length).toBe(2);
    expect(result.find((i) => i.id === 'a')!.value).toBe(99);
  });
});

// ─── P — trajectoryMonoid ───────────────────────────────────

describe('P — trajectoryMonoid', () => {
  function entry(timestamp: string, rate: number): TrajectoryEntry {
    return {
      cohortId: 'cohort-1',
      timestamp,
      sampleSize: 1,
      confirmedCount: rate > 0 ? 1 : 0,
      refutedCount: rate > 0 ? 0 : 1,
      rate,
      substrateVersion: '1.0.0',
    };
  }

  const monoid = trajectoryMonoid('cohort-1');

  test('L-Left-Identity: combine(empty, t) ≡ t', () => {
    const t: Trajectory = {
      cohortId: 'cohort-1',
      entries: [entry('2026-01-01T00:00:00.000Z', 1)],
    };
    expect(monoid.combine(monoid.empty, t)).toEqual(t);
  });

  test('L-Right-Identity: combine(t, empty) ≡ t', () => {
    const t: Trajectory = {
      cohortId: 'cohort-1',
      entries: [entry('2026-01-01T00:00:00.000Z', 1)],
    };
    expect(monoid.combine(t, monoid.empty)).toEqual(t);
  });

  test('L-Associativity: combine(a, combine(b, c)) ≡ combine(combine(a, b), c)', () => {
    const a = {
      cohortId: 'cohort-1',
      entries: [entry('2026-01-01T00:00:00.000Z', 1)],
    };
    const b = {
      cohortId: 'cohort-1',
      entries: [entry('2026-01-02T00:00:00.000Z', 1)],
    };
    const c = {
      cohortId: 'cohort-1',
      entries: [entry('2026-01-03T00:00:00.000Z', 0)],
    };
    expect(monoid.combine(a, monoid.combine(b, c))).toEqual(
      monoid.combine(monoid.combine(a, b), c),
    );
  });

  test('L-Cohort-Guard: cross-cohort combine throws', () => {
    const t: Trajectory = {
      cohortId: 'cohort-other',
      entries: [],
    };
    expect(() => monoid.combine(monoid.empty, t)).toThrow(/mismatched right cohort/);
    expect(() => monoid.combine(t, monoid.empty)).toThrow(/mismatched left cohort/);
  });

  test('emptyTrajectory: returns the identity for the named cohort', () => {
    expect(emptyTrajectory('foo')).toEqual({ cohortId: 'foo', entries: [] });
  });
});

// ─── T — graduationGateMonoid ───────────────────────────────

describe('T — graduationGateMonoid (Boolean meet)', () => {
  const m = graduationGateMonoid;

  test('L-Identity: empty has held=true, no missing conditions', () => {
    expect(m.empty).toEqual({ held: true, missingConditions: [] });
  });

  test('L-Boolean-Meet: held = a.held ∧ b.held', () => {
    expect(
      m.combine(
        { held: true, missingConditions: [] },
        { held: true, missingConditions: [] },
      ).held,
    ).toBe(true);
    expect(
      m.combine(
        { held: true, missingConditions: [] },
        { held: false, missingConditions: ['c'] },
      ).held,
    ).toBe(false);
    expect(
      m.combine(
        { held: false, missingConditions: ['a'] },
        { held: false, missingConditions: ['b'] },
      ).held,
    ).toBe(false);
  });

  test('L-Missing-Union: missingConditions accumulate without duplicates', () => {
    const result = m.combine(
      { held: false, missingConditions: ['a', 'b'] },
      { held: false, missingConditions: ['b', 'c'] },
    );
    expect(result.missingConditions).toEqual(['a', 'b', 'c']);
  });

  test('L-Associativity', () => {
    const a = { held: true, missingConditions: [] };
    const b = { held: false, missingConditions: ['x'] };
    const c = { held: false, missingConditions: ['y'] };
    expect(m.combine(a, m.combine(b, c))).toEqual(m.combine(m.combine(a, b), c));
  });

  test('integration: concatAll over conditions reproduces holds + missing', () => {
    const conditions: readonly GraduationCondition[] = [
      { name: 'one', held: true, detail: '' },
      { name: 'two', held: false, detail: '' },
      { name: 'three', held: true, detail: '' },
      { name: 'four', held: false, detail: '' },
    ];
    const folded = concatAll(m, conditions.map(conditionToGateFlag));
    expect(folded.held).toBe(false);
    expect(folded.missingConditions).toEqual(['two', 'four']);
  });
});

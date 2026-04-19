import { expect, test } from '@playwright/test';
import { concatAll } from '../product/domain/algebra/monoid';
import {
  numberRecordSumMonoid,
  sortedReadonlyArrayMonoid,
  structMonoid,
  sumMonoid,
} from '../product/domain/algebra/envelope-mergers';

test.describe('sumMonoid laws', () => {
  test('associativity', () => {
    expect(sumMonoid.combine(sumMonoid.combine(2, 5), 9)).toBe(sumMonoid.combine(2, sumMonoid.combine(5, 9)));
  });

  test('identity', () => {
    expect(sumMonoid.combine(sumMonoid.empty, 42)).toBe(42);
    expect(sumMonoid.combine(42, sumMonoid.empty)).toBe(42);
  });
});

test.describe('sortedReadonlyArrayMonoid laws', () => {
  const monoid = sortedReadonlyArrayMonoid<{ id: string }>((entry) => entry.id);
  const a = [{ id: 'b' }, { id: 'a' }];
  const b = [{ id: 'd' }];
  const c = [{ id: 'c' }];

  test('associativity', () => {
    const left = monoid.combine(monoid.combine(a, b), c);
    const right = monoid.combine(a, monoid.combine(b, c));
    expect(left).toEqual(right);
  });

  test('identity', () => {
    expect(monoid.combine(monoid.empty, a)).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(monoid.combine(a, monoid.empty)).toEqual([{ id: 'a' }, { id: 'b' }]);
  });

  test('order-stability after canonical sort', () => {
    const forward = concatAll(monoid, [a, b, c]);
    const reversed = concatAll(monoid, [c, b, a]);
    expect(forward).toEqual(reversed);
    expect(forward.map((entry) => entry.id)).toEqual(['a', 'b', 'c', 'd']);
  });
});

test.describe('numberRecordSumMonoid laws', () => {
  const a = { beta: 2, alpha: 1 };
  const b = { beta: 3, gamma: 4 };
  const c = { alpha: 5 };

  test('associativity', () => {
    const left = numberRecordSumMonoid.combine(numberRecordSumMonoid.combine(a, b), c);
    const right = numberRecordSumMonoid.combine(a, numberRecordSumMonoid.combine(b, c));
    expect(left).toEqual(right);
  });

  test('identity', () => {
    expect(numberRecordSumMonoid.combine(numberRecordSumMonoid.empty, a)).toEqual({ alpha: 1, beta: 2 });
    expect(numberRecordSumMonoid.combine(a, numberRecordSumMonoid.empty)).toEqual({ alpha: 1, beta: 2 });
  });

  test('order-stability after canonical key sort', () => {
    const forward = concatAll(numberRecordSumMonoid, [a, b, c]);
    const reversed = concatAll(numberRecordSumMonoid, [c, b, a]);
    expect(forward).toEqual(reversed);
    expect(Object.keys(forward)).toEqual(['alpha', 'beta', 'gamma']);
  });
});

test.describe('structMonoid laws', () => {
  const monoid = structMonoid<{ readonly total: number; readonly counters: Readonly<Record<string, number>> }>({
    total: sumMonoid,
    counters: numberRecordSumMonoid,
  });
  const a = { total: 1, counters: { b: 2 } };
  const b = { total: 3, counters: { a: 4 } };
  const c = { total: 5, counters: { b: 6 } };

  test('associativity', () => {
    const left = monoid.combine(monoid.combine(a, b), c);
    const right = monoid.combine(a, monoid.combine(b, c));
    expect(left).toEqual(right);
  });

  test('identity', () => {
    expect(monoid.combine(monoid.empty, a)).toEqual({ total: 1, counters: { b: 2 } });
    expect(monoid.combine(a, monoid.empty)).toEqual({ total: 1, counters: { b: 2 } });
  });

  test('order-stability after canonical sort in nested merger', () => {
    const forward = concatAll(monoid, [a, b, c]);
    const reversed = concatAll(monoid, [c, b, a]);
    expect(forward).toEqual(reversed);
    expect(Object.keys(forward.counters)).toEqual(['a', 'b']);
  });
});

import type { Monoid } from './monoid';

/**
 * Additive monoid for numeric totals.
 *
 * Identity law: combine(0, x) === x === combine(x, 0)
 * Associativity law: combine(combine(a, b), c) === combine(a, combine(b, c))
 */
export const sumMonoid: Monoid<number> = {
  empty: 0,
  combine: (a, b) => a + b,
};

/**
 * Monoid for readonly arrays with canonical sort after append.
 *
 * Identity law: combine([], xs) === canonicalSort(xs) === combine(xs, [])
 * Associativity law: post-sort append is associative because canonical sorting
 * is idempotent and deterministic under a stable key function.
 */
export function sortedReadonlyArrayMonoid<T>(key: (value: T) => string): Monoid<readonly T[]> {
  const canonicalSort = (values: readonly T[]): readonly T[] =>
    [...values].sort((a, b) => key(a).localeCompare(key(b)));

  return {
    empty: [],
    combine: (a, b) => canonicalSort([...a, ...b]),
  };
}

const sortRecordEntries = (record: Readonly<Record<string, number>>): Readonly<Record<string, number>> =>
  Object.fromEntries(
    Object.entries(record)
      .sort(([a], [b]) => a.localeCompare(b)),
  );

/**
 * Monoid for string->number counters.
 *
 * Identity law: combine({}, x) === canonicalSort(x) === combine(x, {})
 * Associativity law: per-key addition is associative.
 * Order stability: output keys are canonically sorted for deterministic output.
 */
export const numberRecordSumMonoid: Monoid<Readonly<Record<string, number>>> = {
  empty: {},
  combine: (a, b) => {
    const merged = Object.entries(b).reduce<Record<string, number>>(
      (acc, [key, value]) => ({
        ...acc,
        [key]: (acc[key] ?? 0) + value,
      }),
      { ...a },
    );
    return sortRecordEntries(merged);
  },
};

/** Build a product monoid for object envelopes from per-field monoids. */
export function structMonoid<T>(fields: { readonly [K in keyof T]: Monoid<T[K]> }): Monoid<T> {
  const keys = Object.keys(fields) as Array<keyof T>;

  return {
    empty: keys.reduce(
      (acc, key) => ({
        ...acc,
        [key]: fields[key].empty,
      }),
      {} as T,
    ),
    combine: (a, b) =>
      keys.reduce(
        (acc, key) => ({
          ...acc,
          [key]: fields[key].combine(a[key], b[key]),
        }),
        {} as T,
      ),
  };
}

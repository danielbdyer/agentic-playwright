/**
 * KeyedSetMonoid<T, K> — set-by-key dedup as a monoid.
 *
 * ## The pattern this names
 *
 * Many call sites accumulate values into a Map keyed by a
 * derived identity, dropping duplicates by key. Examples:
 *
 *   - workshop/probe-derivation/probe-targets.ts:deriveProbeTargets
 *     (dedups (verb, facetKind, errorFamily) triples)
 *   - dashboard/components/projection collectors that group-by-id
 *   - any "unique-by-key" accumulator
 *
 * The shape is always:
 *
 *   const seen = new Map<K, T>();
 *   for (const t of items) seen.set(keyOf(t), t);
 *   return Array.from(seen.values());
 *
 * Lifted as a monoid:
 *
 *   keyedSetMonoid({ keyOf })
 *     = { empty: new Map<K, T>(), combine: (a, b) => union by key }
 *
 * Identity laws + associativity follow from Map's set semantics.
 * Right-biased on key collision: `combine(a, b)` keeps `b`'s
 * value when both have the same key (mirrors how `Map.set`
 * overwrites).
 *
 * Pure domain — no Effect, no IO.
 */

import type { Monoid } from './monoid';

/** Construct a Monoid<ReadonlyMap<K, T>> that dedups by a
 *  caller-supplied key derivation. */
export function keyedSetMonoid<T, K>(_input: {
  readonly keyOf: (t: T) => K;
}): Monoid<ReadonlyMap<K, T>> {
  return {
    empty: new Map<K, T>(),
    combine: (a, b) => {
      // Right-biased: b wins on key collision (mirrors Map.set).
      const merged = new Map<K, T>(a);
      for (const [k, v] of b) {
        merged.set(k, v);
      }
      return merged;
    },
  };
}

/** Build a deduplicated array from a list of items, keeping the
 *  last-wins semantics keyedSetMonoid provides. Helper for the
 *  common "for ... seen.set ... values()" pattern. Pure. */
export function dedupByKey<T, K>(input: {
  readonly items: readonly T[];
  readonly keyOf: (t: T) => K;
}): readonly T[] {
  const seen = new Map<K, T>();
  for (const item of input.items) {
    seen.set(input.keyOf(item), item);
  }
  return Array.from(seen.values());
}

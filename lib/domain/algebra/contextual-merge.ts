/**
 * Contextual Lattice Merge — the named abstraction for the
 * slice → overlay → join pattern that recurs in knowledge composition.
 *
 * Every knowledge lookup follows this shape:
 *   1. Slice: select the relevant subset of a knowledge base by index key
 *   2. Overlay: layer local additions (screen-local hints, scenario overrides)
 *   3. Join: merge using the lattice's join operation (respecting confidence)
 *
 * The combinator makes the join-semilattice laws testable at the
 * abstraction level: idempotent, commutative, associative.
 *
 * @see docs/design-calculus.md § Abstraction 3: Contextual Lattice Merge
 */

import type { Lattice, BoundedLattice } from './lattice';

/**
 * A contextual merge configuration.
 *
 * @typeParam V - Value type in the knowledge base
 * @typeParam K - Index key type (e.g., screen ID, scenario ID)
 */
export interface ContextualMerge<V, K> {
  /** The lattice governing how values combine. */
  readonly lattice: Lattice<V>;
  /** Extract the index key from a value. */
  readonly index: (v: V) => K;
  /** Identity element for the merge (the lattice bottom, if bounded). */
  readonly identity: V;
}

/**
 * Slice the base collection by key, overlay with local additions, and
 * join all matching values using the lattice.
 *
 * This is the single operation that replaces the hand-rolled
 * slice + overlay + join pattern at every knowledge composition site.
 */
export function contextualMerge<V, K>(
  config: ContextualMerge<V, K>,
  base: ReadonlyArray<V>,
  overlay: ReadonlyArray<V>,
  key: K,
): V {
  const matching = [
    ...base.filter((v) => config.index(v) === key),
    ...overlay.filter((v) => config.index(v) === key),
  ];
  return matching.reduce(config.lattice.join, config.identity);
}

/**
 * Batch merge: compute the merged value for every unique key present
 * in either the base or overlay collection.
 */
export function contextualMergeAll<V, K>(
  config: ContextualMerge<V, K>,
  base: ReadonlyArray<V>,
  overlay: ReadonlyArray<V>,
): ReadonlyMap<K, V> {
  const keys = new Set<K>();
  for (const v of base) keys.add(config.index(v));
  for (const v of overlay) keys.add(config.index(v));

  const result = new Map<K, V>();
  for (const key of keys) {
    result.set(key, contextualMerge(config, base, overlay, key));
  }
  return result;
}

/**
 * Create a ContextualMerge from a BoundedLattice, using bottom as identity.
 */
export function fromBoundedLattice<V, K>(
  lattice: BoundedLattice<V>,
  index: (v: V) => K,
): ContextualMerge<V, K> {
  return { lattice, index, identity: lattice.bottom };
}

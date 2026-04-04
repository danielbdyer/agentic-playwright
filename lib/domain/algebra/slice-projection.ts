/**
 * Slice / Projection contravariance — the naturality law that connects
 * pullbacks (narrowing) with natural transformations (widening).
 *
 * The law: project(slice(S, i)) = slice(project(S), i)
 *
 * Slicing then projecting must give the same result as projecting then
 * slicing. This coherence condition is what allows lazy computation of
 * views: slice first (cheap), then project only the relevant subset.
 *
 * This module provides the types and a law-checking function to verify
 * the contravariance holds for specific projection/slice pairs.
 *
 * @see docs/design-calculus.md § Duality 3: Slice / Projection
 */

/**
 * A slice function: given total state and an index, extract the fiber.
 */
export type SliceFn<S, K, F> = (state: S, key: K) => F;

/**
 * A projection function: given truth, produce a view.
 */
export type ProjectionFn<S, V> = (state: S) => V;

/**
 * Verify the slice-projection naturality law for a specific input.
 *
 * Tests: project(slice(state, key)) === slice(project(state), key)
 *
 * This is the coherence check that guarantees views are consistent
 * regardless of operation order.
 *
 * @param sliceS - Slice on the source type
 * @param sliceV - Slice on the view type
 * @param project - Projection from source to view
 * @param projectF - Projection from fiber to view-fiber
 * @param state - The state to test
 * @param key - The key to slice by
 * @param eq - Equality check for view fibers
 */
export function verifyNaturality<S, K, FS, V, FV>(
  sliceS: SliceFn<S, K, FS>,
  sliceV: SliceFn<V, K, FV>,
  project: ProjectionFn<S, V>,
  projectF: ProjectionFn<FS, FV>,
  state: S,
  key: K,
  eq: (a: FV, b: FV) => boolean,
): boolean {
  // Path 1: slice then project
  const sliceThenProject = projectF(sliceS(state, key));
  // Path 2: project then slice
  const projectThenSlice = sliceV(project(state), key);
  return eq(sliceThenProject, projectThenSlice);
}

/**
 * Batch verify naturality across multiple keys.
 * Returns the keys that violate the law (empty = all pass).
 */
export function findNaturalityViolations<S, K, FS, V, FV>(
  sliceS: SliceFn<S, K, FS>,
  sliceV: SliceFn<V, K, FV>,
  project: ProjectionFn<S, V>,
  projectF: ProjectionFn<FS, FV>,
  state: S,
  keys: ReadonlyArray<K>,
  eq: (a: FV, b: FV) => boolean,
): ReadonlyArray<K> {
  return keys.filter(
    (key) => !verifyNaturality(sliceS, sliceV, project, projectF, state, key, eq),
  );
}

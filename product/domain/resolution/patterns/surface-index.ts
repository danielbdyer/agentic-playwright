/**
 * SurfaceIndex constructors — pure domain.
 *
 * The queryable surface canon the pattern matchers read
 * (`rung-kernel.ts SurfaceIndex`). These constructors are pure
 * (array filters over `IndexedSurface[]`), so they live in
 * `product/domain/resolution/patterns/` — the shared-contract set —
 * where both the runtime (compile pipeline) and the workshop
 * (cohort harvest, Cycle 11 / G7) can build a live index without
 * crossing the seam.
 *
 * Relocated from `product/runtime/resolution/patterns/surface-index-from-stage.ts`
 * at Cycle 11 / G7 so the cohort runner can build a SurfaceIndex
 * from a real page and run the product's own matchers against it.
 * The runtime module re-exports these for backward compatibility.
 *
 * Pure — Option used to express "no landmark present" without null.
 */

import { Option } from 'effect';
import type { IndexedSurface, SurfaceIndex } from './rung-kernel';

/** Empty SurfaceIndex — every query returns nothing. The baseline
 *  when no surface canon is wired to the stage. */
export const EMPTY_SURFACE_INDEX: SurfaceIndex = {
  findByRoleAndName: () => [],
  findByRole: () => [],
  findLandmarkByRole: () => Option.none(),
  surfacesWithin: () => [],
};

/** Build a SurfaceIndex from a flat list of surfaces.
 *
 *  `surfacesWithin` returns all surfaces in the flat index. When an
 *  interface-graph projection with ancestor containment lands, this
 *  narrows by containment; for the cohort harvest + Z11a.4b test
 *  fixtures the flat behavior is correct (the landmark-scoped
 *  matchers additionally filter by role + name). */
export function surfaceIndexFromList(surfaces: readonly IndexedSurface[]): SurfaceIndex {
  return {
    findByRoleAndName: (role, name) =>
      surfaces.filter((s) => s.role === role && s.name === name),
    findByRole: (role) => surfaces.filter((s) => s.role === role),
    findLandmarkByRole: (role) =>
      Option.fromNullable(surfaces.find((s) => s.landmarkRole === role) ?? null),
    surfacesWithin: () => surfaces,
  };
}

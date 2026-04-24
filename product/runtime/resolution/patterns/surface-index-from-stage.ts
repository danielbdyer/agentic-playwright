/**
 * SurfaceIndex derivation — Z11a.4b baseline.
 *
 * Builds the IndexedSurface query port that pattern matchers query
 * against. Today (Z11a.4b) the derivation returns an empty index
 * unless a test explicitly provides one — the plumbing from a live
 * InterfaceResolutionContext's surface canon to IndexedSurface[]
 * lands in a later slice alongside the compile-emitter wiring.
 *
 * **Why ship empty now:** the pattern-resolution strategy's
 * plumbing (registration at the `'shared-patterns'` rung, intent
 * classifier, registry walk) is independently reviewable without
 * the surface-projection code. When the projection lands, this
 * file is the single edit that activates pattern matching end-to-
 * end; the rest of the pipeline is unchanged.
 *
 * **Why a function over a Context.Tag service:** matchers run
 * inside `ResolutionStrategy.attempt()`, which returns a Promise.
 * Adding a Context.Tag here would require an Effect boundary
 * adapter mid-attempt. Keeping it a pure function call lets us
 * defer the full Effect migration (flagged as a future epic) while
 * still composing cleanly.
 *
 * Pure — no Effect imports in the production path. Option is used
 * to express "no form landmark present" without introducing null
 * into the query return type.
 */

import { Option } from 'effect';
import type { IndexedSurface, SurfaceIndex } from '../../../domain/resolution/patterns/rung-kernel';
import type { RuntimeAgentStageContext } from '../types';

/** Empty SurfaceIndex — every query returns nothing. Used as the
 *  baseline when no interface-graph-backed surface canon is wired
 *  to the stage. */
export const EMPTY_SURFACE_INDEX: SurfaceIndex = {
  findByRoleAndName: () => [],
  findByRole: () => [],
  findLandmarkByRole: () => Option.none(),
  surfacesWithin: () => [],
};

/** Build a SurfaceIndex from a list of surfaces. Test harnesses use
 *  this directly; production will pipe through
 *  `surfaceIndexFromStage` once the projection from
 *  InterfaceResolutionContext is wired. */
export function surfaceIndexFromList(surfaces: readonly IndexedSurface[]): SurfaceIndex {
  return {
    findByRoleAndName: (role, name) =>
      surfaces.filter((s) => s.role === role && s.name === name),
    findByRole: (role) => surfaces.filter((s) => s.role === role),
    findLandmarkByRole: (role) =>
      Option.fromNullable(surfaces.find((s) => s.landmarkRole === role) ?? null),
    surfacesWithin: () => surfaces,
    // `surfacesWithin` returns all surfaces in the flat index. When
    // the interface-graph projection lands, this narrows by
    // ancestor containment. For Z11a.4b the form-context-submit
    // matcher still works correctly against flat test fixtures.
  };
}

/** Derive a SurfaceIndex from the runtime stage. Z11a.4b baseline:
 *  always empty. Z11a.5 (or later) wires to
 *  `stage.context.resolutionContext`'s surface canon. */
export function surfaceIndexFromStage(_stage: RuntimeAgentStageContext): SurfaceIndex {
  return EMPTY_SURFACE_INDEX;
}

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
import {
  isInteractiveAffordance,
  rolesAdmittedBy,
  type IndexedSurface,
  type SurfaceIndex,
} from '../../../domain/resolution/patterns/rung-kernel';
import type { RuntimeAgentStageContext } from '../types';

/** Empty SurfaceIndex — every query returns nothing. Used as the
 *  baseline when no interface-graph-backed surface canon is wired
 *  to the stage. */
export const EMPTY_SURFACE_INDEX: SurfaceIndex = {
  findByRoleAndName: () => [],
  findByRole: () => [],
  findLandmarkByRole: () => Option.none(),
  surfacesWithin: () => [],
  findByPlaceholder: () => [],
  findInteractive: () => [],
};

/** Build a SurfaceIndex from a list of surfaces. Test harnesses use
 *  this directly; production will pipe through
 *  `surfaceIndexFromStage` once the projection from
 *  InterfaceResolutionContext is wired.
 *
 *  Containment is real: `surfacesWithin(a)` returns the surfaces
 *  whose `ancestors` list names `a.surfaceId`. A flat list with
 *  empty `ancestors` therefore contains nothing — landmark-scoped
 *  matchers only fire when the index declares who lives inside
 *  whom, which is exactly the signal the reality study says is
 *  100% reliable on Reactive DOM (F4). */
export function surfaceIndexFromList(surfaces: readonly IndexedSurface[]): SurfaceIndex {
  return {
    findByRoleAndName: (role, name) =>
      surfaces.filter((s) => rolesAdmittedBy(role).includes(s.role) && s.name === name),
    findByRole: (role) => surfaces.filter((s) => rolesAdmittedBy(role).includes(s.role)),
    findLandmarkByRole: (role) =>
      Option.fromNullable(surfaces.find((s) => s.landmarkRole === role) ?? null),
    surfacesWithin: (ancestor) =>
      surfaces.filter((s) => s.ancestors.includes(ancestor.surfaceId)),
    findByPlaceholder: (placeholder) =>
      surfaces.filter((s) => s.placeholder === placeholder),
    findInteractive: () => surfaces.filter((s) => isInteractiveAffordance(s.affordanceSource)),
  };
}

/** Derive a SurfaceIndex from the runtime stage. Z11a.4b baseline:
 *  always empty. Z11a.5 (or later) wires to
 *  `stage.context.resolutionContext`'s surface canon. */
export function surfaceIndexFromStage(_stage: RuntimeAgentStageContext): SurfaceIndex {
  return EMPTY_SURFACE_INDEX;
}

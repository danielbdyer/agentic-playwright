/**
 * SurfaceIndex derivation — Z11a.4b baseline.
 *
 * The pure index constructors (`EMPTY_SURFACE_INDEX`,
 * `surfaceIndexFromList`) moved to
 * `product/domain/resolution/patterns/surface-index.ts` at Cycle 11
 * / G7 (so the workshop cohort harvest can build a live index
 * without crossing the seam). This module re-exports them and keeps
 * the runtime-stage derivation, which still returns empty until the
 * interface-graph projection from `InterfaceResolutionContext`
 * lands.
 *
 * Pure — no Effect imports in the production path beyond the
 * re-exported constructors.
 */

import type { SurfaceIndex } from '../../../domain/resolution/patterns/rung-kernel';
import {
  EMPTY_SURFACE_INDEX,
  surfaceIndexFromList,
} from '../../../domain/resolution/patterns/surface-index';
import type { RuntimeAgentStageContext } from '../types';

export { EMPTY_SURFACE_INDEX, surfaceIndexFromList };

/** Derive a SurfaceIndex from the runtime stage. Z11a.4b baseline:
 *  always empty. Z11a.5 (or later) wires to
 *  `stage.context.resolutionContext`'s surface canon. */
export function surfaceIndexFromStage(_stage: RuntimeAgentStageContext): SurfaceIndex {
  return EMPTY_SURFACE_INDEX;
}


/**
 * observe classifier — rung 2 (shape + world-surface inspection).
 *
 * First-principles shape per the Step-6 F3/F4 refactor. Where the
 * prior classifier read a world-setup hook dictionary
 * (`hide-target: true`), this one reads `world.surfaces[]` — the
 * SurfaceSpec list that declares the DOM's actual axes — and
 * applies observe's classification logic axis-by-axis.
 *
 * Algorithm:
 *   1. Shape check: input.target parses (role / placeholder / text
 *      — see probe-target.ts).
 *   2. Find the surface in world.surfaces satisfying the target
 *      under the substrate's accname semantics. If absent, the
 *      fixture is inconsistent — failed/unclassified.
 *   3. If surface.detachAfterMs present, classify as timeout
 *      (element vanishes before observe can see it).
 *   4. If surface.visibility is not 'visible', classify as
 *      not-visible (display:none et al. exclude from the
 *      accessibility tree).
 *   5. Otherwise, classify as matched.
 *
 * Manifest error families (post-Step-5 Gap-1 fix):
 *   ['timeout', 'not-visible', 'unclassified'].
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';
import { isSurfaceHidden } from '../../substrate/surface-spec';
import { resolveProbeSurfaces } from '../world-resolution';
import { findSurfaceForTarget, parseProbeTarget, resolveRowScope } from '../probe-target';

function classifyObserve(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  const target = parseProbeTarget(probe.input);
  if (target === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const surfaces = resolveProbeSurfaces(probe.worldSetup);
  // Row scoping (C7): when no row carries the cell text, the verb's
  // row query is empty and the action times out — a real world
  // state rung 3 reports as timeout, not a fixture inconsistency.
  if (target.kind === 'role' && target.inRow !== undefined && resolveRowScope(surfaces, target.inRow) === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'timeout' });
  }
  const surface = findSurfaceForTarget(surfaces, target);
  if (surface === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  if (surface.detachAfterMs !== undefined) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'timeout' });
  }
  if (isSurfaceHidden(surface)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'not-visible' });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const observeClassifier: VerbClassifier = {
  verb: 'observe',
  classify: classifyObserve,
};

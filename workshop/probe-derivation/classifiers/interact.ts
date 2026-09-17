/**
 * interact classifier — rung 2 (shape + world-surface inspection).
 *
 * First-principles shape per Step-6 F4. Maps interact's four
 * declared failure families directly onto SurfaceSpec axes — no
 * hook dictionary. The classifier inspects the fixture's declared
 * surface and predicts which actionability check would fail at a
 * higher rung.
 *
 * Algorithm (mirrors the real interact verb's precondition
 * ordering):
 *   1. Shape check: input.action + a parseable input.target
 *      (role / placeholder / text — see probe-target.ts).
 *   2. Find the surface in world.surfaces satisfying the target
 *      under the substrate's accname semantics. If absent,
 *      failed/unclassified.
 *   3. detachAfterMs present → timeout (element vanishes before
 *      click/fill can act on it).
 *   4. visibility not 'visible' → not-visible.
 *   5. enabled === false → not-enabled.
 *   6. action=input + a fill-rejecting surface (textbox backed by
 *      div-with-role, or a roleless generic) → assertion-like.
 *   7. Otherwise, matched.
 *
 * Manifest error families:
 *   ['not-visible', 'not-enabled', 'timeout', 'assertion-like',
 *    'unclassified'].
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';
import {
  SURFACE_SPEC_DEFAULTS,
  isSurfaceFillRejecting,
  isSurfaceHidden,
} from '../../substrate/surface-spec';
import { resolveProbeSurfaces } from '../world-resolution';
import { findSurfaceForTarget, parseProbeTarget } from '../probe-target';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function classifyInteract(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isRecord(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const action = typeof probe.input['action'] === 'string' ? probe.input['action'] : null;
  const target = parseProbeTarget(probe.input);
  if (action === null || target === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const surface = findSurfaceForTarget(resolveProbeSurfaces(probe.worldSetup), target);
  if (surface === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }

  if (surface.detachAfterMs !== undefined) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'timeout' });
  }
  if (isSurfaceHidden(surface)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'not-visible' });
  }
  const enabled = surface.enabled ?? SURFACE_SPEC_DEFAULTS.enabled;
  if (!enabled) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'not-enabled' });
  }
  if (action === 'input' && isSurfaceFillRejecting(surface)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'assertion-like' });
  }

  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const interactClassifier: VerbClassifier = {
  verb: 'interact',
  classify: classifyInteract,
};

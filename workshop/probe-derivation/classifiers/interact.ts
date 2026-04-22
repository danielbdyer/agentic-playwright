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
 *   1. Shape check: input.action + input.target.role.
 *   2. Find the surface in world.surfaces matching (role, name).
 *      If absent, failed/unclassified.
 *   3. detachAfterMs present → timeout (element vanishes before
 *      click/fill can act on it).
 *   4. visibility not 'visible' → not-visible.
 *   5. enabled === false → not-enabled.
 *   6. action=input + surface.role=textbox + inputBacking=div-with-role
 *      → assertion-like (fill on non-input surfaces).
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
import type { SurfaceSpec } from '../../substrate/surface-spec';
import {
  SURFACE_SPEC_DEFAULTS,
  isSurfaceFillRejecting,
  isSurfaceHidden,
} from '../../substrate/surface-spec';
import { resolveProbeSurfaces } from '../world-resolution';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function extractTarget(input: unknown): { role: string; name?: string } | null {
  if (!isRecord(input)) return null;
  const target = input['target'];
  if (!isRecord(target)) return null;
  if (typeof target['role'] !== 'string') return null;
  const out: { role: string; name?: string } = { role: target['role'] };
  if (typeof target['name'] === 'string') out.name = target['name'];
  return out;
}

function extractSurfaces(world: unknown): readonly SurfaceSpec[] {
  // Delegate to the shared resolver — handles both explicit
  // surfaces lists and preset-based worlds.
  return resolveProbeSurfaces(world);
}

function findMatchingSurface(
  surfaces: readonly SurfaceSpec[],
  target: { role: string; name?: string },
): SurfaceSpec | null {
  // Recursive search — composed surfaces nest children via the
  // SurfaceSpec.children axis; the target may live at any depth.
  for (const s of surfaces) {
    if (s.role === target.role && (target.name === undefined || s.name === target.name)) {
      return s;
    }
    if (s.children !== undefined) {
      const found = findMatchingSurface(s.children, target);
      if (found !== null) return found;
    }
  }
  return null;
}

function classifyInteract(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isRecord(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const action = typeof probe.input['action'] === 'string' ? probe.input['action'] : null;
  const target = extractTarget(probe.input);
  if (action === null || target === null) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const surfaces = extractSurfaces(probe.worldSetup);
  const surface = findMatchingSurface(surfaces, target);
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

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
 *   1. Shape check: input.target has a role string.
 *   2. Find the surface in world.surfaces matching (role, name).
 *      If absent, the fixture is inconsistent — failed/unclassified.
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
import type { SurfaceSpec } from '../../substrate/surface-spec';
import { isSurfaceHidden } from '../../substrate/surface-spec';

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
  if (!isRecord(world)) return [];
  const surfaces = world['surfaces'];
  if (!Array.isArray(surfaces)) return [];
  return surfaces.filter((s): s is SurfaceSpec => isRecord(s) && typeof s['role'] === 'string');
}

function findMatchingSurface(
  surfaces: readonly SurfaceSpec[],
  target: { role: string; name?: string },
): SurfaceSpec | null {
  return (
    surfaces.find((s) => s.role === target.role && (target.name === undefined || s.name === target.name)) ??
    null
  );
}

function classifyObserve(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  const target = extractTarget(probe.input);
  if (target === null) {
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
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const observeClassifier: VerbClassifier = {
  verb: 'observe',
  classify: classifyObserve,
};

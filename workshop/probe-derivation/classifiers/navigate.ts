/**
 * navigate classifier — rung 2.
 *
 * Verifies the navigate verb's input shape and honors substrate
 * hooks for declared failure families.
 *
 * Manifest error families: ['unavailable', 'timeout', 'unclassified'].
 *
 * World hooks:
 *   world.upstream.unreachable   → unavailable
 *   world.upstream.slow          → timeout
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNavigateShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return typeof input['url'] === 'string';
}

type NavigateFailure = 'unavailable' | 'timeout';

function extractUpstreamFailure(world: unknown): NavigateFailure | null {
  if (!isRecord(world)) return null;
  const upstream = world['upstream'];
  if (!isRecord(upstream)) return null;
  if (upstream['unreachable'] === true) return 'unavailable';
  if (upstream['slow'] === true) return 'timeout';
  return null;
}

function classifyNavigate(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isNavigateShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const failure = extractUpstreamFailure(probe.worldSetup);
  if (failure !== null) {
    return Effect.succeed({ classification: 'failed', errorFamily: failure });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const navigateClassifier: VerbClassifier = {
  verb: 'navigate',
  classify: classifyNavigate,
};

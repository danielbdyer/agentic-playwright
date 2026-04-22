/**
 * intent-fetch classifier — rung 2.
 *
 * First-principles revision: reads `world.upstream.{rate-limited,
 * transport-failure, malformed-payload}` instead of the flat
 * `world-setup.simulate-*` hook keys.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_SOURCES = new Set(['ado', 'testbed', 'probe']);

function isIntentFetchShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (typeof input['source'] !== 'string') return false;
  if (!VALID_SOURCES.has(input['source'] as string)) return false;
  return typeof input['id'] === 'string';
}

type IntentFetchFailureFamily = 'rate-limited' | 'unavailable' | 'malformed-response';

function extractUpstreamFailure(world: unknown): IntentFetchFailureFamily | null {
  if (!isRecord(world)) return null;
  const upstream = world['upstream'];
  if (!isRecord(upstream)) return null;
  if (upstream['rate-limited'] === true) return 'rate-limited';
  if (upstream['transport-failure'] === true) return 'unavailable';
  if (upstream['malformed-payload'] === true) return 'malformed-response';
  return null;
}

function classifyIntentFetch(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isIntentFetchShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const failure = extractUpstreamFailure(probe.worldSetup);
  if (failure !== null) {
    return Effect.succeed({ classification: 'failed', errorFamily: failure });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const intentFetchClassifier: VerbClassifier = {
  verb: 'intent-fetch',
  classify: classifyIntentFetch,
};

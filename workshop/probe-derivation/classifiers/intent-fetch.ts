/**
 * intent-fetch classifier — shape + hook-driven (rung 2).
 *
 * Manifest error-family list: ['rate-limited', 'unavailable',
 * 'malformed-response', 'unclassified']. Three of the four have
 * named world-setup hooks the classifier honors:
 *
 *   simulate-rate-limit: true         → rate-limited
 *   simulate-transport-failure: true  → unavailable
 *   inject-malformed-payload: true    → malformed-response
 *
 * Rung 3+ replaces each hook with its real upstream condition:
 * HTTP 429 from the live endpoint, connection refused from the
 * transport, schema-break in the response payload.
 *
 * Shape: input.source must be one of 'ado' | 'testbed' | 'probe',
 * input.id must be a string. Missing → failed/unclassified.
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

function readFailureHook(worldSetup: unknown): IntentFetchFailureFamily | null {
  if (!isRecord(worldSetup)) return null;
  if (worldSetup['simulate-rate-limit'] === true) return 'rate-limited';
  if (worldSetup['simulate-transport-failure'] === true) return 'unavailable';
  if (worldSetup['inject-malformed-payload'] === true) return 'malformed-response';
  return null;
}

function classifyIntentFetch(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isIntentFetchShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const failure = readFailureHook(probe.worldSetup);
  if (failure !== null) {
    return Effect.succeed({ classification: 'failed', errorFamily: failure });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const intentFetchClassifier: VerbClassifier = {
  verb: 'intent-fetch',
  classify: classifyIntentFetch,
};

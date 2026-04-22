/**
 * locator-health-track classifier — shape-level (rung 2).
 *
 * The locator-health-track verb records an attempt outcome: the
 * input carries facet-id, strategy, and outcome (success/failure).
 * The verb's manifest declares only `unclassified` as its error
 * family because tracking an attempt IS the verb's job — a failed
 * ATTEMPT is still a successful tracking call.
 *
 * At rung 2 this classifier validates the triple shape. Valid
 * facet-id (string), valid strategy (one of the 6 locator kinds),
 * valid outcome (success/failure) → matched. Shape violations →
 * failed/unclassified.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const VALID_STRATEGIES = new Set(['role', 'label', 'placeholder', 'text', 'test-id', 'css']);

function isLocatorHealthTrackShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (typeof input['facet-id'] !== 'string') return false;
  if (typeof input['strategy'] !== 'string') return false;
  if (!VALID_STRATEGIES.has(input['strategy'] as string)) return false;
  const outcome = input['outcome'];
  return outcome === 'success' || outcome === 'failure';
}

function classifyLocatorHealthTrack(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  const observed: ProbeOutcome['observed'] = isLocatorHealthTrackShape(probe.input)
    ? { classification: 'matched', errorFamily: null }
    : { classification: 'failed', errorFamily: 'unclassified' };
  return Effect.succeed(observed);
}

export const locatorHealthTrackClassifier: VerbClassifier = {
  verb: 'locator-health-track',
  classify: classifyLocatorHealthTrack,
};

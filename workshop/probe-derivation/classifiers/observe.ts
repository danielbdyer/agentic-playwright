/**
 * observe classifier — shape + hook-driven (rung 2).
 *
 * The observe verb captures an ARIA snapshot. Manifest error-family
 * list: ['timeout', 'not-visible', 'unclassified'].
 *
 * At rung 2 the DOM is not real; the fixture encodes expected
 * behavior via world-setup hooks:
 *   - `hide-target: true` → not-visible failure.
 *   - `timeout: true` → timeout failure (no fixture today but
 *      the hook is honored if added later).
 *   - Otherwise → matched.
 *
 * Shape: input must have `surface` (object with screen + facet-kind)
 * and `target` (object with at least role). Missing shape → failed/
 * unclassified.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isObserveShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (!isRecord(input['surface'])) return false;
  const surface = input['surface'] as Record<string, unknown>;
  if (typeof surface['screen'] !== 'string') return false;
  if (typeof surface['facet-kind'] !== 'string') return false;
  if (!isRecord(input['target'])) return false;
  return typeof (input['target'] as Record<string, unknown>)['role'] === 'string';
}

function readFailureHook(worldSetup: unknown): 'not-visible' | 'timeout' | null {
  if (!isRecord(worldSetup)) return null;
  if (worldSetup['hide-target'] === true) return 'not-visible';
  if (worldSetup['timeout'] === true) return 'timeout';
  return null;
}

function classifyObserve(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isObserveShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const failure = readFailureHook(probe.worldSetup);
  if (failure !== null) {
    return Effect.succeed({ classification: 'failed', errorFamily: failure });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const observeClassifier: VerbClassifier = {
  verb: 'observe',
  classify: classifyObserve,
};

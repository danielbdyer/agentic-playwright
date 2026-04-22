/**
 * interact classifier — shape + hook-driven (rung 2).
 *
 * The interact verb dispatches a single action. Widest error surface
 * in the seed manifest: ['not-visible', 'not-enabled', 'timeout',
 * 'assertion-like', 'unclassified']. Each failure family maps to a
 * named world-setup hook the fixture encodes:
 *
 *   hide-target: true          → not-visible
 *   disable-target: true       → not-enabled
 *   detach-target-after-ms: N  → timeout (any positive number)
 *   non-input-target: true     → assertion-like
 *
 * Rung 3+ replaces each hook with a real DOM condition (hidden
 * element, disabled attribute, timing detach, role vs tag mismatch).
 *
 * Shape: input must have `action` (string), `facet-id` (string),
 * `role` (string). Actions that require a value (input/select) also
 * need `value` (string) — but shape check does not enforce that
 * because the fixtures omit it for click actions. Missing the three
 * core fields → failed/unclassified.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isInteractShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return (
    typeof input['action'] === 'string' &&
    typeof input['facet-id'] === 'string' &&
    typeof input['role'] === 'string'
  );
}

type InteractFailureFamily = 'not-visible' | 'not-enabled' | 'timeout' | 'assertion-like';

function readFailureHook(worldSetup: unknown): InteractFailureFamily | null {
  if (!isRecord(worldSetup)) return null;
  if (worldSetup['hide-target'] === true) return 'not-visible';
  if (worldSetup['disable-target'] === true) return 'not-enabled';
  if (typeof worldSetup['detach-target-after-ms'] === 'number') return 'timeout';
  if (worldSetup['non-input-target'] === true) return 'assertion-like';
  return null;
}

function classifyInteract(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isInteractShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  const failure = readFailureHook(probe.worldSetup);
  if (failure !== null) {
    return Effect.succeed({ classification: 'failed', errorFamily: failure });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const interactClassifier: VerbClassifier = {
  verb: 'interact',
  classify: classifyInteract,
};

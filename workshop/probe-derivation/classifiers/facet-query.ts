/**
 * facet-query classifier — shape-level (rung 2).
 *
 * The facet-query verb accepts a discriminated lookup: `{ by: 'id'
 * | 'intent-phrase' | 'kind'; ... }`. Its manifest error-family
 * list is `['unclassified']` only — the empty-result case is
 * classification: matched per fixture intent.
 *
 * At rung 2, this classifier validates the discriminator shape.
 * Valid `by` + corresponding selector → matched. Anything else →
 * failed/unclassified. The real verb (when implemented at Step 7)
 * will behave identically on shape — the classifier is faithful
 * to the declared contract.
 *
 * Rung 3+ (playwright-live, production) will verify behavior
 * against a real FacetCatalog; that substrate-climb is Step 6+.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFacetQueryShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  const by = input['by'];
  if (by === 'id') return typeof input['id'] === 'string';
  if (by === 'intent-phrase') return typeof input['phrase'] === 'string';
  if (by === 'kind') return typeof input['kind'] === 'string';
  return false;
}

function classifyFacetQuery(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  const observed: ProbeOutcome['observed'] = isFacetQueryShape(probe.input)
    ? { classification: 'matched', errorFamily: null }
    : { classification: 'failed', errorFamily: 'unclassified' };
  return Effect.succeed(observed);
}

export const facetQueryClassifier: VerbClassifier = {
  verb: 'facet-query',
  classify: classifyFacetQuery,
};

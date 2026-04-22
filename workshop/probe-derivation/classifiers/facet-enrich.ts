/**
 * facet-enrich classifier — rung 2.
 *
 * First-principles revision: reads `world.catalog.facet-missing`
 * instead of `world-setup.facet-missing`.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFacetEnrichShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  if (typeof input['facet-kind'] !== 'string') return false;
  if (typeof input['facet-id'] !== 'string') return false;
  return isRecord(input['evidence']);
}

function catalogFacetMissing(world: unknown): boolean {
  if (!isRecord(world)) return false;
  const catalog = world['catalog'];
  if (!isRecord(catalog)) return false;
  return catalog['facet-missing'] === true;
}

function classifyFacetEnrich(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isFacetEnrichShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  if (catalogFacetMissing(probe.worldSetup)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'assertion-like' });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const facetEnrichClassifier: VerbClassifier = {
  verb: 'facet-enrich',
  classify: classifyFacetEnrich,
};

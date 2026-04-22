/**
 * facet-enrich classifier — shape + hook-driven (rung 2).
 *
 * The facet-enrich verb appends evidence to an existing FacetRecord.
 * Manifest error-family list: ['assertion-like', 'unclassified'].
 * The assertion-like path fires when the target facet-id is missing
 * from the catalog — enrich refuses to materialize new IDs (mint is
 * the only creation path).
 *
 * At rung 2 the catalog is not real, so the fixture signals the
 * absent-id precondition via `world-setup.facet-missing: true`.
 * Rung 3+ replaces the hook with a real FacetCatalog lookup.
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

function readFacetMissingHook(worldSetup: unknown): boolean {
  return isRecord(worldSetup) && worldSetup['facet-missing'] === true;
}

function classifyFacetEnrich(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isFacetEnrichShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  if (readFacetMissingHook(probe.worldSetup)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'assertion-like' });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const facetEnrichClassifier: VerbClassifier = {
  verb: 'facet-enrich',
  classify: classifyFacetEnrich,
};

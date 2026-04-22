/**
 * facet-mint classifier — rung 2.
 *
 * First-principles revision: reads
 * `world.catalog.facet-exists-at-stable-id` instead of
 * `world-setup.id-collision`.
 */

import { Effect } from 'effect';
import type { VerbClassifier } from '../verb-classifier';
import type { Probe } from '../probe-ir';
import type { ProbeOutcome } from '../probe-receipt';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFacetMintShape(input: unknown): boolean {
  if (!isRecord(input)) return false;
  return (
    typeof input['facet-kind'] === 'string' &&
    typeof input['stable-id'] === 'string' &&
    typeof input['display-name'] === 'string' &&
    typeof input['minting-instrument'] === 'string'
  );
}

function catalogIdCollides(world: unknown): boolean {
  if (!isRecord(world)) return false;
  const catalog = world['catalog'];
  if (!isRecord(catalog)) return false;
  return catalog['facet-exists-at-stable-id'] === true;
}

function classifyFacetMint(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isFacetMintShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  if (catalogIdCollides(probe.worldSetup)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'assertion-like' });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const facetMintClassifier: VerbClassifier = {
  verb: 'facet-mint',
  classify: classifyFacetMint,
};

/**
 * facet-mint classifier — shape + hook-driven (rung 2).
 *
 * The facet-mint verb mints a new FacetRecord atomically. Manifest
 * error-family list (post-Gap-1 fix): ['assertion-like',
 * 'unclassified']. The assertion-like path fires when the stable-id
 * pre-image collides with an existing catalog entry.
 *
 * At rung 2 the catalog state is not real, so the fixture signals
 * the collision precondition via `world-setup.id-collision: true`.
 * Rung 3+ replaces the hook with a real FacetCatalog load.
 *
 * Classification logic:
 *   - Invalid shape → failed/unclassified.
 *   - Valid shape + world-setup.id-collision=true → failed/assertion-like.
 *   - Valid shape + no simulated failure → matched/null.
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

function readIdCollisionHook(worldSetup: unknown): boolean {
  return isRecord(worldSetup) && worldSetup['id-collision'] === true;
}

function classifyFacetMint(probe: Probe): Effect.Effect<ProbeOutcome['observed'], Error, never> {
  if (!isFacetMintShape(probe.input)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'unclassified' });
  }
  if (readIdCollisionHook(probe.worldSetup)) {
    return Effect.succeed({ classification: 'failed', errorFamily: 'assertion-like' });
  }
  return Effect.succeed({ classification: 'matched', errorFamily: null });
}

export const facetMintClassifier: VerbClassifier = {
  verb: 'facet-mint',
  classify: classifyFacetMint,
};

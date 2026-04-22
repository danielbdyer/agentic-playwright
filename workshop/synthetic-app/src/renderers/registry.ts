/**
 * Default FacetRendererRegistry for the synthetic substrate.
 *
 * Scope 6.1a ships with ZERO registered renderers — the bootstrap
 * mounts the SubstrateRenderer which surfaces "missing renderer"
 * DOM markers for every facet a probe references. That's the
 * seam-proof baseline. Scope 6.1b populates the registry with the
 * four leaf renderers the current fixture set references.
 *
 * The emptiness mirrors the 6.1c commit pattern for the classifier
 * registry — port first, content next. Reviewers can judge the
 * registry shape without wading through renderer internals.
 */

import {
  facetRendererRegistry,
  type FacetRendererRegistry,
} from '../../../substrate/facet-renderer';

export function createDefaultFacetRendererRegistry(): FacetRendererRegistry {
  return facetRendererRegistry([]);
}

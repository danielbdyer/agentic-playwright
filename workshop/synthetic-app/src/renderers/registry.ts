/**
 * Default FacetRendererRegistry for the synthetic substrate.
 *
 * Registered renderers (one per fixture-referenced facet):
 *   - policy-search:searchButton
 *   - policy-search:advancedOptionsButton
 *   - policy-search:policyNumberInput
 *   - policy-search:freeformRegion
 *
 * Each renderer lives in its own file under `./` for symmetry
 * with the catalog's facet-identity vocabulary. When future
 * fixtures reference new facets, their renderers land one file
 * at a time alongside their registrations here.
 *
 * This registry instance is the substrate-version surface per
 * memo §8.6. Adding a renderer is additive; changing a
 * renderer's behavior is substrate drift — the rung-3 parity
 * law surfaces the divergence against fixture-replay.
 */

import {
  facetRendererRegistry,
  type FacetRendererRegistry,
} from '../../../substrate/facet-renderer';
import { searchButtonRenderer } from './policy-search-search-button';
import { advancedOptionsButtonRenderer } from './policy-search-advanced-options-button';
import { policyNumberInputRenderer } from './policy-search-policy-number-input';
import { freeformRegionRenderer } from './policy-search-freeform-region';

export function createDefaultFacetRendererRegistry(): FacetRendererRegistry {
  return facetRendererRegistry([
    searchButtonRenderer,
    advancedOptionsButtonRenderer,
    policyNumberInputRenderer,
    freeformRegionRenderer,
  ]);
}

/**
 * FacetRenderer registry — structural laws.
 *
 * Pins the substrate's rendering port invariants. The shape
 * mirrors VerbClassifierRegistry's laws (C1–C4) because the
 * registry pattern is the same — a name-keyed map with empty
 * identity, retrievability, null on miss, and later-wins on
 * duplicate entries.
 *
 *   R1. Empty registry has no renderers.
 *   R2. A registered renderer is retrievable by facetId.
 *   R3. An unregistered facetId returns null (not undefined, not
 *       throw). The synthetic app surfaces this as a loud DOM
 *       marker rather than silent skip.
 *   R4. Duplicate facetId entries: later wins.
 */

import { describe, test, expect } from 'vitest';
import { createElement } from 'react';
import type { FC } from 'react';
import {
  EMPTY_RENDERER_REGISTRY,
  facetRendererRegistry,
  lookupFacetRenderer,
  type FacetRenderer,
  type FacetRendererProps,
} from '../../workshop/substrate/facet-renderer';

function stubRenderer(facetId: string, testId: string): FacetRenderer {
  const Component: FC<FacetRendererProps> = () =>
    createElement('div', { 'data-testid': testId });
  return { facetId, Component };
}

describe('FacetRenderer registry laws', () => {
  test('R1: empty registry has no renderers', () => {
    const empty = facetRendererRegistry([]);
    expect(empty.renderers.size).toBe(0);
    expect(EMPTY_RENDERER_REGISTRY.renderers.size).toBe(0);
  });

  test('R2: a registered renderer is retrievable by facetId', () => {
    const registry = facetRendererRegistry([
      stubRenderer('policy-search:searchButton', 'search'),
    ]);
    const found = lookupFacetRenderer(registry, 'policy-search:searchButton');
    expect(found).not.toBeNull();
    expect(found?.facetId).toBe('policy-search:searchButton');
  });

  test('R3: unregistered facetId returns null', () => {
    const registry = facetRendererRegistry([
      stubRenderer('policy-search:searchButton', 'search'),
    ]);
    expect(lookupFacetRenderer(registry, 'policy-search:missing')).toBeNull();
    expect(lookupFacetRenderer(EMPTY_RENDERER_REGISTRY, 'anything')).toBeNull();
  });

  test('R4: duplicate facetId — later wins', () => {
    const first = stubRenderer('policy-search:searchButton', 'first');
    const second = stubRenderer('policy-search:searchButton', 'second');
    const registry = facetRendererRegistry([first, second]);
    const found = lookupFacetRenderer(registry, 'policy-search:searchButton');
    expect(found).toBe(second);
  });
});

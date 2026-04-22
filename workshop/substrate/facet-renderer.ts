/**
 * FacetRenderer — the substrate's rendering port.
 *
 * The substrate equation is `(WorldConfig, FacetRendererRegistry)
 * → DOM`. This module declares the registry side of that equation:
 * each facet in the catalog has exactly one renderer — a React
 * component that produces the facet's canonical DOM under a set of
 * world-setup hooks. The registry keys by facet stable-id, the
 * same key the manifest uses.
 *
 * ## Why per-facet, not per-screen (today)
 *
 * Per the Step-6 first-principles redesign, facets are the atomic
 * unit of the substrate's rendering. Screens are emergent — a
 * screen is a preset composition of facet world-specs. Per-facet
 * renderers are symmetric with the catalog's stable-id vocabulary
 * and compose naturally into screens.
 *
 * ## Screen-level composition (future)
 *
 * The registry's shape admits a future extension where a
 * "screen renderer" registers under a scope ID and expands into a
 * set of facet world-specs before rendering. That extension is
 * deferred — today every entry is a leaf facet renderer. Per the
 * Step-6 sign-off, the next entropy surface is screen-level
 * composition; the current port does not block that direction.
 *
 * ## Hooks are opaque at the registry level
 *
 * Each FacetRenderer narrows `hooks: Record<string, unknown>` to
 * its own hook interface at consumption. The registry itself
 * carries the general shape; renderer implementations parse and
 * validate. Unknown hook keys are silently ignored — forward-
 * compatible with new hooks landing in later fixtures.
 *
 * ## Substrate-version surface
 *
 * The registry IS the substrate version surface per memo §8.6.
 * Adding a renderer is additive; changing a renderer's behavior
 * is substrate drift. Memo §8.6's parity gate catches the latter.
 *
 * Pure port — no IO, no Effect. The only non-type React dependency
 * is the ReactElement return type for renderer props.
 */

import type { FC } from 'react';
import type { FacetId } from './world-config';

/** The render-props a FacetRenderer's Component accepts. Hooks are
 *  opaque at the port level; each renderer narrows to its own
 *  hook shape internally. */
export interface FacetRendererProps {
  readonly hooks: Readonly<Record<string, unknown>>;
}

/** One facet's renderer. A pure function of hooks → ReactElement.
 *  The Component may use React hooks internally (useState/effect)
 *  as long as the render stays deterministic — two Components
 *  mounted with the same hooks must yield the same DOM. */
export interface FacetRenderer {
  /** Stable facet identity — same as the manifest's. */
  readonly facetId: FacetId;
  /** The React component. */
  readonly Component: FC<FacetRendererProps>;
}

/** The registry: a name-keyed map of renderers. Mirrors
 *  VerbClassifierRegistry's shape — lookups are O(1) over a
 *  readonly map. */
export interface FacetRendererRegistry {
  readonly renderers: ReadonlyMap<FacetId, FacetRenderer>;
}

/** Build a registry from a list of renderers. Later entries win
 *  on duplicate facetId — callers can merge host-specific
 *  extensions on top of a base registry. */
export function facetRendererRegistry(
  renderers: readonly FacetRenderer[],
): FacetRendererRegistry {
  const map = new Map<FacetId, FacetRenderer>();
  for (const r of renderers) map.set(r.facetId, r);
  return { renderers: map };
}

/** Look up a renderer by facet ID. Returns null when unregistered;
 *  the SubstrateRenderer surfaces this as a loud DOM marker so
 *  missing renderers are legible rather than silent. */
export function lookupFacetRenderer(
  registry: FacetRendererRegistry,
  facetId: FacetId,
): FacetRenderer | null {
  return registry.renderers.get(facetId) ?? null;
}

/** The empty registry — baseline for tests and composition roots
 *  that extend with their own renderers. */
export const EMPTY_RENDERER_REGISTRY: FacetRendererRegistry = {
  renderers: new Map(),
};

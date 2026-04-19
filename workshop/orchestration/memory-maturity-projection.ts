/**
 * Memory-maturity projection — bridges the pure `MemoryMaturity` domain
 * module to the application-layer `WorkspaceCatalog`.
 *
 * Pure projection: `WorkspaceCatalog` → `MemoryMaturityCounts`. No Effect,
 * no IO, no mutation. The caller decides when to compute (typically once
 * per scorecard write at the end of an iteration).
 */

import type { WorkspaceCatalog } from '../../product/application/catalog/types';
import {
  computeMemoryMaturity,
  emptyMemoryMaturityCounts,
  type MemoryMaturity,
  type MemoryMaturityCounts,
} from '../metrics/memory-maturity';

/**
 * Count approved knowledge entries from a catalog. Pure.
 *
 * Approved entries:
 *   - elements: every element in every screen bundle that has at least
 *     one alias OR a non-null role (i.e. not just an empty placeholder)
 *   - patterns: every promoted pattern document (presence implies promotion;
 *     screen-local hints are NOT counted here — only patterns are
 *     post-promotion shared canon)
 *   - routes: every route variant with a non-empty url or pathTemplate
 */
export function projectMemoryMaturityCounts(catalog: WorkspaceCatalog): MemoryMaturityCounts {
  const approvedElements = Object.values(catalog.screenBundles).reduce<number>(
    (sum, bundle) => sum + countApprovedElements(bundle),
    0,
  );
  const promotedPatterns = catalog.patternDocuments.length + catalog.behaviorPatterns.length;
  const approvedRouteVariants = catalog.routeManifests.reduce<number>(
    (sum, entry) => sum + countApprovedRouteVariants(entry.artifact.routes),
    0,
  );
  return {
    approvedElements,
    promotedPatterns,
    approvedRouteVariants,
  };
}

/** Convenience: compose projection + computation. */
export function projectMemoryMaturity(catalog: WorkspaceCatalog): MemoryMaturity {
  return computeMemoryMaturity(projectMemoryMaturityCounts(catalog));
}

/** Returns the empty baseline when no catalog is available (cold start). */
export function emptyCounts(): MemoryMaturityCounts {
  return emptyMemoryMaturityCounts;
}

// ─── Internal helpers ─────────────────────────────────────────────

interface BundleLike {
  readonly elements?: { readonly artifact: { readonly elements: Readonly<Record<string, unknown>> } };
}

function countApprovedElements(bundle: BundleLike): number {
  const elementMap = bundle.elements?.artifact.elements ?? {};
  return Object.values(elementMap).reduce<number>((sum, element) => sum + (isApprovedElement(element) ? 1 : 0), 0);
}

interface ElementLike {
  readonly aliases?: readonly unknown[];
  readonly role?: string | null | undefined;
  readonly affordance?: string | null | undefined;
}

function isApprovedElement(element: unknown): element is ElementLike {
  if (typeof element !== 'object' || element === null) return false;
  const e = element as ElementLike;
  const hasAliases = Array.isArray(e.aliases) && e.aliases.length > 0;
  const hasRole = typeof e.role === 'string' && e.role.length > 0;
  return hasAliases || hasRole;
}

interface RouteLike {
  readonly variants?: readonly RouteVariantLike[];
}

interface RouteVariantLike {
  readonly url?: string | null | undefined;
  readonly pathTemplate?: string | null | undefined;
}

function countApprovedRouteVariants(routes: readonly RouteLike[] | undefined): number {
  return (routes ?? []).reduce<number>(
    (sum, route) =>
      sum + (route.variants ?? []).reduce<number>(
        (variantSum, variant) =>
          variantSum + (isApprovedRouteVariant(variant) ? 1 : 0),
        0,
      ),
    0,
  );
}

function isApprovedRouteVariant(variant: RouteVariantLike): boolean {
  const hasUrl = typeof variant.url === 'string' && variant.url.length > 0;
  const hasTemplate = typeof variant.pathTemplate === 'string' && variant.pathTemplate.length > 0;
  return hasUrl || hasTemplate;
}

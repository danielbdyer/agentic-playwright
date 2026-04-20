/**
 * Stable facet ID — the immutable address of a facet within the
 * product's catalog.
 *
 * The ID shape is `<screen>:<elementOrConcept>` and is chosen once at
 * mint time; it survives every subsequent rename of the
 * `displayName` or alias set. When a facet needs to be renamed in
 * spirit (the underlying element really did change), the mechanism
 * is an `id-migration` event recorded in the evidence log — NEVER
 * an in-place ID edit.
 *
 * See `docs/v2-direction.md §6 Step 3` for the rationale.
 *
 * Pure domain — no Effect, no IO.
 */

/** Nominal type for a stable facet identifier. The colon is
 *  structural: the first segment is the screen ID, the second is
 *  the element or concept ID within that screen. */
export type FacetId = string & { readonly __brand: 'FacetId' };

/** Parsed shape of a stable ID. */
export interface ParsedFacetId {
  readonly screen: string;
  readonly elementOrConcept: string;
}

/** Construct a FacetId from components. Validates shape; throws on
 *  empty segments or stray colons. */
export function facetIdFrom(screen: string, elementOrConcept: string): FacetId {
  if (screen.length === 0 || elementOrConcept.length === 0) {
    throw new Error('facetIdFrom: both segments must be non-empty');
  }
  if (screen.includes(':') || elementOrConcept.includes(':')) {
    throw new Error(`facetIdFrom: ":" is the segment separator and cannot appear inside "${screen}:${elementOrConcept}"`);
  }
  return `${screen}:${elementOrConcept}` as FacetId;
}

/** Parse a FacetId back into its components. Returns null when the
 *  shape is malformed — the catalog loader uses this to defensively
 *  reject stale or hand-edited entries. */
export function parseFacetId(id: string): ParsedFacetId | null {
  const parts = id.split(':');
  if (parts.length !== 2) return null;
  const [screen, elementOrConcept] = parts as [string, string];
  if (screen.length === 0 || elementOrConcept.length === 0) return null;
  return { screen, elementOrConcept };
}

/** Treat an arbitrary string as a FacetId without validation. Use
 *  sparingly — prefer `facetIdFrom` at construction sites. This
 *  exists for loaders that have already validated at a higher
 *  level. */
export function unsafeCastFacetId(id: string): FacetId {
  return id as FacetId;
}

// ─── Immutability contract ──────────────────────────────────────

/** A recorded rename event. Written to the evidence log when a
 *  facet's underlying element actually shifted. The old `FacetId`
 *  stays queryable; the new `FacetId` takes over as the active
 *  record. NEVER carry this as a mutation on the facet itself. */
export interface FacetIdMigration {
  readonly kind: 'facet-id-migration';
  readonly from: FacetId;
  readonly to: FacetId;
  readonly reason: 'element-renamed-upstream' | 'disambiguation' | 'taxonomy-revision';
  readonly rationale: string;
  readonly recordedAt: string;
  readonly recordedBy: 'operator' | 'agent';
}

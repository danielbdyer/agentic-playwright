/**
 * FacetRecord — the unified shape the product's catalog stores.
 *
 * Per `docs/v2-direction.md §6 Step 3`, this replaces v1's
 * split-across-two-files pattern (`*.elements.yaml` + `*.hints.yaml`)
 * with a single record per facet. Locator health co-locates on the
 * record; provenance is atomic-at-mint; the ID is stable across
 * rename events (see `stable-id.ts`).
 *
 * This is the L1 memory substrate's canonical shape. Mint /
 * query / enrich implementations land at Step 7; Step 3 ships the
 * shape plus the frozen-signature manifest entries that let
 * downstream steps reason against it.
 *
 * Pure domain — no Effect, no IO.
 */

import type { FacetId } from './stable-id';
import type { FacetExtension, FacetKind } from './kind-extensions';
import type { FacetProvenance } from './provenance';

/** Scope classifier: whether a facet is global to the app or
 *  bound to a specific screen surface. Cross-screen facets
 *  (e.g., the app's global header-search) use `'cross-screen'`. */
export type FacetScope = 'screen-local' | 'cross-screen';

/** The unified facet record. Every canonical catalog entry has
 *  this exact shape; kind-specific fields live in `extension`. */
export interface FacetRecord {
  /** Stable, immutable identifier. See `stable-id.ts`. */
  readonly id: FacetId;
  /** Which kind of facet — drives the extension shape. */
  readonly kind: FacetKind;
  /** Human-legible name shown in review surfaces and dashboards.
   *  Mutable via proposal-gated revision. */
  readonly displayName: string;
  /** Alternative names the agent has observed users and QA teams
   *  using for this facet. Ordered by evidence count (descending);
   *  the head is the canonical phrasing for intent-parse. */
  readonly aliases: readonly string[];
  /** Scope classifier. */
  readonly scope: FacetScope;
  /** Kind-specific extension carrying the interesting shape. */
  readonly extension: FacetExtension;
  /** Confidence is DERIVED on read from the evidence log. The
   *  stored value is the last computed confidence at the last
   *  write — consumers that need fresh confidence re-derive. */
  readonly confidence: number;
  /** Atomic-at-mint provenance header. */
  readonly provenance: FacetProvenance;
  /** Relative path (repo-root) to this facet's append-only
   *  evidence log. The log is the source of truth for confidence
   *  derivation; the stored `confidence` field is cache. */
  readonly evidenceLogPath: string;
}

/** Type guard narrowing by kind. Returns true when the record's
 *  `extension` has the matching kind. */
export function isFacetOfKind<K extends FacetKind>(
  record: FacetRecord,
  kind: K,
): record is FacetRecord & { readonly extension: Extract<FacetExtension, { kind: K }> } {
  return record.extension.kind === kind;
}

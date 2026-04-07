/**
 * MemoryMaturity — operational definition of `MemoryMaturity(τ)` from the
 * temporal-epistemic addendum.
 *
 * The addendum's compounding-economics obligations (C1–C6, M5) presuppose
 * a maturity scalar that can be compared across cohorts in time. Without
 * a concrete definition every C-property is unfalsifiable in practice.
 *
 * Definition (operational):
 *
 *     M(τ) := log2(1 + |approved knowledge entries at τ|)
 *
 * where "approved knowledge entries" counts:
 *   - elements   : sum of `screen × element` pairs across screen bundles
 *   - patterns   : count of promoted shared patterns
 *   - routes     : sum of `route × variant` pairs across route manifests
 *
 * Logarithm because compounding intuition is multiplicative-in-substrate
 * but additive-in-leverage. `log2(1 + N)` keeps `M(0) = 0` and avoids
 * `-Infinity` on the first run.
 *
 * This module is pure domain — no Effect, no IO, no application imports.
 * The application-layer projection (`memory-maturity-projection.ts`) is
 * the only thing that touches a catalog.
 */

declare const MemoryMaturityBrand: unique symbol;

/**
 * Branded scalar for `M(τ)`. Operations that compare or fold maturity
 * values must accept this branded form so intent is type-visible.
 */
export type MemoryMaturity = number & { readonly [MemoryMaturityBrand]: 'memory-maturity' };

/** Audited mint — only constructors in this module can produce a MemoryMaturity. */
function mintMemoryMaturity(value: number): MemoryMaturity {
  return value as MemoryMaturity;
}

/**
 * Counts of the approved-knowledge primitives that contribute to maturity.
 * Pure structural input; the application layer projects a `WorkspaceCatalog`
 * into this shape.
 */
export interface MemoryMaturityCounts {
  readonly approvedElements: number;
  readonly promotedPatterns: number;
  readonly approvedRouteVariants: number;
}

/** Empty counts — useful as fold identity and as the t=0 baseline. */
export const emptyMemoryMaturityCounts: MemoryMaturityCounts = {
  approvedElements: 0,
  promotedPatterns: 0,
  approvedRouteVariants: 0,
};

/**
 * Compute `M(τ)` from a counts record. Pure.
 *
 *   M(empty) === 0
 *   M({...,approvedElements: 1}) === log2(2) === 1
 *   M({...,approvedElements: 3}) === log2(4) === 2
 *   doubling the total entry count adds exactly 1 to M.
 */
export function computeMemoryMaturity(counts: MemoryMaturityCounts): MemoryMaturity {
  const totalEntries = counts.approvedElements + counts.promotedPatterns + counts.approvedRouteVariants;
  return mintMemoryMaturity(Math.log2(1 + totalEntries));
}

/** Total entry count — useful for raw display alongside the log-scale value. */
export function memoryMaturityEntryCount(counts: MemoryMaturityCounts): number {
  return counts.approvedElements + counts.promotedPatterns + counts.approvedRouteVariants;
}

/** Compare two maturity values. Pure. */
export function compareMaturity(a: MemoryMaturity, b: MemoryMaturity): -1 | 0 | 1 {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** Maturity at t=0 (zero approved entries). Useful as the cold-start baseline. */
export const ZERO_MATURITY: MemoryMaturity = mintMemoryMaturity(0);

/**
 * Difference between two maturity values, expressed as a number.
 * Positive means `later` is more mature than `earlier`.
 */
export function maturityDelta(earlier: MemoryMaturity, later: MemoryMaturity): number {
  return later - earlier;
}

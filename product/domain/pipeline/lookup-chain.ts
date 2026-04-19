/**
 * Lookup chain interface — pure types for qualifier-aware artifact
 * resolution.
 *
 * Per the canon-and-derivation doctrine § 6 The lookup precedence
 * chain and § 6.6 Qualifier-aware lookup, every consumer of a
 * canonical artifact reads through the lookup chain. The chain
 * walks six slots in precedence order during the reference-canon
 * transition:
 *
 *   1. operator-override         (slot 1, canonical source)
 *   2. agentic-override          (slot 2, canonical artifact)
 *   3. deterministic-observation (slot 3, canonical artifact)
 *   4. reference-canon           (slot 4, TRANSITIONAL pre-gate fallback)
 *   5. live-derivation           (slot 5, derived cache)
 *   6. cold-derivation           (slot 6, runs the discovery engine)
 *
 * Slot 4 retires when the reference-canon population is empty
 * (see canon-and-derivation § 14.0 for the graduation condition);
 * at that point the chain collapses back to five slots.
 *
 * Lookups can skip slot 4 via the optional `skipReferenceCanon`
 * flag on the input — this is the measurement-discipline mode
 * that answers "how much of my hit rate comes from real canon
 * versus pre-gate fallback?" The delta between a default warm
 * run and a warm run under `skipReferenceCanon` is the measurable
 * migration debt.
 *
 * When called with a QualifierBag, the chain runs in two passes:
 *   pass 1 — atom resolution
 *   pass 2 — projection application (filter by role / state / flag)
 *
 * This module defines the PURE TYPED INTERFACE the application
 * layer implements. The actual implementation lives in
 * `product/application/pipeline/` (Phase 0b.2) and integrates with the
 * existing WorkspaceCatalog and PipelineStage runner.
 *
 * Pure domain — no Effect, no IO, no application imports. This
 * file exists so type-only consumers (other domain modules, the
 * promotion gate, the law tests) can refer to the lookup contract
 * without depending on the application implementation.
 */

import type { Atom } from './atom';
import type { Composition } from './composition';
import type { Projection } from './projection';
import type { AtomClass, AtomAddressOf } from './atom-address';
import type { CompositionSubType, CompositionAddressOf } from './composition-address';
import type { ProjectionSubType, ProjectionAddressOf } from './projection-address';
import type { QualifierBag, AtomApplicability } from './qualifier';
import type { PhaseOutputSource } from './source';

// ─── Lookup mode ─────────────────────────────────────────────────

/** Which slots of the precedence chain to consult. The default mode
 *  is `'warm'` which walks the full chain (slots 1–6 in order).
 *  Other modes deliberately skip slots to test the discovery engine
 *  or to challenge the cache.
 *
 *  Orthogonal to mode is the `skipReferenceCanon` flag (see
 *  `LookupInput` below), which additionally skips slot 4 regardless
 *  of the chosen mode. The combination `mode: 'warm' +
 *  skipReferenceCanon: true` is the migration-debt measurement. */
export type LookupMode =
  | 'warm'      // walk slots 1–6 in order (the default)
  | 'cold'      // skip slots 3, 4, and 5; respect operator/agentic overrides; run discovery
  | 'compare'   // walk to slot 3, ALSO run discovery, return both for diff
  | 'no-overrides'; // skip slots 1 and 2; trust only deterministic/reference/derived

// ─── Lookup result shape ─────────────────────────────────────────

/** The result of a lookup call. Carries the resolved artifact (when
 *  found) along with metadata about which slot returned it and how
 *  the chain walked. */
export interface LookupResult<A> {
  /** The resolved artifact, or null when no slot returned a value. */
  readonly resolved: A | null;
  /** Which source slot returned the artifact. Null when not found. */
  readonly winningSource: PhaseOutputSource | null;
  /** All slots consulted, in order. Useful for debugging and for
   *  the compare mode which collects multiple results. */
  readonly slotsConsulted: readonly PhaseOutputSource[];
  /** When the qualifier bag was non-empty AND the resolved artifact
   *  is an atom, this is the projection-applied applicability for
   *  the atom under the qualifier. Null when no projections were
   *  applied. */
  readonly qualifiedApplicability?: AtomApplicability | null;
  /** When the lookup mode is `'compare'`, this carries the
   *  cold-derivation result alongside the warm result. */
  readonly compareCandidate?: A | null;
}

// ─── The lookup chain interface ──────────────────────────────────

/** The pure typed contract for the lookup chain. The application
 *  layer implements this with Effect-based IO; consumers depend on
 *  this interface so they can be tested with stub implementations.
 *
 *  Every lookup call accepts an optional `skipReferenceCanon` flag
 *  that additionally skips slot 4 regardless of the chosen `mode`.
 *  A warm run with `skipReferenceCanon: true` produces the hit rate
 *  you'd get from real canonical artifacts alone; the delta against
 *  a default warm run is the migration-debt signal. */
export interface LookupChain {
  /** Resolve a Tier 1 atom by typed address. */
  lookupAtom<C extends AtomClass>(input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
    readonly qualifiers?: QualifierBag;
  }): Promise<LookupResult<Atom<C, unknown, PhaseOutputSource>>>;

  /** Resolve a Tier 2 composition by typed address. */
  lookupComposition<S extends CompositionSubType>(input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  }): Promise<LookupResult<Composition<S, unknown, PhaseOutputSource>>>;

  /** Resolve a Tier 3 projection by typed address. */
  lookupProjection<S extends ProjectionSubType>(input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  }): Promise<LookupResult<Projection<S, PhaseOutputSource>>>;
}

// ─── Default mode constant ───────────────────────────────────────

export const DEFAULT_LOOKUP_MODE: LookupMode = 'warm';

// ─── Mode predicates (pure) ──────────────────────────────────────

/** True when the mode consults canonical sources (slot 1) and
 *  agentic overrides (slot 2). False for modes that skip overrides. */
export function modeRespectsOverrides(mode: LookupMode): boolean {
  return mode === 'warm' || mode === 'cold' || mode === 'compare';
}

/** True when the mode consults the deterministic observation slot
 *  (slot 3). False for cold modes that skip the canonical artifact. */
export function modeConsultsDeterministicObservations(mode: LookupMode): boolean {
  return mode === 'warm' || mode === 'compare' || mode === 'no-overrides';
}

/** True when the mode consults the reference canon slot (slot 4).
 *  Reference canon is the transitional pre-gate fallback; modes that
 *  run a cold challenge (`'cold'`, `'compare'`) skip it to avoid
 *  contaminating the discovery measurement.
 *
 *  The optional `skipReferenceCanon` flag lets the caller ALSO skip
 *  slot 4 regardless of mode — set it to true to measure "real canon
 *  hit rate" vs. "warm-with-reference-canon hit rate." The delta is
 *  the migration debt. */
export function modeConsultsReferenceCanon(
  mode: LookupMode,
  skipReferenceCanon?: boolean,
): boolean {
  if (skipReferenceCanon === true) return false;
  return mode === 'warm' || mode === 'no-overrides';
}

/** True when the mode runs the discovery engine (slot 6). True for
 *  cold and compare modes that exercise discovery directly. */
export function modeRunsDiscovery(mode: LookupMode): boolean {
  return mode === 'cold' || mode === 'compare' || mode === 'no-overrides';
}

/** True when the mode consults the live cache (slot 5). False for
 *  cold modes that bypass the cache to challenge discovery. */
export function modeConsultsLiveCache(mode: LookupMode): boolean {
  return mode === 'warm' || mode === 'no-overrides';
}

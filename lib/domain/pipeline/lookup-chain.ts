/**
 * Lookup chain interface — pure types for qualifier-aware artifact
 * resolution.
 *
 * Per the canon-and-derivation doctrine § 6 The lookup precedence
 * chain and § 6.6 Qualifier-aware lookup, every consumer of a
 * canonical artifact reads through the lookup chain. The chain
 * walks five slots in precedence order:
 *
 *   1. operator-override         (slot 1, canonical source)
 *   2. agentic-override          (slot 2, canonical artifact)
 *   3. deterministic-observation (slot 3, canonical artifact)
 *   4. live-derivation           (slot 4, derived cache)
 *   5. cold-derivation           (slot 5, runs the discovery engine)
 *
 * When called with a QualifierBag, the chain runs in two passes:
 *   pass 1 — atom resolution
 *   pass 2 — projection application (filter by role / state / flag)
 *
 * This module defines the PURE TYPED INTERFACE the application
 * layer implements. The actual implementation lives in
 * `lib/application/pipeline/` (Phase 0b.2) and integrates with the
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
 *  is `'warm'` which walks the full chain. Other modes deliberately
 *  skip slots to test the discovery engine or to challenge the
 *  cache. */
export type LookupMode =
  | 'warm'      // walk slots 1-5 in order (the default)
  | 'cold'      // skip slots 3 and 4; respect operator/agentic overrides; run discovery
  | 'compare'   // walk to slot 3, ALSO run discovery, return both for diff
  | 'no-overrides'; // skip slots 1 and 2; trust only deterministic/derived

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
 *  this interface so they can be tested with stub implementations. */
export interface LookupChain {
  /** Resolve a Tier 1 atom by typed address. */
  lookupAtom<C extends AtomClass>(input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly qualifiers?: QualifierBag;
  }): Promise<LookupResult<Atom<C, unknown, PhaseOutputSource>>>;

  /** Resolve a Tier 2 composition by typed address. */
  lookupComposition<S extends CompositionSubType>(input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
  }): Promise<LookupResult<Composition<S, unknown, PhaseOutputSource>>>;

  /** Resolve a Tier 3 projection by typed address. */
  lookupProjection<S extends ProjectionSubType>(input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
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

/** True when the mode runs the discovery engine (slot 5). True for
 *  cold and compare modes that exercise discovery directly. */
export function modeRunsDiscovery(mode: LookupMode): boolean {
  return mode === 'cold' || mode === 'compare' || mode === 'no-overrides';
}

/** True when the mode consults the live cache (slot 4). False for
 *  cold modes that bypass the cache to challenge discovery. */
export function modeConsultsLiveCache(mode: LookupMode): boolean {
  return mode === 'warm' || mode === 'no-overrides';
}

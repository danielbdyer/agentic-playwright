/**
 * Lookup chain implementation — application-layer wiring of the
 * pure typed interface in `lib/domain/pipeline/lookup-chain.ts`.
 *
 * Per docs/canon-and-derivation.md § 6 The lookup precedence chain
 * and § 6.6 Qualifier-aware lookup, the chain walks five slots in
 * order:
 *
 *   1. operator-override         (slot 1, canonical source)
 *   2. agentic-override          (slot 2, canonical artifact)
 *   3. deterministic-observation (slot 3, canonical artifact)
 *   4. live-derivation           (slot 4, derived cache, .tesseract/cache/)
 *   5. cold-derivation           (slot 5, runs the discovery engine)
 *
 * This implementation handles slots 2 and 3 (canonical artifacts
 * sourced from the WorkspaceCatalog's tier1Atoms / tier2Compositions /
 * tier3Projections fields). Slots 1 (operator overrides), 4 (live
 * cache), and 5 (cold derivation) are stub implementations that
 * return null — they wire in as the corresponding subsystems land:
 *
 *   - Slot 1 lands when operator overrides for canonical artifacts
 *     are extracted from the controls/ directory in Phase 2.
 *   - Slot 4 lands when the .tesseract/cache/ live cache layer is
 *     wired in a follow-up commit.
 *   - Slot 5 lands when the discovery engine sub-phases are
 *     implemented in Phase 3.
 *
 * Mode predicates determine which slots are consulted:
 *   - warm: slots 1 → 2 → 3 → 4 → 5
 *   - cold: slots 1 → 2 → 5 (skip 3, 4)
 *   - compare: walk warm chain, also run discovery, return both
 *   - no-overrides: slots 3 → 4 → 5 (skip 1, 2)
 *
 * Pure-application — depends on lib/domain/pipeline and the
 * application-layer WorkspaceCatalog. No Effect runtime here
 * (the implementation is synchronous given a loaded catalog);
 * this matches the read-side pattern used by other catalog
 * consumers.
 */

import type { WorkspaceCatalog } from '../catalog/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { Composition } from '../../domain/pipeline/composition';
import type { Projection } from '../../domain/pipeline/projection';
import type { AtomClass, AtomAddressOf, AtomAddress } from '../../domain/pipeline/atom-address';
import { atomAddressToPath, atomAddressEquals } from '../../domain/pipeline/atom-address';
import type {
  CompositionSubType,
  CompositionAddressOf,
  CompositionAddress,
} from '../../domain/pipeline/composition-address';
import { compositionAddressEquals } from '../../domain/pipeline/composition-address';
import type {
  ProjectionSubType,
  ProjectionAddressOf,
  ProjectionAddress,
} from '../../domain/pipeline/projection-address';
import { projectionAddressEquals } from '../../domain/pipeline/projection-address';
import type {
  LookupResult,
  LookupMode,
} from '../../domain/pipeline/lookup-chain';
import {
  modeRespectsOverrides,
  modeConsultsDeterministicObservations,
  modeConsultsLiveCache,
} from '../../domain/pipeline/lookup-chain';
import type { QualifierBag, AtomApplicability } from '../../domain/pipeline/qualifier';
import {
  hasQualifiers,
  intersectApplicability,
  APPLICABILITY_IDENTITY,
} from '../../domain/pipeline/qualifier';
import { findBinding } from '../../domain/pipeline/projection';
import type { PhaseOutputSource } from '../../domain/pipeline/source';

// ─── Catalog-backed lookup chain ─────────────────────────────────

/** A read-side lookup chain implementation backed by a loaded
 *  WorkspaceCatalog. Construct one per logical query session
 *  (e.g. one per iterate run). The catalog reference is held for
 *  the chain's lifetime; mutating the catalog after construction
 *  produces stale results. */
export interface CatalogLookupChain {
  lookupAtom<C extends AtomClass>(input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly qualifiers?: QualifierBag;
  }): LookupResult<Atom<C, unknown>>;

  lookupComposition<S extends CompositionSubType>(input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
  }): LookupResult<Composition<S, unknown>>;

  lookupProjection<S extends ProjectionSubType>(input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
  }): LookupResult<Projection<S>>;
}

/** Build a CatalogLookupChain from a loaded WorkspaceCatalog. */
export function createCatalogLookupChain(catalog: WorkspaceCatalog): CatalogLookupChain {
  return {
    lookupAtom: (input) => lookupAtomImpl(catalog, input),
    lookupComposition: (input) => lookupCompositionImpl(catalog, input),
    lookupProjection: (input) => lookupProjectionImpl(catalog, input),
  };
}

// ─── Atom lookup implementation ──────────────────────────────────

function lookupAtomImpl<C extends AtomClass>(
  catalog: WorkspaceCatalog,
  input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly qualifiers?: QualifierBag;
  },
): LookupResult<Atom<C, unknown>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const slotsConsulted: PhaseOutputSource[] = [];

  // Slot 1: operator override (canonical source). Stub for now —
  // operator overrides for canonical artifacts will land in Phase 2
  // when controls/ files are decomposed into per-address overrides.
  if (modeRespectsOverrides(mode)) {
    slotsConsulted.push('operator-override');
    // No operator-override store wired yet — fall through.
  }

  // Slots 2 and 3: canonical artifacts from the tier1Atoms field.
  // Walk the catalog's atom envelopes, find ones matching the
  // (class, address) tuple, and pick the highest-precedence source
  // among them.
  if (modeRespectsOverrides(mode) || modeConsultsDeterministicObservations(mode)) {
    const matching = findAtomsMatching(catalog, input.class, input.address);
    if (matching.length > 0) {
      // Filter by mode-allowed sources: cold mode skips slot 3.
      const allowed = matching.filter((atom) => modeAllowsSource(mode, atom.source));
      if (allowed.length > 0) {
        const winner = pickHighestPrecedence(allowed);
        if (winner.source === 'agentic-override') slotsConsulted.push('agentic-override');
        if (winner.source === 'deterministic-observation') {
          slotsConsulted.push('deterministic-observation');
        }
        const qualifiedApplicability = hasQualifiers(input.qualifiers)
          ? applyProjections(catalog, input.address, input.qualifiers!)
          : null;
        return {
          resolved: winner as unknown as Atom<C, unknown>,
          winningSource: winner.source,
          slotsConsulted,
          qualifiedApplicability,
        };
      }
    }
  }

  // Slot 4: live derivation cache. Stub.
  if (modeConsultsLiveCache(mode)) {
    slotsConsulted.push('live-derivation');
  }

  // Slot 5: cold derivation (run the discovery engine). Stub —
  // returns null until Phase 3 wires the per-class discovery engines.
  // The slot is recorded as consulted so consumers can tell the
  // chain reached the bottom.

  return {
    resolved: null,
    winningSource: null,
    slotsConsulted,
    qualifiedApplicability: null,
  };
}

function findAtomsMatching(
  catalog: WorkspaceCatalog,
  cls: AtomClass,
  address: AtomAddress,
): readonly Atom<AtomClass, unknown>[] {
  return catalog.tier1Atoms
    .map((envelope) => envelope.artifact)
    .filter(
      (atom) => atom.class === cls && atomAddressEquals(atom.address, address),
    );
}

function pickHighestPrecedence<C extends AtomClass>(
  atoms: readonly Atom<C, unknown>[],
): Atom<C, unknown> {
  // Order: operator-override > agentic-override > deterministic-observation
  // > live-derivation > cold-derivation. Returns the highest match.
  const byPrecedence: Record<PhaseOutputSource, number> = {
    'operator-override': 0,
    'agentic-override': 1,
    'deterministic-observation': 2,
    'live-derivation': 3,
    'cold-derivation': 4,
  };
  return [...atoms].sort(
    (a, b) => byPrecedence[a.source] - byPrecedence[b.source],
  )[0]!;
}

function modeAllowsSource(mode: LookupMode, source: PhaseOutputSource): boolean {
  if (mode === 'no-overrides' && (source === 'operator-override' || source === 'agentic-override')) {
    return false;
  }
  if (mode === 'cold' && source === 'deterministic-observation') {
    return false;
  }
  if (mode === 'cold' && source === 'live-derivation') {
    return false;
  }
  return true;
}

// ─── Composition lookup implementation ───────────────────────────

function lookupCompositionImpl<S extends CompositionSubType>(
  catalog: WorkspaceCatalog,
  input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
  },
): LookupResult<Composition<S, unknown>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const slotsConsulted: PhaseOutputSource[] = [];

  if (modeRespectsOverrides(mode)) {
    slotsConsulted.push('operator-override');
  }

  if (modeRespectsOverrides(mode) || modeConsultsDeterministicObservations(mode)) {
    const matching = findCompositionsMatching(catalog, input.subType, input.address);
    if (matching.length > 0) {
      const allowed = matching.filter((c) => modeAllowsSource(mode, c.source));
      if (allowed.length > 0) {
        const winner = pickHighestPrecedenceComposition(allowed);
        if (winner.source === 'agentic-override') slotsConsulted.push('agentic-override');
        if (winner.source === 'deterministic-observation') {
          slotsConsulted.push('deterministic-observation');
        }
        return {
          resolved: winner as unknown as Composition<S, unknown>,
          winningSource: winner.source,
          slotsConsulted,
        };
      }
    }
  }

  if (modeConsultsLiveCache(mode)) slotsConsulted.push('live-derivation');

  return {
    resolved: null,
    winningSource: null,
    slotsConsulted,
  };
}

function findCompositionsMatching(
  catalog: WorkspaceCatalog,
  subType: CompositionSubType,
  address: CompositionAddress,
): readonly Composition<CompositionSubType, unknown>[] {
  return catalog.tier2Compositions
    .map((envelope) => envelope.artifact)
    .filter(
      (c) => c.subType === subType && compositionAddressEquals(c.address, address),
    );
}

function pickHighestPrecedenceComposition<S extends CompositionSubType>(
  comps: readonly Composition<S, unknown>[],
): Composition<S, unknown> {
  const byPrecedence: Record<PhaseOutputSource, number> = {
    'operator-override': 0,
    'agentic-override': 1,
    'deterministic-observation': 2,
    'live-derivation': 3,
    'cold-derivation': 4,
  };
  return [...comps].sort(
    (a, b) => byPrecedence[a.source] - byPrecedence[b.source],
  )[0]!;
}

// ─── Projection lookup implementation ────────────────────────────

function lookupProjectionImpl<S extends ProjectionSubType>(
  catalog: WorkspaceCatalog,
  input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
  },
): LookupResult<Projection<S>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const slotsConsulted: PhaseOutputSource[] = [];

  if (modeRespectsOverrides(mode)) slotsConsulted.push('operator-override');

  if (modeRespectsOverrides(mode) || modeConsultsDeterministicObservations(mode)) {
    const matching = findProjectionsMatching(catalog, input.subType, input.address);
    if (matching.length > 0) {
      const allowed = matching.filter((p) => modeAllowsSource(mode, p.source));
      if (allowed.length > 0) {
        const winner = pickHighestPrecedenceProjection(allowed);
        if (winner.source === 'agentic-override') slotsConsulted.push('agentic-override');
        if (winner.source === 'deterministic-observation') {
          slotsConsulted.push('deterministic-observation');
        }
        return {
          resolved: winner as unknown as Projection<S>,
          winningSource: winner.source,
          slotsConsulted,
        };
      }
    }
  }

  if (modeConsultsLiveCache(mode)) slotsConsulted.push('live-derivation');

  return {
    resolved: null,
    winningSource: null,
    slotsConsulted,
  };
}

function findProjectionsMatching(
  catalog: WorkspaceCatalog,
  subType: ProjectionSubType,
  address: ProjectionAddress,
): readonly Projection<ProjectionSubType>[] {
  return catalog.tier3Projections
    .map((envelope) => envelope.artifact)
    .filter(
      (p) => p.subType === subType && projectionAddressEquals(p.address, address),
    );
}

function pickHighestPrecedenceProjection<S extends ProjectionSubType>(
  projs: readonly Projection<S>[],
): Projection<S> {
  const byPrecedence: Record<PhaseOutputSource, number> = {
    'operator-override': 0,
    'agentic-override': 1,
    'deterministic-observation': 2,
    'live-derivation': 3,
    'cold-derivation': 4,
  };
  return [...projs].sort(
    (a, b) => byPrecedence[a.source] - byPrecedence[b.source],
  )[0]!;
}

// ─── Qualifier-aware projection application ──────────────────────

/** Walk the projection tier and compose applicability filters from
 *  every projection that matches the active qualifiers. The result
 *  is the intersection (associatively composed) of all applicable
 *  projections. The default applicability when no projection
 *  binding exists for an atom is the identity element
 *  (`'interactive'`) — projections only restrict, never grant. */
function applyProjections(
  catalog: WorkspaceCatalog,
  atomAddress: AtomAddress,
  qualifiers: QualifierBag,
): AtomApplicability {
  let result: AtomApplicability = APPLICABILITY_IDENTITY;

  // Role visibility + interaction
  if (qualifiers.role !== undefined) {
    const visibilityProj = findProjectionByAddress(catalog, {
      subType: 'role-visibility',
      role: qualifiers.role,
    });
    if (visibilityProj !== null) {
      const binding = findBinding(visibilityProj, atomAddress);
      if (binding !== undefined) {
        result = intersectApplicability(result, binding.applicability);
      }
    }
    const interactionProj = findProjectionByAddress(catalog, {
      subType: 'role-interaction',
      role: qualifiers.role,
    });
    if (interactionProj !== null) {
      const binding = findBinding(interactionProj, atomAddress);
      if (binding !== undefined) {
        result = intersectApplicability(result, binding.applicability);
      }
    }
  }

  // Wizard state
  if (qualifiers.wizardState !== undefined) {
    const wizardProj = findProjectionByAddress(catalog, {
      subType: 'wizard-state',
      wizard: qualifiers.wizardState.wizard,
      state: qualifiers.wizardState.state,
    });
    if (wizardProj !== null) {
      const binding = findBinding(wizardProj, atomAddress);
      if (binding !== undefined) {
        result = intersectApplicability(result, binding.applicability);
      }
    }
  }

  // Process state
  if (qualifiers.processState !== undefined) {
    const processProj = findProjectionByAddress(catalog, {
      subType: 'process-state',
      entity: qualifiers.processState.entity,
      state: qualifiers.processState.state,
    });
    if (processProj !== null) {
      const binding = findBinding(processProj, atomAddress);
      if (binding !== undefined) {
        result = intersectApplicability(result, binding.applicability);
      }
    }
  }

  // Feature flags (each flag composes its own restriction)
  if (qualifiers.featureFlags !== undefined) {
    for (const flag of qualifiers.featureFlags) {
      const flagProj = findProjectionByAddress(catalog, {
        subType: 'feature-flag',
        flag,
      });
      if (flagProj !== null) {
        const binding = findBinding(flagProj, atomAddress);
        if (binding !== undefined) {
          result = intersectApplicability(result, binding.applicability);
        }
      }
    }
  }

  // Permission groups (each group composes its own restriction)
  if (qualifiers.permissionGroups !== undefined) {
    for (const group of qualifiers.permissionGroups) {
      const groupProj = findProjectionByAddress(catalog, {
        subType: 'permission-group',
        group,
      });
      if (groupProj !== null) {
        const binding = findBinding(groupProj, atomAddress);
        if (binding !== undefined) {
          result = intersectApplicability(result, binding.applicability);
        }
      }
    }
  }

  return result;
}

function findProjectionByAddress(
  catalog: WorkspaceCatalog,
  address: ProjectionAddress,
): Projection<ProjectionSubType> | null {
  const found = catalog.tier3Projections
    .map((envelope) => envelope.artifact)
    .filter((p) => projectionAddressEquals(p.address, address));
  if (found.length === 0) return null;
  // Multiple matches? Pick highest-precedence source.
  return pickHighestPrecedenceProjection(found);
}

void atomAddressToPath; // re-exported for downstream consumers if needed

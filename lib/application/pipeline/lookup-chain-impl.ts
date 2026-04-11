/**
 * Lookup chain implementation — application-layer wiring of the
 * pure typed interface in `lib/domain/pipeline/lookup-chain.ts`.
 *
 * Per docs/canon-and-derivation.md § 6 The lookup precedence chain
 * and § 6.6 Qualifier-aware lookup, the chain walks five slots in
 * order. This implementation handles slots 2 and 3 (canonical
 * artifacts) sourced from the WorkspaceCatalog. Slots 1, 4, and 5
 * are stub paths that record their slot in `slotsConsulted`.
 *
 * # Design pattern doctrine
 *
 *   - **Pure functions only.** No `let`, no top-level mutation,
 *     no early `return` for control flow. Every function is a
 *     single expression or a `const` chain followed by a return.
 *
 *   - **Pre-built indices for O(1) lookups.** At chain
 *     construction the catalog is folded into address-keyed
 *     `ReadonlyMap`s once (O(N)). Each subsequent lookup is then
 *     O(1) amortized — the catalog is never re-walked per query.
 *     Without the indices, K lookups across N catalog entries
 *     would be O(K·N), which is O(N²) when K scales with N.
 *
 *   - **Catamorphism (fold) over slots.** Resolution walks the
 *     precedence chain via reduce. The fold uses a small
 *     `LookupResult` algebra: an empty result composed with a
 *     slot-result via `concatLookupResult` produces a new
 *     result. No imperative if/return early-exit chains.
 *
 *   - **Strategy pattern for per-slot behavior.** Each slot has
 *     a `SlotStrategy` that knows whether the mode allows it
 *     and how to resolve it from the indices. Adding a new slot
 *     is one new strategy.
 *
 *   - **Visitor / pattern-matching for source precedence.**
 *     `pickHighestPrecedence` is a fold over a small ordered
 *     table. No in-place sort.
 *
 *   - **Monoid composition for projection applicability.**
 *     Multiple projections compose via `intersectApplicability`,
 *     an associative binary operation with identity
 *     `'interactive'`. The empty qualifier bag composes to the
 *     identity element automatically.
 *
 *   - **Transient mutation contained.** Index building uses
 *     transient `Map.set` / `Array.push` inside reducer closures
 *     (the standard FP "transient internal, persistent external"
 *     idiom). Externally exposed types are `ReadonlyMap` /
 *     `ReadonlyArray` so consumers cannot mutate.
 */

import type { ArtifactEnvelope, WorkspaceCatalog } from '../catalog/types';
import type { Atom } from '../../domain/pipeline/atom';
import type { Composition } from '../../domain/pipeline/composition';
import type { Projection } from '../../domain/pipeline/projection';
import type { AtomClass, AtomAddressOf, AtomAddress } from '../../domain/pipeline/atom-address';
import { atomAddressToPath } from '../../domain/pipeline/atom-address';
import type {
  CompositionSubType,
  CompositionAddressOf,
  CompositionAddress,
} from '../../domain/pipeline/composition-address';
import { compositionAddressToPath } from '../../domain/pipeline/composition-address';
import type {
  ProjectionSubType,
  ProjectionAddressOf,
  ProjectionAddress,
} from '../../domain/pipeline/projection-address';
import { projectionAddressToPath } from '../../domain/pipeline/projection-address';
import type {
  LookupResult,
  LookupMode,
} from '../../domain/pipeline/lookup-chain';
import {
  modeRespectsOverrides,
  modeConsultsDeterministicObservations,
  modeConsultsReferenceCanon,
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

// ─── Public surface ──────────────────────────────────────────────

export interface CatalogLookupChain {
  lookupAtom<C extends AtomClass>(input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
    readonly qualifiers?: QualifierBag;
  }): LookupResult<Atom<C, unknown, PhaseOutputSource>>;

  lookupComposition<S extends CompositionSubType>(input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  }): LookupResult<Composition<S, unknown, PhaseOutputSource>>;

  lookupProjection<S extends ProjectionSubType>(input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  }): LookupResult<Projection<S, PhaseOutputSource>>;
}

/** Build a CatalogLookupChain from a loaded WorkspaceCatalog.
 *  Index construction is O(N) once; subsequent lookups are O(1)
 *  amortized. */
export function createCatalogLookupChain(catalog: WorkspaceCatalog): CatalogLookupChain {
  // Build the three address-keyed indices once. Each index is a
  // ReadonlyMap from address-path-string to a ReadonlyArray of
  // candidates at that address. Multiple candidates per address
  // happen when both source flavors (agentic + deterministic)
  // promote artifacts for the same identity tuple — the lookup
  // picks the highest-precedence one.
  const atomIndex = buildAtomIndex(catalog.tier1Atoms);
  const compositionIndex = buildCompositionIndex(catalog.tier2Compositions);
  const projectionIndex = buildProjectionIndex(catalog.tier3Projections);

  return {
    lookupAtom: (input) =>
      lookupAtomImpl(atomIndex, projectionIndex, input),
    lookupComposition: (input) =>
      lookupCompositionImpl(compositionIndex, input),
    lookupProjection: (input) =>
      lookupProjectionImpl(projectionIndex, input),
  };
}

// ─── Index types and builders ────────────────────────────────────
//
// The indices are address-path keyed. Address paths are stable
// strings produced by `atomAddressToPath` / `compositionAddressToPath`
// / `projectionAddressToPath`. Multiple candidates per address are
// collected into the value array; the lookup picks the highest-
// precedence one via the precedence table below.

type AtomIndex = ReadonlyMap<string, readonly Atom<AtomClass, unknown, PhaseOutputSource>[]>;
type CompositionIndex = ReadonlyMap<
  string,
  readonly Composition<CompositionSubType, unknown, PhaseOutputSource>[]
>;
type ProjectionIndex = ReadonlyMap<string, readonly Projection<ProjectionSubType, PhaseOutputSource>[]>;

/** Generic O(N) index builder. Folds envelopes into a Map keyed
 *  by `keyOf(envelope.artifact)`. Uses transient mutation inside
 *  the reducer closure for performance; the returned type is
 *  `ReadonlyMap` so callers cannot mutate. */
function buildIndex<T>(
  envelopes: readonly ArtifactEnvelope<T>[],
  keyOf: (artifact: T) => string,
): ReadonlyMap<string, readonly T[]> {
  return envelopes.reduce<Map<string, T[]>>((acc, env) => {
    const key = keyOf(env.artifact);
    const existing = acc.get(key);
    if (existing === undefined) {
      acc.set(key, [env.artifact]);
    } else {
      existing.push(env.artifact);
    }
    return acc;
  }, new Map<string, T[]>());
}

const buildAtomIndex = (
  envelopes: readonly ArtifactEnvelope<Atom<AtomClass, unknown, PhaseOutputSource>>[],
): AtomIndex => buildIndex(envelopes, (a) => atomAddressToPath(a.address));

const buildCompositionIndex = (
  envelopes: readonly ArtifactEnvelope<Composition<CompositionSubType, unknown, PhaseOutputSource>>[],
): CompositionIndex =>
  buildIndex(envelopes, (c) => compositionAddressToPath(c.address));

const buildProjectionIndex = (
  envelopes: readonly ArtifactEnvelope<Projection<ProjectionSubType, PhaseOutputSource>>[],
): ProjectionIndex => buildIndex(envelopes, (p) => projectionAddressToPath(p.address));

// ─── Source precedence (pure ordered table) ──────────────────────

const SOURCE_PRECEDENCE_ORDER: readonly PhaseOutputSource[] = [
  'operator-override',
  'agentic-override',
  'deterministic-observation',
  'reference-canon',
  'live-derivation',
  'cold-derivation',
];

const SOURCE_PRECEDENCE_INDEX: ReadonlyMap<PhaseOutputSource, number> = new Map(
  SOURCE_PRECEDENCE_ORDER.map((source, index) => [source, index] as const),
);

const sourcePrecedenceOf = (source: PhaseOutputSource): number =>
  SOURCE_PRECEDENCE_INDEX.get(source) ?? Number.MAX_SAFE_INTEGER;

// ─── Mode predicates ─────────────────────────────────────────────

const modeAllowsSource = (
  mode: LookupMode,
  source: PhaseOutputSource,
  skipReferenceCanon: boolean,
): boolean => {
  if (mode === 'no-overrides' && (source === 'operator-override' || source === 'agentic-override')) {
    return false;
  }
  if (
    mode === 'cold' &&
    (source === 'deterministic-observation' ||
      source === 'reference-canon' ||
      source === 'live-derivation')
  ) {
    return false;
  }
  if (source === 'reference-canon' && !modeConsultsReferenceCanon(mode, skipReferenceCanon)) {
    return false;
  }
  return true;
};

// ─── Slots-consulted accounting (declarative) ────────────────────

const slotsConsultedFor = (
  mode: LookupMode,
  skipReferenceCanon: boolean,
): readonly PhaseOutputSource[] => [
  ...(modeRespectsOverrides(mode) ? (['operator-override'] as const) : []),
  ...(modeConsultsReferenceCanon(mode, skipReferenceCanon)
    ? (['reference-canon'] as const)
    : []),
  ...(modeConsultsLiveCache(mode) ? (['live-derivation'] as const) : []),
];

const slotsConsultedFromWinner = (
  base: readonly PhaseOutputSource[],
  winner: { readonly source: PhaseOutputSource } | null,
): readonly PhaseOutputSource[] =>
  winner === null ? base : [...base, winner.source];

// ─── Generic precedence picker (fold) ────────────────────────────

const pickHighestPrecedence = <A extends { readonly source: PhaseOutputSource }>(
  candidates: readonly A[],
): A | null =>
  candidates.length === 0
    ? null
    : candidates.reduce((winner, candidate) =>
        sourcePrecedenceOf(candidate.source) < sourcePrecedenceOf(winner.source)
          ? candidate
          : winner,
      );

// ─── Generic tier resolution (pure) ──────────────────────────────

/** Resolve a tier (slots 2-4) for an address by intersecting the
 *  candidates with the mode-allowed set (including the
 *  skipReferenceCanon flag) and picking the highest-precedence
 *  survivor. Pure. */
const resolveFromTier = <A extends { readonly source: PhaseOutputSource }>(
  candidates: readonly A[],
  mode: LookupMode,
  skipReferenceCanon: boolean,
): A | null =>
  pickHighestPrecedence(
    candidates.filter((c) => modeAllowsSource(mode, c.source, skipReferenceCanon)),
  );

// ─── Atom lookup ─────────────────────────────────────────────────

function lookupAtomImpl<C extends AtomClass>(
  atomIndex: AtomIndex,
  projectionIndex: ProjectionIndex,
  input: {
    readonly class: C;
    readonly address: AtomAddressOf<C>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
    readonly qualifiers?: QualifierBag;
  },
): LookupResult<Atom<C, unknown, PhaseOutputSource>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const skipReferenceCanon = input.skipReferenceCanon === true;
  const baseSlots = slotsConsultedFor(mode, skipReferenceCanon);

  // O(1) index lookup. Filter to ensure address-path collisions
  // (which shouldn't happen but defend against) don't surface
  // wrong-class atoms.
  const candidates =
    atomIndex.get(atomAddressToPath(input.address))?.filter((a) => a.class === input.class) ?? [];

  const winner =
    modeRespectsOverrides(mode) ||
    modeConsultsDeterministicObservations(mode) ||
    modeConsultsReferenceCanon(mode, skipReferenceCanon)
      ? resolveFromTier(candidates, mode, skipReferenceCanon)
      : null;

  const qualifiedApplicability =
    winner !== null && hasQualifiers(input.qualifiers)
      ? applyProjections(projectionIndex, input.address, input.qualifiers!, skipReferenceCanon)
      : null;

  return {
    resolved: winner === null ? null : widenAtom<C>(winner),
    winningSource: winner?.source ?? null,
    slotsConsulted: slotsConsultedFromWinner(baseSlots, winner),
    qualifiedApplicability,
  };
}

// ─── Composition lookup ──────────────────────────────────────────

function lookupCompositionImpl<S extends CompositionSubType>(
  compositionIndex: CompositionIndex,
  input: {
    readonly subType: S;
    readonly address: CompositionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  },
): LookupResult<Composition<S, unknown, PhaseOutputSource>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const skipReferenceCanon = input.skipReferenceCanon === true;
  const baseSlots = slotsConsultedFor(mode, skipReferenceCanon);

  const candidates =
    compositionIndex
      .get(compositionAddressToPath(input.address))
      ?.filter((c) => c.subType === input.subType) ?? [];

  const winner =
    modeRespectsOverrides(mode) ||
    modeConsultsDeterministicObservations(mode) ||
    modeConsultsReferenceCanon(mode, skipReferenceCanon)
      ? resolveFromTier(candidates, mode, skipReferenceCanon)
      : null;

  return {
    resolved: winner === null ? null : widenComposition<S>(winner),
    winningSource: winner?.source ?? null,
    slotsConsulted: slotsConsultedFromWinner(baseSlots, winner),
  };
}

// ─── Projection lookup ───────────────────────────────────────────

function lookupProjectionImpl<S extends ProjectionSubType>(
  projectionIndex: ProjectionIndex,
  input: {
    readonly subType: S;
    readonly address: ProjectionAddressOf<S>;
    readonly mode?: LookupMode;
    readonly skipReferenceCanon?: boolean;
  },
): LookupResult<Projection<S, PhaseOutputSource>> {
  const mode: LookupMode = input.mode ?? 'warm';
  const skipReferenceCanon = input.skipReferenceCanon === true;
  const baseSlots = slotsConsultedFor(mode, skipReferenceCanon);

  const candidates =
    projectionIndex
      .get(projectionAddressToPath(input.address))
      ?.filter((p) => p.subType === input.subType) ?? [];

  const winner =
    modeRespectsOverrides(mode) ||
    modeConsultsDeterministicObservations(mode) ||
    modeConsultsReferenceCanon(mode, skipReferenceCanon)
      ? resolveFromTier(candidates, mode, skipReferenceCanon)
      : null;

  return {
    resolved: winner === null ? null : widenProjection<S>(winner),
    winningSource: winner?.source ?? null,
    slotsConsulted: slotsConsultedFromWinner(baseSlots, winner),
  };
}

// ─── Variance widening (contained casts) ─────────────────────────

const widenAtom = <C extends AtomClass>(
  a: Atom<AtomClass, unknown, PhaseOutputSource>,
): Atom<C, unknown, PhaseOutputSource> =>
  a as unknown as Atom<C, unknown, PhaseOutputSource>;

const widenComposition = <S extends CompositionSubType>(
  c: Composition<CompositionSubType, unknown, PhaseOutputSource>,
): Composition<S, unknown, PhaseOutputSource> =>
  c as unknown as Composition<S, unknown, PhaseOutputSource>;

const widenProjection = <S extends ProjectionSubType>(
  p: Projection<ProjectionSubType, PhaseOutputSource>,
): Projection<S, PhaseOutputSource> =>
  p as unknown as Projection<S, PhaseOutputSource>;

// ─── Qualifier-aware projection application ──────────────────────

/** Build the list of projection addresses implied by a qualifier
 *  bag. Pure — same bag, same list. */
const projectionAddressesFromBag = (
  bag: QualifierBag,
): readonly ProjectionAddress[] => [
  ...(bag.role === undefined
    ? []
    : ([
        { subType: 'role-visibility', role: bag.role },
        { subType: 'role-interaction', role: bag.role },
      ] as const)),
  ...(bag.wizardState === undefined
    ? []
    : ([
        {
          subType: 'wizard-state',
          wizard: bag.wizardState.wizard,
          state: bag.wizardState.state,
        },
      ] as const)),
  ...(bag.processState === undefined
    ? []
    : ([
        {
          subType: 'process-state',
          entity: bag.processState.entity,
          state: bag.processState.state,
        },
      ] as const)),
  ...(bag.featureFlags?.map(
    (flag) => ({ subType: 'feature-flag' as const, flag }),
  ) ?? []),
  ...(bag.permissionGroups?.map(
    (group) => ({ subType: 'permission-group' as const, group }),
  ) ?? []),
];

/** Apply every projection from the catalog matching the qualifier
 *  bag to the given atom address via O(1) index lookups. Returns
 *  the intersection of all applicable bindings via the monoid
 *  `intersectApplicability` whose identity is `'interactive'`.
 *
 *  The `skipReferenceCanon` flag propagates from the caller: when
 *  true, projections sourced from reference canon are filtered out
 *  before precedence picking, so the qualifier pass mirrors the
 *  atom pass in respecting the migration-debt measurement mode. */
function applyProjections(
  projectionIndex: ProjectionIndex,
  atomAddress: AtomAddress,
  qualifiers: QualifierBag,
  skipReferenceCanon: boolean,
): AtomApplicability {
  const wantedAddresses = projectionAddressesFromBag(qualifiers);

  // For each wanted projection address: O(1) index lookup, then
  // pick the highest-precedence projection at that address. Total
  // is O(W) where W = number of qualifiers in the bag.
  const matchedProjections = wantedAddresses
    .map((addr) => {
      const entries = projectionIndex.get(projectionAddressToPath(addr)) ?? [];
      const filtered = skipReferenceCanon
        ? entries.filter((p) => p.source !== 'reference-canon')
        : entries;
      return pickHighestPrecedence(filtered);
    })
    .filter((p): p is Projection<ProjectionSubType, PhaseOutputSource> => p !== null);

  // For each matched projection, find the binding for our atom
  // address. findBinding walks the projection's bindings array
  // (typically small per projection).
  const bindings = matchedProjections
    .map((proj) => findBinding(proj, atomAddress))
    .filter((b): b is NonNullable<typeof b> => b !== undefined);

  // Fold via the monoid (identity is APPLICABILITY_IDENTITY).
  return bindings.reduce<AtomApplicability>(
    (acc, b) => intersectApplicability(acc, b.applicability),
    APPLICABILITY_IDENTITY,
  );
}

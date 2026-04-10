/**
 * Projection envelope — Tier 3 canonical artifact value object.
 *
 * Per the canon-and-derivation doctrine § 3.8 Tier 3 — Projections,
 * a projection is a constraint over the atom set keyed by a
 * qualifier (role, wizard state, feature flag, etc.). It does NOT
 * add new atoms — it tags and filters existing ones via
 * AtomBindings that pair an atom address with an applicability
 * classification.
 *
 * The Projection type is parameterized by:
 *   - S: the ProjectionSubType (the discriminator)
 *
 * Unlike atoms and compositions, projections do not carry a
 * separate `content` payload. The bindings ARE the content — the
 * meaning of a projection is "for these atoms, this applicability
 * applies under this qualifier."
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { Fingerprint } from '../kernel/hash';
import type { AtomAddress } from './atom-address';
import type {
  ProjectionSubType,
  ProjectionAddress,
  ProjectionAddressOf,
} from './projection-address';
import type { PhaseOutputSource } from './source';
import type { AtomApplicability } from './qualifier';
import type { CanonProvenance } from './provenance';

// ─── Provenance ───────────────────────────────────────────────────

/** @deprecated Use `CanonProvenance`. Kept as a type alias for
 *  source-compatibility; the three tier-specific provenance types
 *  are byte-identical and share one canonical definition in
 *  `provenance.ts`. */
export type ProjectionProvenance = CanonProvenance;

// ─── Atom binding (the unit of projection content) ───────────────

/** A typed (atom, applicability) pair. The projection consists of a
 *  list of bindings; the lookup chain reads them at qualified-query
 *  time and applies the applicability classification to the
 *  resolved atom. */
export interface AtomBinding {
  /** The atom this binding applies to. */
  readonly address: AtomAddress;
  /** What's allowed for this atom under the projection's qualifier. */
  readonly applicability: AtomApplicability;
  /** Optional further refinement for binding-specific conditions
   *  (e.g. "only when the input has length > 0"). The structure is
   *  intentionally generic — concrete projection sub-types may
   *  refine this with their own typed conditions. */
  readonly conditions?: BindingCondition[] | undefined;
}

/** A free-form condition refining an atom binding. The shape is
 *  intentionally minimal so projection sub-types can layer their
 *  own typed conditions on top. */
export interface BindingCondition {
  readonly kind: string;
  readonly description: string;
  readonly params?: Readonly<Record<string, string>>;
}

// ─── The Projection envelope ─────────────────────────────────────

/** A projection envelope. The `Src` generic parameter carries the
 *  source slot as a phantom literal for source-discriminated
 *  signatures. There is no default parameter — every call site
 *  declares the source explicitly. See `Atom<C, T, Src>` for the
 *  full rationale. */
export interface Projection<
  S extends ProjectionSubType,
  Src extends PhaseOutputSource,
> {
  /** The projection sub-type. */
  readonly subType: S;
  /** The projection's address. */
  readonly address: ProjectionAddressOf<S>;
  /** The list of (atom, applicability) bindings that constitute
   *  this projection's content. */
  readonly bindings: readonly AtomBinding[];
  /** Which slot of the lookup chain this projection came from. */
  readonly source: Src;
  /** Hash of inputs (qualifier identity + atom dependencies) that
   *  produced this projection. */
  readonly inputFingerprint: Fingerprint<'projection-input'>;
  /** Provenance metadata. */
  readonly provenance: ProjectionProvenance;
  /** Optional quality score for promotion gating. */
  readonly qualityScore?: number | undefined;
}

/** Construct a projection envelope. Return type infers the narrow
 *  source parameter from `input.source`. */
export function projection<
  S extends ProjectionSubType,
  Src extends PhaseOutputSource,
>(input: {
  readonly subType: S;
  readonly address: ProjectionAddressOf<S>;
  readonly bindings: readonly AtomBinding[];
  readonly source: Src;
  readonly inputFingerprint: Fingerprint<'projection-input'>;
  readonly provenance: ProjectionProvenance;
  readonly qualityScore?: number | undefined;
}): Projection<S, Src> {
  return {
    subType: input.subType,
    address: input.address,
    bindings: input.bindings,
    source: input.source,
    inputFingerprint: input.inputFingerprint,
    provenance: input.provenance,
    qualityScore: input.qualityScore,
  };
}

// ─── Type guards ─────────────────────────────────────────────────
//
// Structural parameter types to avoid TypeScript's invariance on
// the S parameter.

/** True when the projection is of the given sub-type. */
export function isProjectionOfSubType<S extends ProjectionSubType>(
  candidate: { readonly subType: ProjectionSubType },
  subType: S,
): boolean {
  return candidate.subType === subType;
}

export function isProjectionAddressConsistent(candidate: {
  readonly subType: ProjectionSubType;
  readonly address: ProjectionAddress;
}): boolean {
  return candidate.address.subType === candidate.subType;
}

// ─── Binding lookup helpers ──────────────────────────────────────

/** Find the binding for a specific atom address within a
 *  projection. Returns `undefined` when the projection has no
 *  binding for that atom (which means the atom is unaffected by
 *  this projection — typically interpreted as `'visible'` by the
 *  default policy, but the lookup chain is the authority on that). */
export function findBinding(
  proj: { readonly bindings: readonly AtomBinding[] },
  atomAddress: AtomAddress,
): AtomBinding | undefined {
  return proj.bindings.find((b) => atomAddressEquals(b.address, atomAddress));
}

// Local equality helper (avoids importing the cross-module helper
// to keep the module dependency graph minimal).
function atomAddressEquals(a: AtomAddress, b: AtomAddress): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

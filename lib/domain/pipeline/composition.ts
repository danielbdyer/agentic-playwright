/**
 * Composition envelope — Tier 2 canonical artifact value object.
 *
 * Per the canon-and-derivation doctrine § 3.7 Tier 2 — Compositions,
 * a composition references atoms by identity and encodes higher-order
 * patterns (recipes, flows, archetypes, route graphs) over them. The
 * critical field is `atomReferences` — the typed list of atoms this
 * composition depends on, which lets the catalog build a reverse
 * index from atom address to dependent composition.
 *
 * The Composition type is parameterized by:
 *   - S: the CompositionSubType (the discriminator)
 *   - T: the content type (the actual recipe/pattern, typically an
 *        existing domain type)
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { AtomAddress } from './atom-address';
import type {
  CompositionSubType,
  CompositionAddress,
  CompositionAddressOf,
} from './composition-address';
import type { PhaseOutputSource } from './source';
import type { CanonProvenance } from './provenance';

// ─── Provenance ───────────────────────────────────────────────────

/** @deprecated Use `CanonProvenance`. Kept as a type alias for
 *  source-compatibility; the three tier-specific provenance types
 *  are byte-identical and share one canonical definition in
 *  `provenance.ts`. */
export type CompositionProvenance = CanonProvenance;

// ─── Atom reference (the link from Tier 2 to Tier 1) ─────────────

/** A typed reference from a composition to an atom it depends on.
 *  The reference carries enough information for the catalog to
 *  build a reverse index ("which compositions depend on this
 *  atom?") and for the demotion machinery to invalidate
 *  compositions when their atom dependencies change. */
export interface AtomReference {
  /** The address of the referenced atom. */
  readonly address: AtomAddress;
  /** Optional role of this reference within the composition
   *  (e.g. `'sequence-step'`, `'precondition'`, `'fallback'`). */
  readonly role?: string | undefined;
  /** Optional ordering hint when the composition has a stable
   *  sequence (e.g. step index in a runbook). */
  readonly order?: number | undefined;
}

// ─── The Composition envelope ────────────────────────────────────

export interface Composition<S extends CompositionSubType, T = unknown> {
  /** The composition sub-type. */
  readonly subType: S;
  /** The composition's address. */
  readonly address: CompositionAddressOf<S>;
  /** The actual recipe/pattern content. */
  readonly content: T;
  /** Typed references to the atoms this composition depends on. */
  readonly atomReferences: readonly AtomReference[];
  /** Which slot of the lookup chain this composition came from. */
  readonly source: PhaseOutputSource;
  /** Hash of inputs (atom fingerprints + content) that produced
   *  this composition. */
  readonly inputFingerprint: string;
  /** Provenance metadata. */
  readonly provenance: CompositionProvenance;
  /** Optional quality score for promotion gating. */
  readonly qualityScore?: number | undefined;
}

/** Construct a composition envelope. */
export function composition<S extends CompositionSubType, T>(input: {
  readonly subType: S;
  readonly address: CompositionAddressOf<S>;
  readonly content: T;
  readonly atomReferences: readonly AtomReference[];
  readonly source: PhaseOutputSource;
  readonly inputFingerprint: string;
  readonly provenance: CompositionProvenance;
  readonly qualityScore?: number | undefined;
}): Composition<S, T> {
  return {
    subType: input.subType,
    address: input.address,
    content: input.content,
    atomReferences: input.atomReferences,
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

/** True when the composition is of the given sub-type. */
export function isCompositionOfSubType<S extends CompositionSubType>(
  candidate: { readonly subType: CompositionSubType },
  subType: S,
): boolean {
  return candidate.subType === subType;
}

export function isCompositionAddressConsistent(candidate: {
  readonly subType: CompositionSubType;
  readonly address: CompositionAddress;
}): boolean {
  return candidate.address.subType === candidate.subType;
}

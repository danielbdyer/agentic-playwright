/**
 * Atom envelope — Tier 1 canonical artifact value object.
 *
 * Per the canon-and-derivation doctrine § 3.6 Tier 1 — Atoms, every
 * atom is wrapped in an envelope that carries its address, content,
 * source classification, fingerprint, and provenance. The envelope
 * is the unit of promotion, demotion, lookup, and storage.
 *
 * The Atom type is parameterized by:
 *   - C: the AtomClass (the discriminator)
 *   - T: the content type (the actual fact, typically an existing
 *        domain type from lib/domain/types/)
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { AtomClass, AtomAddress, AtomAddressOf } from './atom-address';
import type { PhaseOutputSource } from './source';

// ─── Provenance ───────────────────────────────────────────────────

/** Where the atom came from. Every atom carries enough provenance
 *  for an operator to trace it back to the inputs and engine that
 *  produced it. */
export interface AtomProvenance {
  /** Stable identifier of the engine or sub-engine that produced
   *  this atom (e.g. `discovery.routes.playwright-walker`). */
  readonly producedBy: string;
  /** ISO timestamp the atom was produced at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA, build tag, etc.). */
  readonly pipelineVersion?: string | undefined;
  /** Optional list of inputs the engine consumed to produce this
   *  atom. Lets the demotion machinery know which atoms become
   *  candidates when an upstream input changes. */
  readonly inputs?: readonly string[] | undefined;
}

// ─── The Atom envelope ───────────────────────────────────────────

/** A canonical-artifact (or candidate) wrapper around a fact about
 *  one SUT primitive. */
export interface Atom<C extends AtomClass, T = unknown> {
  /** The atom class (also encoded in `address.class`). */
  readonly class: C;
  /** The atom's address — its semantic identity. */
  readonly address: AtomAddressOf<C>;
  /** The actual fact — typed per atom class. Conventional
   *  binding: T is the existing domain type for this class
   *  (e.g. `RouteDefinition` for class `'route'`). */
  readonly content: T;
  /** Which slot of the lookup chain this atom came from. */
  readonly source: PhaseOutputSource;
  /** Hash of the inputs that produced this atom. Stable when the
   *  inputs are stable. Used to detect cache invalidation. */
  readonly inputFingerprint: string;
  /** Provenance metadata. */
  readonly provenance: AtomProvenance;
  /** Optional quality score from the discovery engine. Used by the
   *  promotion gate to decide whether this atom beats the current
   *  canonical artifact. */
  readonly qualityScore?: number | undefined;
}

/** Construct an atom envelope. The constructor exists so callers
 *  do not have to remember the field shape and so the type system
 *  can enforce the (class, address) invariant. */
export function atom<C extends AtomClass, T>(input: {
  readonly class: C;
  readonly address: AtomAddressOf<C>;
  readonly content: T;
  readonly source: PhaseOutputSource;
  readonly inputFingerprint: string;
  readonly provenance: AtomProvenance;
  readonly qualityScore?: number | undefined;
}): Atom<C, T> {
  return {
    class: input.class,
    address: input.address,
    content: input.content,
    source: input.source,
    inputFingerprint: input.inputFingerprint,
    provenance: input.provenance,
    qualityScore: input.qualityScore,
  };
}

// ─── Type guards and accessors ───────────────────────────────────
//
// These helpers take STRUCTURAL parameter types rather than the
// generic `Atom<AtomClass, unknown>` to avoid TypeScript's
// invariance on the C parameter. Consumers passing concrete
// `Atom<'route', T>` instances are accepted because the structural
// shape matches.

/** True when the atom is of the given class. */
export function isAtomOfClass<C extends AtomClass>(
  candidate: { readonly class: AtomClass },
  cls: C,
): boolean {
  return candidate.class === cls;
}

/** Verify the (class, address) invariant: an atom's `class` field
 *  must match its `address.class` field. The constructor enforces
 *  this at the type level, but a runtime check is useful when
 *  atoms are loaded from disk and need to be validated. */
export function isAtomAddressConsistent(candidate: {
  readonly class: AtomClass;
  readonly address: AtomAddress;
}): boolean {
  return candidate.address.class === candidate.class;
}

/**
 * Promotion gate — pure types for evaluating whether a derived
 * candidate should be promoted to a canonical artifact.
 *
 * Per the canon-and-derivation doctrine § 7 Promotion and demotion,
 * a derived output (slot 4 or 5) is a candidate for promotion to a
 * canonical artifact (slot 3) when it beats the existing canonical
 * artifact on a quality metric. The promotion gate is the typed
 * predicate that decides.
 *
 * Each atom class, composition sub-type, and projection sub-type
 * has its own promotion gate definition. The gate is parameterized
 * by the candidate type and the existing artifact type (which may
 * be null when nothing exists yet for the address).
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

import type { Atom } from './atom';
import type { Composition } from './composition';
import type { Projection } from './projection';
import type { AtomClass } from './atom-address';
import type { CompositionSubType } from './composition-address';
import type { ProjectionSubType } from './projection-address';

// ─── Gate verdict ────────────────────────────────────────────────

/** What the gate decides. The verdict drives the promotion machine
 *  on the next call. */
export type PromotionVerdict =
  | 'promote'        // candidate beats the existing artifact; promote it
  | 'keep-existing'  // existing artifact wins; discard the candidate
  | 'first-promotion' // no existing artifact; promote the candidate as the first
  | 'insufficient-quality' // candidate fails the minimum quality bar; discard
  | 'needs-review'   // gate cannot decide automatically; surface to operator;

export interface PromotionEvaluation {
  /** What the gate decided. */
  readonly verdict: PromotionVerdict;
  /** Optional human-readable rationale for diagnostics. */
  readonly rationale?: string;
  /** Optional quality scores for both candidates, for transparency. */
  readonly scores?: {
    readonly candidate: number;
    readonly existing: number | null;
  };
}

// ─── Gate interface ──────────────────────────────────────────────

/** A promotion gate for one specific atom class. The application
 *  layer registers a gate per class; the promotion machine
 *  dispatches by class. */
export interface AtomPromotionGate<C extends AtomClass> {
  /** The atom class this gate handles. */
  readonly class: C;
  /** Pure evaluation: given a candidate and the existing canonical
   *  artifact (if any), decide what to do. */
  readonly evaluate: (input: {
    readonly candidate: Atom<C, unknown>;
    readonly existing: Atom<C, unknown> | null;
  }) => PromotionEvaluation;
}

/** A promotion gate for one specific composition sub-type. */
export interface CompositionPromotionGate<S extends CompositionSubType> {
  readonly subType: S;
  readonly evaluate: (input: {
    readonly candidate: Composition<S, unknown>;
    readonly existing: Composition<S, unknown> | null;
  }) => PromotionEvaluation;
}

/** A promotion gate for one specific projection sub-type. */
export interface ProjectionPromotionGate<S extends ProjectionSubType> {
  readonly subType: S;
  readonly evaluate: (input: {
    readonly candidate: Projection<S>;
    readonly existing: Projection<S> | null;
  }) => PromotionEvaluation;
}

// ─── Demotion gate (the inverse) ─────────────────────────────────

/** Demotion is the inverse: given an existing canonical artifact
 *  and a fresh challenger from a deterministic engine, decide
 *  whether the existing artifact should be removed because the
 *  challenger has caught up. Demotion is ALWAYS deliberate — the
 *  gate's positive verdict surfaces a proposal to a human; the
 *  gate never demotes silently. */
export type DemotionVerdict =
  | 'propose-demotion'  // challenger matches/beats existing; surface to operator
  | 'keep-existing'     // existing still wins; do nothing
  | 'no-challenger'     // no fresh derivation available; cannot evaluate
  | 'needs-review';     // gate cannot decide; surface to operator

export interface DemotionProposal {
  /** What the gate decided. */
  readonly verdict: DemotionVerdict;
  /** Human-readable rationale (REQUIRED for demotion proposals
   *  because they go to operators for approval). */
  readonly rationale: string;
  /** Optional confidence score (0..1) for "how sure is the gate?" */
  readonly confidence?: number;
}

export interface AtomDemotionGate<C extends AtomClass> {
  readonly class: C;
  readonly evaluate: (input: {
    readonly existing: Atom<C, unknown>;
    readonly challenger: Atom<C, unknown> | null;
  }) => DemotionProposal;
}

// ─── Compile-time exhaustive registries ──────────────────────────

/** Compile-time-exhaustive registry of atom promotion gates. The
 *  application layer constructs an instance of this; the type
 *  system enforces that every atom class has a registered gate. */
export type AtomPromotionGateRegistry = {
  readonly [C in AtomClass]: AtomPromotionGate<C>;
};

export type CompositionPromotionGateRegistry = {
  readonly [S in CompositionSubType]: CompositionPromotionGate<S>;
};

export type ProjectionPromotionGateRegistry = {
  readonly [S in ProjectionSubType]: ProjectionPromotionGate<S>;
};

export type AtomDemotionGateRegistry = {
  readonly [C in AtomClass]: AtomDemotionGate<C>;
};

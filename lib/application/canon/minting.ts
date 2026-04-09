/**
 * Canon mint helpers — the invariant envelope-construction machinery
 * shared by every canon decomposer in this namespace.
 *
 * Every canon decomposer (elements, hints, postures, route-knowledge,
 * surfaces, patterns, snapshots, and every future one) used to
 * duplicate the same ~20 lines of boilerplate per atom or composition:
 *
 *   1. Compute `inputFingerprint = sha256(stableStringify({ address, content }))`
 *      (or `{ address, content, atomReferences }` for compositions).
 *   2. Build the `provenance` struct from the input's producedBy /
 *      producedAt / pipelineVersion fields plus the per-atom `inputs`.
 *   3. Call `atom({...})` or `composition({...})` with every field
 *      named exactly the same way.
 *
 * That boilerplate is the INVARIANT part of decomposition — it's
 * byte-identical across every decomposer and every atom/composition
 * class. The VARIANT part is each decomposer's pure shape
 * transformation (sort, iterate, build `(address, content, inputs)`
 * tuples). Separating the two is the "macro" collapse:
 *
 *   - Decomposers become pure fan-out functions that return
 *     `readonly AtomCandidate<C, T>[]` (or a typed bag of candidates).
 *   - The mint helpers in THIS file take a `CanonProducer` context
 *     plus a candidate and return the fully-populated envelope.
 *
 * The win:
 *
 *   - Every fingerprint formula lives in EXACTLY ONE place. A
 *     future tweak to how fingerprints are computed (e.g., adding
 *     domain separation, versioning, a different hash) propagates
 *     to every canon envelope without touching a single decomposer.
 *   - The `stableStringify` JSON-parity fix ships for free to
 *     every current and future call site.
 *   - Per-decomposer law tests that assert mint invariants
 *     ("determinism", "fingerprint independent of provenance",
 *     "source threading") are duplicated ~40 times across the 7
 *     decomposer test files today. Moving them to a single
 *     `tests/canon-minting.laws.spec.ts` lets the decomposer files
 *     focus on SHAPE tests (cardinality, ordering, content
 *     preservation) without re-asserting plumbing.
 *   - Adding a new canon decomposer shrinks from ~150 lines to
 *     ~30 lines of pure shape transformation.
 *
 * **Reader-monad flavor.** The `CanonProducer` is the "reader
 * environment" — the context every mint operation needs. The mint
 * helpers are monadic in the producer context: given a producer,
 * they turn candidates into envelopes. Decomposers return
 * candidates and defer the mint to the caller, who supplies the
 * producer. This is the pure-functional way to thread context
 * through a batch transformation without passing it into every
 * intermediate step.
 *
 * Pure application — depends only on `lib/domain/pipeline` (typed
 * envelopes), `lib/domain/kernel/hash` (deterministic stringification
 * + sha256). No Effect, no IO, no mutation.
 */

import type { Atom } from '../../domain/pipeline/atom';
import { atom } from '../../domain/pipeline/atom';
import type { AtomClass, AtomAddressOf } from '../../domain/pipeline/atom-address';
import type { Composition, AtomReference } from '../../domain/pipeline/composition';
import { composition } from '../../domain/pipeline/composition';
import type {
  CompositionSubType,
  CompositionAddressOf,
} from '../../domain/pipeline/composition-address';
import type { PhaseOutputSource } from '../../domain/pipeline/source';
import { taggedContentFingerprint } from '../../domain/kernel/hash';

// ─── Producer context (the Reader environment) ──────────────────

/** The "who / when / which-slot" context every canon mint operation
 *  needs. Decomposers receive this once at their call site and pass
 *  it to every mint invocation, instead of threading producedBy /
 *  producedAt / pipelineVersion / source through every intermediate
 *  step. */
export interface CanonProducer {
  /** Which slot of the lookup chain the minted envelopes belong
   *  to. For YAML-migrated canon, use `'agentic-override'`. For
   *  live DOM harvest output, use `'cold-derivation'` or
   *  `'live-derivation'`. */
  readonly source: PhaseOutputSource;
  /** Stable identifier for the producer. Convention:
   *  `'canon-decomposer:{kind}:v{n}'`. */
  readonly producedBy: string;
  /** ISO timestamp the mint operation was performed at. */
  readonly producedAt: string;
  /** Optional pipeline version (commit SHA or build tag). */
  readonly pipelineVersion?: string;
}

/** Project a `CanonProducer` out of a decomposer's existing Input
 *  shape. Every canon decomposer's input type has the same four
 *  fields; this helper saves every decomposer from re-spelling the
 *  projection. */
export function producerFrom<T extends {
  readonly source: PhaseOutputSource;
  readonly producedBy: string;
  readonly producedAt: string;
  readonly pipelineVersion?: string;
}>(input: T): CanonProducer {
  return {
    source: input.source,
    producedBy: input.producedBy,
    producedAt: input.producedAt,
    pipelineVersion: input.pipelineVersion,
  };
}

// ─── Atom candidate and mint ────────────────────────────────────

/** A pre-envelope atom candidate — carries the address, the content,
 *  the per-atom upstream input references, and an optional quality
 *  score. The mint helper turns a candidate into a typed `Atom<C, T>`
 *  envelope by computing the fingerprint and attaching provenance
 *  from the `CanonProducer` context. */
export interface AtomCandidate<C extends AtomClass, T> {
  /** The atom's typed address. The `.class` field on the address
   *  becomes the atom envelope's `class` field. */
  readonly address: AtomAddressOf<C>;
  /** The atom's content — typed per atom class, typically an
   *  existing domain type from `lib/domain/knowledge/types.ts`. */
  readonly content: T;
  /** Upstream input references for the demotion machinery. When
   *  an upstream input changes, atoms whose `inputs` list contains
   *  the changed reference become demotion candidates. */
  readonly inputs: readonly string[];
  /** Optional quality score from the discovery engine or scoring
   *  heuristic. Used by the promotion gate to rank candidates. */
  readonly qualityScore?: number;
}

/** Turn an atom candidate into a fully-populated `Atom<C, T>`
 *  envelope. Pure function — same (producer, candidate) input
 *  always produces the same envelope, including the same
 *  `inputFingerprint`.
 *
 *  Fingerprint formula (the load-bearing single source of truth):
 *
 *      inputFingerprint = sha256(stableStringify({ address, content }))
 *
 *  The fingerprint covers ONLY the address and the content — not
 *  the producer, not the inputs, not the quality score. This is
 *  the load-bearing property that makes warm-vs-cold invocations
 *  with identical content produce byte-equal fingerprints (the
 *  cold-start ↔ warm-start interop contract from
 *  `docs/canon-and-derivation.md` § 8.1).
 */
export function mintAtom<C extends AtomClass, T>(
  producer: CanonProducer,
  candidate: AtomCandidate<C, T>,
): Atom<C, T> {
  const inputFingerprint = taggedContentFingerprint({
    address: candidate.address,
    content: candidate.content,
  });
  return atom<C, T>({
    class: candidate.address.class as C,
    address: candidate.address,
    content: candidate.content,
    source: producer.source,
    inputFingerprint,
    provenance: {
      producedBy: producer.producedBy,
      producedAt: producer.producedAt,
      pipelineVersion: producer.pipelineVersion,
      inputs: candidate.inputs,
    },
    qualityScore: candidate.qualityScore,
  });
}

/** Batch-mint atom candidates with the same producer. Pure function
 *  — equivalent to `candidates.map(c => mintAtom(producer, c))` but
 *  reads more naturally at the decomposer call site. */
export function mintAtoms<C extends AtomClass, T>(
  producer: CanonProducer,
  candidates: ReadonlyArray<AtomCandidate<C, T>>,
): readonly Atom<C, T>[] {
  return candidates.map((c) => mintAtom(producer, c));
}

// ─── Composition candidate and mint ─────────────────────────────

/** A pre-envelope composition candidate — carries the address,
 *  content, the list of atom references the composition depends
 *  on, the per-composition upstream input references, and an
 *  optional quality score. */
export interface CompositionCandidate<S extends CompositionSubType, T> {
  readonly address: CompositionAddressOf<S>;
  readonly content: T;
  /** Typed references to the atoms this composition depends on.
   *  Part of the fingerprint — a composition that refers to
   *  different atoms has a different fingerprint. */
  readonly atomReferences: readonly AtomReference[];
  readonly inputs: readonly string[];
  readonly qualityScore?: number;
}

/** Turn a composition candidate into a fully-populated
 *  `Composition<S, T>` envelope. Pure function.
 *
 *  Fingerprint formula:
 *
 *      inputFingerprint = sha256(stableStringify({
 *        address,
 *        content,
 *        atomReferences: [{ address, role, order }, ...],
 *      }))
 *
 *  The atomReferences are normalized (projected to
 *  `{ address, role, order }`) before fingerprinting so additional
 *  optional fields added to `AtomReference` later don't invalidate
 *  existing fingerprints unless they participate in the normalized
 *  projection. This matches the prior per-decomposer behavior from
 *  `decomposeRouteKnowledge` and `decomposeScreenSurfaces`.
 */
export function mintComposition<S extends CompositionSubType, T>(
  producer: CanonProducer,
  candidate: CompositionCandidate<S, T>,
): Composition<S, T> {
  const inputFingerprint = taggedContentFingerprint({
    address: candidate.address,
    content: candidate.content,
    atomReferences: candidate.atomReferences.map((ref) => ({
      address: ref.address,
      role: ref.role,
      order: ref.order,
    })),
  });
  return composition<S, T>({
    subType: candidate.address.subType as S,
    address: candidate.address,
    content: candidate.content,
    atomReferences: candidate.atomReferences,
    source: producer.source,
    inputFingerprint,
    provenance: {
      producedBy: producer.producedBy,
      producedAt: producer.producedAt,
      pipelineVersion: producer.pipelineVersion,
      inputs: candidate.inputs,
    },
    qualityScore: candidate.qualityScore,
  });
}

/** Batch-mint composition candidates with the same producer. */
export function mintCompositions<S extends CompositionSubType, T>(
  producer: CanonProducer,
  candidates: ReadonlyArray<CompositionCandidate<S, T>>,
): readonly Composition<S, T>[] {
  return candidates.map((c) => mintComposition(producer, c));
}

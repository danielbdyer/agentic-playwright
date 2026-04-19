/**
 * Phase output source classifier.
 *
 * Every phase output (atom, composition, projection) carries a
 * `source` field telling consumers which slot of the lookup chain
 * the output came from. The source determines how the consumer
 * interprets the output and what governance rules apply.
 *
 * Per the canon-and-derivation doctrine § 6 The lookup precedence
 * chain, there are six slots during the reference-canon transition:
 *
 *   1. operator-override         — canonical source, slot 1
 *   2. agentic-override          — canonical artifact (agentic), slot 2
 *   3. deterministic-observation — canonical artifact (deterministic), slot 3
 *   4. reference-canon           — TRANSITIONAL pre-gate fallback, slot 4
 *   5. live-derivation           — derived output (cache), slot 5
 *   6. cold-derivation           — derived output (in-process), slot 6
 *
 * Slot 4 (`reference-canon`) is the transitional population added
 * in the 2026-04-10 reference-canon reframe (see canon-and-derivation
 * § 3.2a). It holds pre-gate committed content — today's
 * `dogfood/knowledge/**`, `dogfood/benchmarks/**`, and non-intent
 * `dogfood/controls/**` — that is consulted at runtime as fallback
 * but carries no intervention-receipt lineage and no promotion-gate
 * provenance. It is NOT a canonical artifact: `isCanonicalArtifact`
 * returns false for it. It IS demotable: `isDemotable` returns true
 * for it, because Commit 5 of the synthetic feature completion plan
 * runs an automatic demotion sweep that proposes removal whenever a
 * real agentic override or deterministic observation lands at the
 * same address.
 *
 * When reference canon is empty (every entry has been superseded or
 * deleted), slot 4 retires and the chain collapses back to five
 * slots. See canon-and-derivation § 14.0 for the graduation
 * condition.
 *
 * The source classifier is a discriminated union, exhaustively
 * folded by the lookup chain and the promotion gate machinery.
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

// ─── The source discriminated union ──────────────────────────────

export type PhaseOutputSource =
  | 'operator-override'
  | 'agentic-override'
  | 'deterministic-observation'
  | 'reference-canon'
  | 'live-derivation'
  | 'cold-derivation';

/** All possible sources, in lookup-chain precedence order. The first
 *  entry has the highest precedence (operator override wins). The
 *  `reference-canon` slot sits below both canonical-artifact flavors
 *  and above both derived-output flavors — it is a transitional
 *  fallback, clearly second-class to real canon but still above
 *  anything the discovery engine re-derives fresh. */
export const SOURCE_PRECEDENCE: readonly PhaseOutputSource[] = [
  'operator-override',
  'agentic-override',
  'deterministic-observation',
  'reference-canon',
  'live-derivation',
  'cold-derivation',
];

// ─── Source classification predicates ────────────────────────────

/** True when the source is a canonical artifact (slot 2 or 3).
 *
 *  NOTE: reference canon is DELIBERATELY excluded. Per
 *  canon-and-derivation § 3.2a, reference canon is a transitional
 *  sub-population that never earned canonical-artifact status. It
 *  is a fallback, not ground truth. Calling it "canonical artifact"
 *  would launder pre-gate content into the trusted layer — exactly
 *  the confusion the 2026-04-10 reframe exists to prevent. */
export function isCanonicalArtifact(source: PhaseOutputSource): boolean {
  return source === 'agentic-override' || source === 'deterministic-observation';
}

/** True when the source is a canonical source (slot 1).
 *  Note: only operator overrides are canonical sources at this layer.
 *  Other canonical sources (`.ado-sync/`, `controls/`, `benchmarks/`)
 *  are inputs to the pipeline, not phase outputs. */
export function isCanonicalSource(source: PhaseOutputSource): boolean {
  return source === 'operator-override';
}

/** True when the source is reference canon (slot 4, transitional).
 *  Reference canon is consulted as fallback during warm-start runs
 *  but is NOT a canonical artifact. Over time, reference canon
 *  shrinks as real agentic overrides and deterministic observations
 *  supplant it; when empty, the slot retires. See
 *  canon-and-derivation § 3.2a. */
export function isReferenceCanon(source: PhaseOutputSource): boolean {
  return source === 'reference-canon';
}

/** True when the source is derived (slot 5 or 6). Derived outputs
 *  are candidates for promotion but are not yet canonical artifacts.
 *
 *  NOTE: reference canon is NOT derived output. It is committed
 *  pre-gate content that already exists on disk. Derived output is
 *  generated fresh by a pipeline run and lives in `.tesseract/cache/`
 *  or in-process only. */
export function isDerivedOutput(source: PhaseOutputSource): boolean {
  return source === 'live-derivation' || source === 'cold-derivation';
}

/** True when the source can be promoted to a canonical artifact.
 *  Only derived outputs are promotable; canonical sources and
 *  artifacts are already at the top of the chain, and reference
 *  canon is NOT promoted in place — it is SUPERSEDED by real
 *  canonical artifacts at the same address via the demotion sweep
 *  (synthetic feature completion plan Commit 5). */
export function isPromotable(source: PhaseOutputSource): boolean {
  return isDerivedOutput(source);
}

/** True when the source can be demoted (removed via deliberate
 *  gesture).
 *
 *  Canonical artifacts (slots 2 and 3) are demotable via
 *  operator review or the demotion machinery in canon-and-derivation
 *  § 7.2. Reference canon (slot 4) is also demotable — via the
 *  automatic sweep described in the synthetic feature completion
 *  plan Commit 5, which proposes demotion whenever a real agentic
 *  override or deterministic observation lands at the same address.
 *
 *  Canonical sources (slot 1) are operator-authoritative and never
 *  demoted; derived outputs (slots 5-6) are wiped, not demoted. */
export function isDemotable(source: PhaseOutputSource): boolean {
  return isCanonicalArtifact(source) || isReferenceCanon(source);
}

// ─── Exhaustive fold ─────────────────────────────────────────────

/** Exhaustive case analysis over PhaseOutputSource. The TypeScript
 *  compiler enforces that all six cases are handled. Use this
 *  instead of switch statements so adding a new source variant
 *  fails to compile until every consumer handles it. */
export function foldPhaseOutputSource<R>(
  source: PhaseOutputSource,
  cases: {
    readonly operatorOverride: () => R;
    readonly agenticOverride: () => R;
    readonly deterministicObservation: () => R;
    readonly referenceCanon: () => R;
    readonly liveDerivation: () => R;
    readonly coldDerivation: () => R;
  },
): R {
  switch (source) {
    case 'operator-override':
      return cases.operatorOverride();
    case 'agentic-override':
      return cases.agenticOverride();
    case 'deterministic-observation':
      return cases.deterministicObservation();
    case 'reference-canon':
      return cases.referenceCanon();
    case 'live-derivation':
      return cases.liveDerivation();
    case 'cold-derivation':
      return cases.coldDerivation();
  }
}

/** Compare two sources by precedence. Returns a negative number when
 *  `a` has higher precedence than `b`, zero when equal, positive
 *  otherwise. Used by the lookup chain to pick the winning source
 *  when multiple are present for the same address. */
export function compareSourcePrecedence(
  a: PhaseOutputSource,
  b: PhaseOutputSource,
): number {
  return SOURCE_PRECEDENCE.indexOf(a) - SOURCE_PRECEDENCE.indexOf(b);
}

// ─── Posture-to-Source bounds ─────────────────────────────────────
//
// Each knowledge posture restricts which PhaseOutputSource values
// are valid for artifacts in a catalog loaded at that posture.
// These types make the restriction compile-checkable.

/** cold-start: the agent derived everything from scratch.
 *  Only cold and live derivation are valid. Reference canon is
 *  DELIBERATELY excluded — cold-start means "I know nothing," and
 *  consulting pre-gate fallback content would defeat the posture's
 *  point. */
export type ColdStartSource = 'cold-derivation' | 'live-derivation';

/** warm-start: prior knowledge is available. All sources except
 *  operator-override (which implies production governance). Reference
 *  canon IS included — it is the transitional warm-start fallback
 *  during the migration. */
export type WarmStartSource =
  | 'agentic-override'
  | 'deterministic-observation'
  | 'reference-canon'
  | 'live-derivation'
  | 'cold-derivation';

/** production: the full source ladder including operator-approved
 *  overrides. */
export type ProductionSource = PhaseOutputSource;

/** Map a KnowledgePosture to its allowed source bound. Use in
 *  function signatures to constrain atoms/compositions/projections
 *  to sources valid for the given posture. */
export type PostureSourceBound<P extends import('../governance/workflow-types').KnowledgePosture> =
  P extends 'cold-start' ? ColdStartSource :
  P extends 'warm-start' ? WarmStartSource :
  P extends 'production' ? ProductionSource :
  PhaseOutputSource;

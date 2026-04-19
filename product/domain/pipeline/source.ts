/**
 * Phase output source classifier.
 *
 * Every phase output (atom, composition, projection) carries a
 * `source` field telling consumers which slot of the lookup chain
 * the output came from. The source determines how the consumer
 * interprets the output and what governance rules apply.
 *
 * After Step 1 of the v2 construction order (2026-04-19 reference-
 * canon retirement), the lookup chain has five slots:
 *
 *   1. operator-override         — canonical source, slot 1
 *   2. agentic-override          — canonical artifact (agentic), slot 2
 *   3. deterministic-observation — canonical artifact (deterministic), slot 3
 *   4. live-derivation           — derived output (cache), slot 4
 *   5. cold-derivation           — derived output (in-process), slot 5
 *
 * The `reference-canon` transitional slot that the 2026-04-10 reframe
 * introduced has retired. Pre-gate dogfood content no longer feeds
 * the runtime; testbed content derives from the product manifest at
 * Step 5 (`workshop/probe-derivation/`) and runs through the same
 * agentic-override / deterministic-observation paths as customer
 * content. See `v2-direction.md §4B` for the rationale and
 * `docs/v1-reference/canon-and-derivation.md` for the now-historical
 * six-slot behavior.
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
  | 'live-derivation'
  | 'cold-derivation';

/** All possible sources, in lookup-chain precedence order. The first
 *  entry has the highest precedence (operator override wins). Derived
 *  outputs sit below canonical artifacts; there is no transitional
 *  slot between them. */
export const SOURCE_PRECEDENCE: readonly PhaseOutputSource[] = [
  'operator-override',
  'agentic-override',
  'deterministic-observation',
  'live-derivation',
  'cold-derivation',
];

// ─── Source classification predicates ────────────────────────────

/** True when the source is a canonical artifact (slot 2 or 3). */
export function isCanonicalArtifact(source: PhaseOutputSource): boolean {
  return source === 'agentic-override' || source === 'deterministic-observation';
}

/** True when the source is a canonical source (slot 1).
 *  Note: only operator overrides are canonical sources at this layer.
 *  Other canonical sources (`.ado-sync/`, pure-intent controls) are
 *  inputs to the pipeline, not phase outputs. */
export function isCanonicalSource(source: PhaseOutputSource): boolean {
  return source === 'operator-override';
}

/** True when the source is derived (slot 4 or 5). Derived outputs
 *  are candidates for promotion but are not yet canonical artifacts.
 *  Derived output is generated fresh by a pipeline run and lives in
 *  `.tesseract/cache/` or in-process only. */
export function isDerivedOutput(source: PhaseOutputSource): boolean {
  return source === 'live-derivation' || source === 'cold-derivation';
}

/** True when the source can be promoted to a canonical artifact.
 *  Only derived outputs are promotable; canonical sources and
 *  artifacts are already at the top of the chain. */
export function isPromotable(source: PhaseOutputSource): boolean {
  return isDerivedOutput(source);
}

/** True when the source can be demoted (removed via deliberate
 *  gesture). After Step 1 this is identical to
 *  `isCanonicalArtifact`: canonical sources (slot 1) are
 *  operator-authoritative and never demoted; derived outputs
 *  (slots 4–5) are wiped, not demoted. Kept as a named alias so
 *  existing consumers read clearly at the callsite. */
export function isDemotable(source: PhaseOutputSource): boolean {
  return isCanonicalArtifact(source);
}

// ─── Exhaustive fold ─────────────────────────────────────────────

/** Exhaustive case analysis over PhaseOutputSource. The TypeScript
 *  compiler enforces that all five cases are handled. Use this
 *  instead of switch statements so adding a new source variant
 *  fails to compile until every consumer handles it. */
export function foldPhaseOutputSource<R>(
  source: PhaseOutputSource,
  cases: {
    readonly operatorOverride: () => R;
    readonly agenticOverride: () => R;
    readonly deterministicObservation: () => R;
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
 *  Only cold and live derivation are valid. */
export type ColdStartSource = 'cold-derivation' | 'live-derivation';

/** warm-start: prior knowledge is available. All sources except
 *  operator-override (which implies production governance). */
export type WarmStartSource =
  | 'agentic-override'
  | 'deterministic-observation'
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

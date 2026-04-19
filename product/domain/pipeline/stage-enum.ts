/**
 * Pipeline stage enumeration.
 *
 * Names every phase of the system pipeline. The PipelineStage union is
 * the discriminator for typed phase outputs (Atom, Composition,
 * Projection): each phase output knows which stage produced it.
 *
 * Discovery is a meta-stage that decomposes into sub-phases (one per
 * atom class). The full enumeration uses dotted names to encode the
 * sub-phase relationship: `discovery.routes`, `discovery.screens`,
 * `discovery.elements`, etc. Top-level stages have a single token.
 *
 * Per the canon-and-derivation doctrine § 5.1 The phases:
 *
 *   sync     → external upstream → .ado-sync/snapshots/
 *   parse    → snapshots → scenarios
 *   discovery → scenarios + SUT → atoms (sub-phases per atom class)
 *   bind     → scenarios + atoms + canonical sources → bound artifacts
 *   iterate  → bound + substrate → run records, proposals, candidate
 *               substrate updates
 *   fitness  → run records → fitness reports
 *   score    → fitness reports + L4 baselines → metric trees + deltas
 *   emit     → bound artifacts → playwright spec files
 *
 * Pure domain — no Effect, no IO, no application imports.
 */

// ─── Top-level stages ────────────────────────────────────────────

export const TOP_LEVEL_STAGES = [
  'sync',
  'parse',
  'discovery',
  'bind',
  'iterate',
  'fitness',
  'score',
  'emit',
] as const;

export type TopLevelStage = typeof TOP_LEVEL_STAGES[number];

// ─── Discovery sub-phases ────────────────────────────────────────
//
// Each sub-phase produces atoms of one class. The discovery engine
// for class C runs as a sub-phase of `discovery` and emits
// `Atom<C>` instances.

export const DISCOVERY_SUB_PHASES = [
  'discovery.routes',
  'discovery.route-variants',
  'discovery.screens',
  'discovery.surfaces',
  'discovery.elements',
  'discovery.postures',
  'discovery.affordances',
  'discovery.selectors',
  'discovery.patterns',
  'discovery.snapshots',
  'discovery.transitions',
  'discovery.observation-predicates',
  'discovery.drift-modes',
  'discovery.resolution-overrides',
  'discovery.posture-samples',
] as const;

export type DiscoverySubPhase = typeof DISCOVERY_SUB_PHASES[number];

// ─── Composition sub-phases ──────────────────────────────────────
//
// Each composition sub-phase produces compositions of one sub-type.
// Compositions are higher-order patterns over atoms.

export const COMPOSITION_SUB_PHASES = [
  'composition.archetypes',
  'composition.flows',
  'composition.runbooks',
  'composition.route-graphs',
  'composition.expansion-rules',
  'composition.surface-compositions',
  'composition.recipe-templates',
] as const;

export type CompositionSubPhase = typeof COMPOSITION_SUB_PHASES[number];

// ─── Projection sub-phases ───────────────────────────────────────
//
// Each projection sub-phase produces projections of one sub-type.
// Projections constrain the atom set by qualifier (role, wizard
// state, feature flag, etc.).

export const PROJECTION_SUB_PHASES = [
  'projection.role-visibility',
  'projection.role-interaction',
  'projection.wizard-state',
  'projection.permission-groups',
  'projection.posture-availability',
  'projection.process-state',
  'projection.feature-flags',
] as const;

export type ProjectionSubPhase = typeof PROJECTION_SUB_PHASES[number];

// ─── The full PipelineStage union ────────────────────────────────

export type PipelineStage =
  | TopLevelStage
  | DiscoverySubPhase
  | CompositionSubPhase
  | ProjectionSubPhase;

/** Type-narrowing predicate. */
export function isDiscoverySubPhase(stage: PipelineStage): stage is DiscoverySubPhase {
  return (DISCOVERY_SUB_PHASES as readonly string[]).includes(stage);
}

/** Type-narrowing predicate. */
export function isCompositionSubPhase(stage: PipelineStage): stage is CompositionSubPhase {
  return (COMPOSITION_SUB_PHASES as readonly string[]).includes(stage);
}

/** Type-narrowing predicate. */
export function isProjectionSubPhase(stage: PipelineStage): stage is ProjectionSubPhase {
  return (PROJECTION_SUB_PHASES as readonly string[]).includes(stage);
}

/** Type-narrowing predicate. */
export function isTopLevelStage(stage: PipelineStage): stage is TopLevelStage {
  return (TOP_LEVEL_STAGES as readonly string[]).includes(stage);
}

/** Which interface-model tier does a stage's output belong to?
 *  Discovery sub-phases produce Tier 1 atoms.
 *  Composition sub-phases produce Tier 2 compositions.
 *  Projection sub-phases produce Tier 3 projections.
 *  Top-level stages produce non-tier outputs (run records, fitness
 *  reports, scenarios, etc.) and are classified as 'untiered'. */
export type InterfaceModelTier = 'atom' | 'composition' | 'projection' | 'untiered';

export function tierOfStage(stage: PipelineStage): InterfaceModelTier {
  if (isDiscoverySubPhase(stage)) return 'atom';
  if (isCompositionSubPhase(stage)) return 'composition';
  if (isProjectionSubPhase(stage)) return 'projection';
  return 'untiered';
}

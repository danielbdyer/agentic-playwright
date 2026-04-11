/**
 * Effect schemas for the three-tier interface model canonical
 * artifacts (atoms / compositions / projections).
 *
 * Per docs/canon-and-derivation.md § 3.5–3.8 and the existing
 * schema convention in this directory, every artifact type has a
 * corresponding `Schema.Struct` (or `Schema.Union`) definition.
 * Validators in `lib/domain/validation/canonical-artifacts.ts`
 * wrap these with `decoderFor<T>(schema)`.
 *
 * Branded ID schemas live here (rather than in primitives.ts) so
 * they're co-located with the pipeline-specific shapes that use
 * them. They produce branded string types compatible with the
 * `Brand<string, Name>` declarations in
 * `lib/domain/pipeline/composition-address.ts` and
 * `lib/domain/pipeline/projection-address.ts`.
 */

import { Schema } from 'effect';
import {
  RouteIdSchema,
  RouteVariantIdSchema,
  ScreenIdSchema,
  SurfaceIdSchema,
  ElementIdSchema,
  PostureIdSchema,
  SnapshotTemplateIdSchema,
} from './primitives';

// ─── Branded ID schemas for the pipeline namespace ───────────────

export const ArchetypeIdSchema = Schema.String.pipe(Schema.brand('ArchetypeId'));
export const FlowIdSchema = Schema.String.pipe(Schema.brand('FlowId'));
export const RunbookIdSchema = Schema.String.pipe(Schema.brand('RunbookId'));
export const RouteGraphIdSchema = Schema.String.pipe(Schema.brand('RouteGraphId'));
export const ExpansionRulesIdSchema = Schema.String.pipe(Schema.brand('ExpansionRulesId'));
export const SurfaceCompositionIdSchema = Schema.String.pipe(Schema.brand('SurfaceCompositionId'));
export const RecipeTemplateIdSchema = Schema.String.pipe(Schema.brand('RecipeTemplateId'));

export const RoleIdSchema = Schema.String.pipe(Schema.brand('RoleId'));
export const WizardIdSchema = Schema.String.pipe(Schema.brand('WizardId'));
export const WizardStateIdSchema = Schema.String.pipe(Schema.brand('WizardStateId'));
export const PermissionGroupIdSchema = Schema.String.pipe(Schema.brand('PermissionGroupId'));
export const EntityKindSchema = Schema.String.pipe(Schema.brand('EntityKind'));
export const ProcessStateIdSchema = Schema.String.pipe(Schema.brand('ProcessStateId'));
export const FeatureFlagIdSchema = Schema.String.pipe(Schema.brand('FeatureFlagId'));

// ─── Phase output source ─────────────────────────────────────────

export const PhaseOutputSourceSchema = Schema.Literal(
  'operator-override',
  'agentic-override',
  'deterministic-observation',
  'reference-canon',
  'live-derivation',
  'cold-derivation',
);

// ─── Shared provenance schema ────────────────────────────────────
//
// Atom, Composition, and Projection provenances have identical
// shape — share the schema and let TypeScript infer the same shape
// per envelope.

export const ArtifactProvenanceSchema = Schema.Struct({
  producedBy: Schema.String,
  producedAt: Schema.String,
  pipelineVersion: Schema.optional(Schema.String),
  inputs: Schema.optional(Schema.Array(Schema.String)),
});

// ─── Atom address union (15 variants) ────────────────────────────

const RouteAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('route'),
  id: RouteIdSchema,
});
const RouteVariantAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('route-variant'),
  route: RouteIdSchema,
  variant: RouteVariantIdSchema,
});
const ScreenAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('screen'),
  screen: ScreenIdSchema,
});
const SurfaceAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('surface'),
  screen: ScreenIdSchema,
  surface: SurfaceIdSchema,
});
const ElementAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('element'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
});
const PostureAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('posture'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
  posture: PostureIdSchema,
});
const AffordanceAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('affordance'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
  affordance: Schema.String,
});
const SelectorAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('selector'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
  rung: Schema.String,
});
const PatternAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('pattern'),
  id: Schema.String,
});
const SnapshotAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('snapshot'),
  id: SnapshotTemplateIdSchema,
});
const TransitionAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('transition'),
  fromScreen: ScreenIdSchema,
  toScreen: ScreenIdSchema,
  trigger: Schema.String,
});
const ObservationPredicateAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('observation-predicate'),
  screen: ScreenIdSchema,
  id: Schema.String,
});
const DriftModeAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('drift-mode'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
  kind: Schema.String,
});
const ResolutionOverrideAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('resolution-override'),
  screen: ScreenIdSchema,
  intentFingerprint: Schema.String,
});
const PostureSampleAtomAddressSchema = Schema.Struct({
  class: Schema.Literal('posture-sample'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
  posture: PostureIdSchema,
});

export const AtomAddressSchema = Schema.Union(
  RouteAtomAddressSchema,
  RouteVariantAtomAddressSchema,
  ScreenAtomAddressSchema,
  SurfaceAtomAddressSchema,
  ElementAtomAddressSchema,
  PostureAtomAddressSchema,
  AffordanceAtomAddressSchema,
  SelectorAtomAddressSchema,
  PatternAtomAddressSchema,
  SnapshotAtomAddressSchema,
  TransitionAtomAddressSchema,
  ObservationPredicateAtomAddressSchema,
  DriftModeAtomAddressSchema,
  ResolutionOverrideAtomAddressSchema,
  PostureSampleAtomAddressSchema,
);

// ─── Composition address union (7 variants) ──────────────────────

const ArchetypeCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('archetype'),
  id: ArchetypeIdSchema,
});
const FlowCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('flow'),
  id: FlowIdSchema,
});
const RunbookCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('runbook'),
  id: RunbookIdSchema,
});
const RouteGraphCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('route-graph'),
  id: RouteGraphIdSchema,
});
const ExpansionRuleCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('expansion-rule'),
  id: ExpansionRulesIdSchema,
});
const SurfaceCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('surface-composition'),
  screen: ScreenIdSchema,
  id: SurfaceCompositionIdSchema,
});
const RecipeTemplateCompositionAddressSchema = Schema.Struct({
  subType: Schema.Literal('recipe-template'),
  id: RecipeTemplateIdSchema,
});

export const CompositionAddressSchema = Schema.Union(
  ArchetypeCompositionAddressSchema,
  FlowCompositionAddressSchema,
  RunbookCompositionAddressSchema,
  RouteGraphCompositionAddressSchema,
  ExpansionRuleCompositionAddressSchema,
  SurfaceCompositionAddressSchema,
  RecipeTemplateCompositionAddressSchema,
);

// ─── Projection address union (7 variants) ───────────────────────

const RoleVisibilityProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('role-visibility'),
  role: RoleIdSchema,
});
const RoleInteractionProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('role-interaction'),
  role: RoleIdSchema,
});
const WizardStateProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('wizard-state'),
  wizard: WizardIdSchema,
  state: WizardStateIdSchema,
});
const PermissionGroupProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('permission-group'),
  group: PermissionGroupIdSchema,
});
const PostureAvailabilityProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('posture-availability'),
  screen: ScreenIdSchema,
  element: ElementIdSchema,
});
const ProcessStateProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('process-state'),
  entity: EntityKindSchema,
  state: ProcessStateIdSchema,
});
const FeatureFlagProjectionAddressSchema = Schema.Struct({
  subType: Schema.Literal('feature-flag'),
  flag: FeatureFlagIdSchema,
});

export const ProjectionAddressSchema = Schema.Union(
  RoleVisibilityProjectionAddressSchema,
  RoleInteractionProjectionAddressSchema,
  WizardStateProjectionAddressSchema,
  PermissionGroupProjectionAddressSchema,
  PostureAvailabilityProjectionAddressSchema,
  ProcessStateProjectionAddressSchema,
  FeatureFlagProjectionAddressSchema,
);

// ─── Atom envelope schema ────────────────────────────────────────
//
// `class` is one of the 15 atom-class literals; `address` is the
// AtomAddress union; the cross-field invariant
// (`class === address.class`) is checked by a refinement after
// structural decoding.

const AtomClassSchema = Schema.Literal(
  'route',
  'route-variant',
  'screen',
  'surface',
  'element',
  'posture',
  'affordance',
  'selector',
  'pattern',
  'snapshot',
  'transition',
  'observation-predicate',
  'drift-mode',
  'resolution-override',
  'posture-sample',
);

export const AtomEnvelopeSchema = Schema.Struct({
  class: AtomClassSchema,
  address: AtomAddressSchema,
  content: Schema.Unknown,
  source: PhaseOutputSourceSchema,
  inputFingerprint: Schema.String,
  provenance: ArtifactProvenanceSchema,
  qualityScore: Schema.optional(Schema.Number),
}).pipe(
  Schema.filter(
    (value) => value.class === value.address.class,
    {
      identifier: 'AtomClassAddressConsistency',
      message: () => 'Atom envelope class field must equal address.class',
    },
  ),
);

// ─── AtomReference schema (for compositions) ─────────────────────

export const AtomReferenceSchema = Schema.Struct({
  address: AtomAddressSchema,
  role: Schema.optional(Schema.String),
  order: Schema.optional(Schema.Number),
});

// ─── Composition envelope schema ─────────────────────────────────

const CompositionSubTypeSchema = Schema.Literal(
  'archetype',
  'flow',
  'runbook',
  'route-graph',
  'expansion-rule',
  'surface-composition',
  'recipe-template',
);

export const CompositionEnvelopeSchema = Schema.Struct({
  subType: CompositionSubTypeSchema,
  address: CompositionAddressSchema,
  content: Schema.Unknown,
  atomReferences: Schema.Array(AtomReferenceSchema),
  source: PhaseOutputSourceSchema,
  inputFingerprint: Schema.String,
  provenance: ArtifactProvenanceSchema,
  qualityScore: Schema.optional(Schema.Number),
}).pipe(
  Schema.filter(
    (value) => value.subType === value.address.subType,
    {
      identifier: 'CompositionSubTypeAddressConsistency',
      message: () => 'Composition envelope subType must equal address.subType',
    },
  ),
);

// ─── Projection envelope schema ──────────────────────────────────

const AtomApplicabilitySchema = Schema.Literal(
  'visible',
  'interactive',
  'read-only',
  'hidden',
  'gated',
);

const BindingConditionSchema = Schema.Struct({
  kind: Schema.String,
  description: Schema.String,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

const AtomBindingSchema = Schema.Struct({
  address: AtomAddressSchema,
  applicability: AtomApplicabilitySchema,
  conditions: Schema.optional(Schema.Array(BindingConditionSchema)),
});

const ProjectionSubTypeSchema = Schema.Literal(
  'role-visibility',
  'role-interaction',
  'wizard-state',
  'permission-group',
  'posture-availability',
  'process-state',
  'feature-flag',
);

export const ProjectionEnvelopeSchema = Schema.Struct({
  subType: ProjectionSubTypeSchema,
  address: ProjectionAddressSchema,
  bindings: Schema.Array(AtomBindingSchema),
  source: PhaseOutputSourceSchema,
  inputFingerprint: Schema.String,
  provenance: ArtifactProvenanceSchema,
  qualityScore: Schema.optional(Schema.Number),
}).pipe(
  Schema.filter(
    (value) => value.subType === value.address.subType,
    {
      identifier: 'ProjectionSubTypeAddressConsistency',
      message: () => 'Projection envelope subType must equal address.subType',
    },
  ),
);

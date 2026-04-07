import { Schema } from 'effect';
import {
  SurfaceKindSchema,
  AssertionKindSchema,
  EffectTargetKindSchema,
  EffectStateSchema,
  TrustPolicyArtifactTypeSchema,
  StepActionSchema,
  StatePredicateSemanticSchema,
  TransitionEffectKindSchema,
  PatternActionNameSchema,
} from './enums';
import {
  ScreenIdSchema,
  SectionIdSchema,
  SurfaceIdSchema,
  ElementIdSchema,
  SnapshotTemplateIdSchema,
  WidgetIdSchema,
  CanonicalTargetRefSchema,
  StateNodeRefSchema,
  EventSignatureRefSchema,
  TransitionRefSchema,
  NullableString,
  StringArray,
  NullableScreenId,
  NullableElementId,
  NullablePostureId,
  NullableSnapshotTemplateId,
  NullableCanonicalTargetRef,
  NullableSelectorRef,
} from './primitives';
import { CanonicalKnowledgeMetadataSchema, LocatorStrategySchema } from './workflow';

// ─── Surface Graph ───

export const SurfaceSectionSchema = Schema.Struct({
  selector: Schema.String,
  url: Schema.optional(Schema.String),
  kind: SurfaceKindSchema,
  surfaces: Schema.optionalWith(Schema.Array(SurfaceIdSchema), { default: () => [] as readonly (typeof SurfaceIdSchema.Type)[] }),
  snapshot: Schema.optionalWith(Schema.NullOr(SnapshotTemplateIdSchema), { default: () => null }),
});

export const SurfaceDefinitionSchema = Schema.Struct({
  kind: SurfaceKindSchema,
  section: SectionIdSchema,
  selector: Schema.String,
  parents: Schema.optionalWith(Schema.Array(SurfaceIdSchema), { default: () => [] as readonly (typeof SurfaceIdSchema.Type)[] }),
  children: Schema.optionalWith(Schema.Array(SurfaceIdSchema), { default: () => [] as readonly (typeof SurfaceIdSchema.Type)[] }),
  elements: Schema.optionalWith(Schema.Array(ElementIdSchema), { default: () => [] as readonly (typeof ElementIdSchema.Type)[] }),
  assertions: Schema.optionalWith(Schema.Array(AssertionKindSchema), { default: () => [] as readonly (typeof AssertionKindSchema.Type)[] }),
  required: Schema.optional(Schema.Boolean),
});

export const SurfaceGraphSchema = Schema.Struct({
  screen: ScreenIdSchema,
  url: Schema.String,
  sections: Schema.optionalWith(Schema.Record({ key: Schema.String, value: SurfaceSectionSchema }), { default: () => ({}) }),
  surfaces: Schema.optionalWith(Schema.Record({ key: Schema.String, value: SurfaceDefinitionSchema }), { default: () => ({}) }),
});

// ─── Screen Elements ───

export const ElementSigSchema = Schema.Struct({
  role: Schema.String,
  name: Schema.optionalWith(NullableString, { default: () => null }),
  testId: Schema.optionalWith(NullableString, { default: () => null }),
  cssFallback: Schema.optionalWith(NullableString, { default: () => null }),
  locator: Schema.optional(Schema.Array(LocatorStrategySchema)),
  surface: SurfaceIdSchema,
  widget: WidgetIdSchema,
  affordance: Schema.optionalWith(NullableString, { default: () => null }),
  required: Schema.optional(Schema.Boolean),
});

export const ScreenElementsSchema = Schema.Struct({
  screen: ScreenIdSchema,
  url: Schema.String,
  elements: Schema.Record({ key: Schema.String, value: ElementSigSchema }),
});

// ─── Screen Hints ───

export const ScreenElementHintSchema = Schema.Struct({
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  role: Schema.optionalWith(NullableString, { default: () => null }),
  defaultValueRef: Schema.optionalWith(NullableString, { default: () => null }),
  parameter: Schema.optionalWith(NullableString, { default: () => null }),
  snapshotAliases: Schema.optional(Schema.Record({ key: Schema.String, value: StringArray })),
  affordance: Schema.optionalWith(NullableString, { default: () => null }),
  locatorLadder: Schema.optionalWith(Schema.Array(LocatorStrategySchema), { default: () => [] as readonly (typeof LocatorStrategySchema.Type)[] }),
  source: Schema.optionalWith(NullableString, { default: () => null }),
  epistemicStatus: Schema.optionalWith(NullableString, { default: () => null }),
  activationPolicy: Schema.optionalWith(NullableString, { default: () => null }),
  acquired: Schema.optionalWith(Schema.NullOr(CanonicalKnowledgeMetadataSchema), { default: () => null }),
});

export const ScreenHintsSchema = Schema.Struct({
  screen: ScreenIdSchema,
  screenAliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  elements: Schema.optionalWith(Schema.Record({ key: Schema.String, value: ScreenElementHintSchema }), { default: () => ({}) }),
});

// ─── Postures ───

export const PostureEffectSchema = Schema.Struct({
  target: Schema.Union(Schema.Literal('self'), ElementIdSchema, SurfaceIdSchema),
  targetKind: Schema.optional(EffectTargetKindSchema),
  state: EffectStateSchema,
  message: Schema.optionalWith(NullableString, { default: () => null }),
});

export const PostureSchema = Schema.Struct({
  values: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  effects: Schema.optionalWith(Schema.Array(PostureEffectSchema), { default: () => [] as readonly (typeof PostureEffectSchema.Type)[] }),
});

export const ScreenPosturesSchema = Schema.Struct({
  screen: ScreenIdSchema,
  postures: Schema.optionalWith(
    Schema.Record({ key: Schema.String, value: Schema.Record({ key: Schema.String, value: PostureSchema }) }),
    { default: () => ({}) },
  ),
});

// ─── Patterns ───

export const PatternAliasSetSchema = Schema.Struct({
  id: Schema.String,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const PatternDocumentSchema = Schema.Struct({
  version: Schema.Literal(1),
  actions: Schema.optional(Schema.Record({ key: PatternActionNameSchema, value: PatternAliasSetSchema })),
  postures: Schema.optional(Schema.Record({ key: Schema.String, value: PatternAliasSetSchema })),
});

export const MergedPatternsSchema = Schema.Struct({
  version: Schema.Literal(1),
  actions: Schema.Record({ key: PatternActionNameSchema, value: PatternAliasSetSchema }),
  postures: Schema.optionalWith(Schema.Record({ key: Schema.String, value: PatternAliasSetSchema }), { default: () => ({}) }),
  documents: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  sources: Schema.Struct({
    actions: Schema.Record({ key: PatternActionNameSchema, value: Schema.String }),
    postures: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.String }), { default: () => ({}) }),
  }),
});

// ─── State/Behavior types ───

export const ObservationPredicateSchema = Schema.Struct({
  kind: StatePredicateSemanticSchema,
  targetRef: Schema.optionalWith(NullableCanonicalTargetRef, { default: () => null }),
  selectorRef: Schema.optionalWith(NullableSelectorRef, { default: () => null }),
  routeVariantRef: Schema.optionalWith(NullableString, { default: () => null }),
  attribute: Schema.optionalWith(NullableString, { default: () => null }),
  value: Schema.optionalWith(NullableString, { default: () => null }),
  message: Schema.optionalWith(NullableString, { default: () => null }),
});

export const StateNodeSchema = Schema.Struct({
  ref: StateNodeRefSchema,
  screen: ScreenIdSchema,
  label: Schema.String,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  scope: Schema.Literal('screen', 'surface', 'target', 'route', 'modal'),
  targetRef: Schema.optionalWith(NullableCanonicalTargetRef, { default: () => null }),
  routeVariantRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  predicates: Schema.optionalWith(Schema.Array(ObservationPredicateSchema), { default: () => [] as readonly (typeof ObservationPredicateSchema.Type)[] }),
  provenance: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const EventObservationPlanSchema = Schema.Struct({
  timeoutMs: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  settleMs: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  observeStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
});

export const EventExpectedEffectsSchema = Schema.Struct({
  transitionRefs: Schema.optionalWith(Schema.Array(TransitionRefSchema), { default: () => [] as readonly (typeof TransitionRefSchema.Type)[] }),
  resultStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  observableEffects: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  assertions: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const EventSignatureSchema = Schema.Struct({
  ref: EventSignatureRefSchema,
  screen: ScreenIdSchema,
  targetRef: CanonicalTargetRefSchema,
  label: Schema.String,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  dispatch: Schema.Struct({
    action: StepActionSchema,
    sampleValue: Schema.optionalWith(NullableString, { default: () => null }),
  }),
  requiredStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  forbiddenStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  effects: EventExpectedEffectsSchema,
  observationPlan: EventObservationPlanSchema,
  provenance: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const StateTransitionSchema = Schema.Struct({
  ref: TransitionRefSchema,
  screen: ScreenIdSchema,
  label: Schema.String,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  eventSignatureRef: EventSignatureRefSchema,
  sourceStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  targetStateRefs: Schema.optionalWith(Schema.Array(StateNodeRefSchema), { default: () => [] as readonly (typeof StateNodeRefSchema.Type)[] }),
  effectKind: TransitionEffectKindSchema,
  observableEffects: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  provenance: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const ScreenBehaviorSchema = Schema.Struct({
  kind: Schema.Literal('screen-behavior'),
  version: Schema.Literal(1),
  screen: ScreenIdSchema,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  routeVariantRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  knowledgeRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  stateNodes: Schema.optionalWith(Schema.Array(StateNodeSchema), { default: () => [] as readonly (typeof StateNodeSchema.Type)[] }),
  eventSignatures: Schema.optionalWith(Schema.Array(EventSignatureSchema), { default: () => [] as readonly (typeof EventSignatureSchema.Type)[] }),
  transitions: Schema.optionalWith(Schema.Array(StateTransitionSchema), { default: () => [] as readonly (typeof StateTransitionSchema.Type)[] }),
});

export const BehaviorPatternDocumentSchema = Schema.Struct({
  kind: Schema.Literal('behavior-pattern'),
  version: Schema.Literal(1),
  id: Schema.String,
  aliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  stateNodes: Schema.optionalWith(Schema.Array(StateNodeSchema), { default: () => [] as readonly (typeof StateNodeSchema.Type)[] }),
  eventSignatures: Schema.optionalWith(Schema.Array(EventSignatureSchema), { default: () => [] as readonly (typeof EventSignatureSchema.Type)[] }),
  transitions: Schema.optionalWith(Schema.Array(StateTransitionSchema), { default: () => [] as readonly (typeof StateTransitionSchema.Type)[] }),
});

// ─── Confidence Overlay ───

export const ArtifactConfidenceRecordSchema = Schema.Struct({
  id: Schema.String,
  artifactType: TrustPolicyArtifactTypeSchema,
  artifactPath: Schema.String,
  score: Schema.Number,
  threshold: Schema.Number,
  status: Schema.Literal('learning', 'approved-equivalent', 'needs-review'),
  successCount: Schema.Number,
  failureCount: Schema.Number,
  evidenceCount: Schema.Number,
  screen: Schema.optionalWith(NullableScreenId, { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  snapshotTemplate: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
  learnedAliases: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  lastSuccessAt: Schema.optionalWith(NullableString, { default: () => null }),
  lastFailureAt: Schema.optionalWith(NullableString, { default: () => null }),
  lineage: Schema.Struct({
    runIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    evidenceIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    sourceArtifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  }),
});

export const ConfidenceOverlayCatalogSchema = Schema.Struct({
  kind: Schema.Literal('confidence-overlay-catalog'),
  version: Schema.Literal(1),
  generatedAt: Schema.String,
  records: Schema.optionalWith(Schema.Array(ArtifactConfidenceRecordSchema), { default: () => [] as readonly (typeof ArtifactConfidenceRecordSchema.Type)[] }),
  summary: Schema.Struct({
    total: Schema.Number,
    approvedEquivalentCount: Schema.Number,
    needsReviewCount: Schema.Number,
  }),
});

// ─── Widget Capability Contract ───

export const WidgetCapabilityContractSchema = Schema.Struct({
  widget: WidgetIdSchema,
  supportedActions: Schema.optionalWith(Schema.Array(Schema.Literal('click', 'fill', 'clear', 'get-value')), { default: () => [] as readonly ('click' | 'fill' | 'clear' | 'get-value')[] }),
  requiredPreconditions: Schema.optionalWith(Schema.Array(Schema.Literal('visible', 'enabled', 'editable')), { default: () => [] as readonly ('visible' | 'enabled' | 'editable')[] }),
  sideEffects: Schema.Record({
    key: Schema.String,
    value: Schema.Struct({
      expectedStates: Schema.optionalWith(Schema.Array(EffectStateSchema), { default: () => [] as readonly (typeof EffectStateSchema.Type)[] }),
      effectCategories: Schema.optionalWith(Schema.Array(Schema.Literal('mutation', 'observation', 'focus', 'navigation')), { default: () => [] as readonly ('mutation' | 'observation' | 'focus' | 'navigation')[] }),
    }),
  }),
});

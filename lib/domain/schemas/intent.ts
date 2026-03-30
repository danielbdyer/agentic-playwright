import { Schema } from 'effect';
import {
  ScenarioStatusSchema,
  StepActionSchema,
  ConfidenceSchema,
  StepBindingKindSchema,
  GovernanceSchema,
} from './enums';
import {
  AdoIdSchema,
  ScreenIdSchema,
  ElementIdSchema,
  PostureIdSchema,
  SnapshotTemplateIdSchema,
  FixtureIdSchema,
  NullableScreenId,
  NullableElementId,
  NullablePostureId,
  NullableSnapshotTemplateId,
  NullableString,
  StringArray,
} from './primitives';

// ─── ADO Snapshot ───

export const AdoStepSchema = Schema.Struct({
  index: Schema.Number,
  action: Schema.String,
  expected: Schema.String,
  sharedStepId: Schema.optional(Schema.String),
});

export const AdoParameterSchema = Schema.Struct({
  name: Schema.String,
  values: Schema.Array(Schema.String),
});

export const AdoSnapshotSchema = Schema.Struct({
  id: AdoIdSchema,
  revision: Schema.Number,
  title: Schema.String,
  suitePath: Schema.String,
  areaPath: Schema.String,
  iterationPath: Schema.String,
  tags: StringArray,
  priority: Schema.Number,
  steps: Schema.Array(AdoStepSchema),
  parameters: Schema.Array(AdoParameterSchema),
  dataRows: Schema.Array(Schema.Record({ key: Schema.String, value: Schema.String })),
  contentHash: Schema.String,
  syncedAt: Schema.String,
});

// ─── Scenario ───

export const ScenarioSourceSchema = Schema.Struct({
  ado_id: AdoIdSchema,
  revision: Schema.Number,
  content_hash: Schema.String,
  synced_at: Schema.String,
});

export const ScenarioMetadataSchema = Schema.Struct({
  title: Schema.String,
  suite: Schema.String,
  tags: StringArray,
  priority: Schema.Number,
  status: ScenarioStatusSchema,
  status_detail: Schema.NullOr(Schema.String),
});

export const ScenarioPreconditionSchema = Schema.Struct({
  fixture: FixtureIdSchema,
  params: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.String })),
});

export const RefPathSchema = Schema.Struct({
  segments: Schema.Array(Schema.String),
});

export const ValueRefLiteralSchema = Schema.Struct({
  kind: Schema.Literal('literal'),
  value: Schema.String,
});

export const ValueRefFixturePathSchema = Schema.Struct({
  kind: Schema.Literal('fixture-path'),
  path: RefPathSchema,
});

export const ValueRefPostureSampleSchema = Schema.Struct({
  kind: Schema.Literal('posture-sample'),
  element: ElementIdSchema,
  posture: PostureIdSchema,
  sampleIndex: Schema.Number,
});

export const ValueRefParameterRowSchema = Schema.Struct({
  kind: Schema.Literal('parameter-row'),
  name: Schema.String,
  rowIndex: Schema.Number,
});

export const ValueRefGeneratedTokenSchema = Schema.Struct({
  kind: Schema.Literal('generated-token'),
  token: Schema.String,
});

export const ValueRefSchema = Schema.Union(
  ValueRefLiteralSchema,
  ValueRefFixturePathSchema,
  ValueRefPostureSampleSchema,
  ValueRefParameterRowSchema,
  ValueRefGeneratedTokenSchema,
);

export const StepInstructionSchema = Schema.Union(
  Schema.Struct({ kind: Schema.Literal('navigate'), screen: ScreenIdSchema }),
  Schema.Struct({
    kind: Schema.Literal('enter'),
    screen: ScreenIdSchema,
    element: ElementIdSchema,
    posture: Schema.NullOr(PostureIdSchema),
    value: Schema.NullOr(ValueRefSchema),
  }),
  Schema.Struct({
    kind: Schema.Literal('invoke'),
    screen: ScreenIdSchema,
    element: ElementIdSchema,
    action: Schema.Literal('click'),
  }),
  Schema.Struct({
    kind: Schema.Literal('observe-structure'),
    screen: ScreenIdSchema,
    element: ElementIdSchema,
    snapshotTemplate: SnapshotTemplateIdSchema,
  }),
  Schema.Struct({ kind: Schema.Literal('custom-escape-hatch'), reason: Schema.String }),
);

export const StepProgramSchema = Schema.Struct({
  kind: Schema.Literal('step-program'),
  instructions: Schema.Array(StepInstructionSchema),
});

export const StepResolutionSchema = Schema.Struct({
  action: Schema.optionalWith(Schema.NullOr(StepActionSchema), { default: () => null }),
  screen: Schema.optionalWith(NullableScreenId, { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  override: Schema.optionalWith(NullableString, { default: () => null }),
  snapshot_template: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
});

export const ScenarioStepSchema = Schema.Struct({
  index: Schema.Number,
  intent: Schema.String,
  action_text: Schema.String,
  expected_text: Schema.String,
  action: StepActionSchema,
  screen: Schema.optionalWith(NullableScreenId, { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  override: Schema.optionalWith(NullableString, { default: () => null }),
  snapshot_template: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
  resolution: Schema.optionalWith(Schema.NullOr(StepResolutionSchema), { default: () => null }),
  confidence: ConfidenceSchema,
});

export const ScenarioPostconditionSchema = Schema.Struct({
  action: StepActionSchema,
  screen: Schema.optionalWith(NullableScreenId, { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  override: Schema.optionalWith(NullableString, { default: () => null }),
  snapshot_template: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
});

export const ScenarioSchema = Schema.Struct({
  source: ScenarioSourceSchema,
  metadata: ScenarioMetadataSchema,
  preconditions: Schema.Array(ScenarioPreconditionSchema),
  steps: Schema.Array(ScenarioStepSchema),
  postconditions: Schema.Array(ScenarioPostconditionSchema),
});

// ─── Bound Step (migration target for semantic validation) ───

const BoundStepBindingSchema = Schema.Struct({
  kind: StepBindingKindSchema,
  reasons: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  ruleId: Schema.optionalWith(NullableString, { default: () => null }),
  normalizedIntent: Schema.String,
  knowledgeRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  supplementRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  evidenceIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  governance: GovernanceSchema,
  reviewReasons: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
}).pipe(
  Schema.filter(
    (binding) => binding.governance !== 'review-required' || binding.reviewReasons.length > 0,
    {
      identifier: 'BoundStepBindingGovernanceConsistency',
      message: () => 'binding.reviewReasons must be non-empty when binding.governance is review-required',
    },
  ),
);

export const BoundStepSchema = Schema.Struct({
  index: Schema.Number.pipe(Schema.nonNegative()),
  intent: Schema.String.pipe(Schema.trimmed(), Schema.minLength(1)),
  action_text: Schema.String,
  expected_text: Schema.String,
  action: StepActionSchema,
  screen: Schema.optionalWith(NullableScreenId, { default: () => null }),
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  override: Schema.optionalWith(NullableString, { default: () => null }),
  snapshot_template: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
  resolution: Schema.optionalWith(Schema.NullOr(StepResolutionSchema), { default: () => null }),
  confidence: ConfidenceSchema,
  binding: BoundStepBindingSchema,
  program: Schema.optional(StepProgramSchema),
}).pipe(
  Schema.filter(
    (step) => !(step.binding.kind === 'bound' && step.binding.governance === 'blocked'),
    {
      identifier: 'BoundStepGovernanceDiscipline',
      message: () => 'binding.governance cannot be blocked when binding.kind is bound',
    },
  ),
  Schema.filter(
    (step) => step.binding.kind !== 'unbound' || (step.screen === null && step.element === null),
    {
      identifier: 'BoundStepTargetConsistency',
      message: () => 'screen and element must both be null when binding.kind is unbound',
    },
  ),
);

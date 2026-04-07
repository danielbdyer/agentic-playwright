import { Schema } from 'effect';
import {
  InterventionAuthoritySchema,
  InterventionBlastRadiusSchema,
  InterventionBlockageTypeSchema,
  InterventionDriftStatusSchema,
  InterventionStalenessStatusSchema,
  DiagnosticSeveritySchema,
  GovernanceSchema,
  InterventionEffectKindSchema,
  InterventionCommandActionKindSchema,
  InterventionEpistemicStatusSchema,
  InterventionKindSchema,
  InterventionParticipationModeSchema,
  InterventionStatusSchema,
  InterventionTargetKindSchema,
  ParticipantCapabilitySchema,
  ParticipantKindSchema,
} from './enums';
import { NullableString, StringArray } from './primitives';
import { WorkflowEnvelopeIdsSchema } from './workflow';

export const ParticipantRefSchema = Schema.Struct({
  participantId: Schema.String,
  kind: ParticipantKindSchema,
});

export const ParticipantSchema = Schema.Struct({
  participantId: Schema.String,
  kind: ParticipantKindSchema,
  label: Schema.String,
  providerId: Schema.optionalWith(NullableString, { default: () => null }),
  adapterId: Schema.optionalWith(NullableString, { default: () => null }),
  capabilities: Schema.optionalWith(Schema.Array(ParticipantCapabilitySchema), { default: () => [] as readonly (typeof ParticipantCapabilitySchema.Type)[] }),
  metadata: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const InterventionTargetSchema = Schema.Struct({
  kind: InterventionTargetKindSchema,
  ref: Schema.String,
  label: Schema.String,
  artifactPath: Schema.optionalWith(NullableString, { default: () => null }),
  ids: Schema.optional(WorkflowEnvelopeIdsSchema),
});

export const InterventionPlanSchema = Schema.Struct({
  summary: Schema.String,
  governance: GovernanceSchema,
  target: InterventionTargetSchema,
  expectedArtifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const InterventionEffectSchema = Schema.Struct({
  kind: InterventionEffectKindSchema,
  severity: DiagnosticSeveritySchema,
  summary: Schema.String,
  target: InterventionTargetSchema,
  artifactPath: Schema.optionalWith(NullableString, { default: () => null }),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const InterventionEvidenceSliceSchema = Schema.Struct({
  artifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  summaries: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const InterventionSemanticCoreSchema = Schema.Struct({
  token: Schema.String,
  summary: Schema.String,
  driftStatus: InterventionDriftStatusSchema,
});

export const InterventionStalenessSchema = Schema.Struct({
  observedAt: Schema.String,
  reviewBy: Schema.optionalWith(NullableString, { default: () => null }),
  status: InterventionStalenessStatusSchema,
  rationale: Schema.optionalWith(NullableString, { default: () => null }),
});

export const InterventionNextMoveSchema = Schema.Struct({
  action: Schema.String,
  rationale: Schema.String,
  command: Schema.optionalWith(NullableString, { default: () => null }),
});

export const InterventionCompetingCandidateSchema = Schema.Struct({
  ref: Schema.String,
  summary: Schema.String,
  source: Schema.String,
  status: InterventionEpistemicStatusSchema,
});

export const InterventionTokenImpactSchema = Schema.Struct({
  payloadSizeBytes: Schema.Number,
  estimatedReadTokens: Schema.Number,
  ambiguityReduction: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  suspensionAvoided: Schema.optionalWith(Schema.NullOr(Schema.Boolean), { default: () => null }),
  rungImprovement: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  activationQuality: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
});

export const InterventionHandoffChainSchema = Schema.Struct({
  depth: Schema.Number,
  previousSemanticToken: Schema.optionalWith(NullableString, { default: () => null }),
  semanticCorePreserved: Schema.Boolean,
  driftDetectable: Schema.Boolean,
  competingCandidateCount: Schema.Number,
});

export const InterventionHandoffSchema = Schema.Struct({
  unresolvedIntent: Schema.String,
  attemptedStrategies: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  evidenceSlice: InterventionEvidenceSliceSchema,
  blockageType: InterventionBlockageTypeSchema,
  requestedParticipation: InterventionParticipationModeSchema,
  requiredCapabilities: Schema.optionalWith(Schema.Array(ParticipantCapabilitySchema), { default: () => [] as readonly (typeof ParticipantCapabilitySchema.Type)[] }),
  requiredAuthorities: Schema.optionalWith(Schema.Array(InterventionAuthoritySchema), { default: () => [] as readonly (typeof InterventionAuthoritySchema.Type)[] }),
  blastRadius: InterventionBlastRadiusSchema,
  epistemicStatus: InterventionEpistemicStatusSchema,
  semanticCore: InterventionSemanticCoreSchema,
  staleness: Schema.optionalWith(Schema.NullOr(InterventionStalenessSchema), { default: () => null }),
  nextMoves: Schema.optionalWith(Schema.Array(InterventionNextMoveSchema), { default: () => [] as readonly (typeof InterventionNextMoveSchema.Type)[] }),
  competingCandidates: Schema.optionalWith(Schema.Array(InterventionCompetingCandidateSchema), { default: () => [] as readonly (typeof InterventionCompetingCandidateSchema.Type)[] }),
  tokenImpact: Schema.optionalWith(Schema.NullOr(InterventionTokenImpactSchema), { default: () => null }),
  chain: Schema.optionalWith(Schema.NullOr(InterventionHandoffChainSchema), { default: () => null }),
});

export const InterventionReceiptSchema = Schema.Struct({
  interventionId: Schema.String,
  kind: InterventionKindSchema,
  status: InterventionStatusSchema,
  summary: Schema.String,
  participantRefs: Schema.optionalWith(Schema.Array(ParticipantRefSchema), { default: () => [] as readonly (typeof ParticipantRefSchema.Type)[] }),
  ids: Schema.optional(WorkflowEnvelopeIdsSchema),
  target: InterventionTargetSchema,
  plan: Schema.optionalWith(Schema.NullOr(InterventionPlanSchema), { default: () => null }),
  effects: Schema.optionalWith(Schema.Array(InterventionEffectSchema), { default: () => [] as readonly (typeof InterventionEffectSchema.Type)[] }),
  handoff: Schema.optionalWith(Schema.NullOr(InterventionHandoffSchema), { default: () => null }),
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(NullableString, { default: () => null }),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const InterventionActionDependencySchema = Schema.Struct({
  actionId: Schema.String,
  required: Schema.Boolean,
  reason: Schema.String,
});

export const ReversibleMetadataSchema = Schema.Struct({
  reversible: Schema.Boolean,
  rollbackCommand: Schema.optionalWith(NullableString, { default: () => null }),
  rollbackRef: Schema.optionalWith(NullableString, { default: () => null }),
});

export const InterventionCommandActionSchema = Schema.Struct({
  actionId: Schema.String,
  kind: InterventionCommandActionKindSchema,
  summary: Schema.String,
  governance: GovernanceSchema,
  target: InterventionTargetSchema,
  prerequisites: Schema.optionalWith(Schema.Array(InterventionActionDependencySchema), {
    default: () => [] as readonly (typeof InterventionActionDependencySchema.Type)[],
  }),
  reversible: ReversibleMetadataSchema,
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

export const InterventionCommandBatchSchema = Schema.Struct({
  batchId: Schema.String,
  summary: Schema.String,
  actions: Schema.Array(InterventionCommandActionSchema),
  continueOnFailure: Schema.Boolean,
});

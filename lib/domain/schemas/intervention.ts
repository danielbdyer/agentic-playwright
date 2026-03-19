import { Schema } from 'effect';
import {
  DiagnosticSeveritySchema,
  GovernanceSchema,
  InterventionEffectKindSchema,
  InterventionKindSchema,
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
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(NullableString, { default: () => null }),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

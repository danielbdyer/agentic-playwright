import { Schema } from 'effect';
import {
  ExecutionProfileSchema,
  InterventionKindSchema,
} from './enums';
import {
  AdoIdSchema,
  NullableString,
  StringArray,
} from './primitives';
import {
  InterventionReceiptSchema,
  ParticipantRefSchema,
  ParticipantSchema,
} from './intervention';
import { WorkflowEnvelopeIdsSchema } from './workflow';

// ─── Agent Event Types ───

export const AgentEventTypeSchema = Schema.Literal(
  'orientation',
  'artifact-inspection',
  'discovery-request',
  'observation-recorded',
  'spec-fragment-proposed',
  'proposal-approved',
  'proposal-rejected',
  'rerun-requested',
  'execution-reviewed',
  'benchmark-action',
  'replay-action',
);

// ─── Transcript Ref ───

export const TranscriptRefSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.Literal('structured-log', 'copilot-chat', 'none'),
  label: Schema.String,
  provider: Schema.String,
  uri: Schema.optionalWith(NullableString, { default: () => null }),
  artifactPath: Schema.optionalWith(NullableString, { default: () => null }),
});

// ─── Agent Event ───

export const AgentEventSchema = Schema.Struct({
  version: Schema.Literal(1),
  id: Schema.String,
  at: Schema.String,
  type: AgentEventTypeSchema,
  interventionId: Schema.String,
  interventionKind: InterventionKindSchema,
  actor: Schema.Literal('agent', 'human', 'system'),
  summary: Schema.String,
  ids: Schema.optional(WorkflowEnvelopeIdsSchema),
  participantRefs: Schema.optionalWith(Schema.Array(ParticipantRefSchema), { default: () => [] as readonly (typeof ParticipantRefSchema.Type)[] }),
  refs: Schema.Struct({
    artifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    graphNodeIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    selectorRefs: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
    transcriptIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  }),
  payload: Schema.Record({ key: Schema.String, value: Schema.Unknown }),
});

// ─── Agent Session ───

export const AgentSessionSchema = Schema.Struct({
  kind: Schema.Literal('agent-session'),
  version: Schema.Literal(1),
  sessionId: Schema.String,
  adapterId: Schema.String,
  providerId: Schema.String,
  executionProfile: ExecutionProfileSchema,
  startedAt: Schema.String,
  completedAt: Schema.optionalWith(NullableString, { default: () => null }),
  scenarioIds: Schema.Array(AdoIdSchema),
  runIds: StringArray,
  participants: Schema.optionalWith(Schema.Array(ParticipantSchema), { default: () => [] as readonly (typeof ParticipantSchema.Type)[] }),
  participantCount: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  interventions: Schema.optionalWith(Schema.Array(InterventionReceiptSchema), { default: () => [] as readonly (typeof InterventionReceiptSchema.Type)[] }),
  interventionCount: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  improvementRunIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  transcripts: Schema.optionalWith(Schema.Array(TranscriptRefSchema), { default: () => [] as readonly (typeof TranscriptRefSchema.Type)[] }),
  eventCount: Schema.Number,
  eventTypes: Schema.Record({ key: AgentEventTypeSchema, value: Schema.Number }),
});

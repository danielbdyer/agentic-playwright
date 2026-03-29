import { Schema } from 'effect';
import {
  GovernanceSchema,
  WorkflowStageSchema,
  WorkflowScopeSchema,
  CertificationStatusSchema,
  TrustPolicyArtifactTypeSchema,
  TrustPolicyDecisionSchema,
  StepActionSchema,
  DiagnosticSeveritySchema,
  DiagnosticConfidenceSchema,
  RuntimeInterpreterModeSchema,
  WriteModeSchema,
  ExecutionProfileSchema,
} from './enums';
import {
  AdoIdSchema,
  NullableAdoId,
  NullableString,
  StringArray,
  ScreenIdSchema,
  NullableElementId,
  NullablePostureId,
  NullableSnapshotTemplateId,
} from './primitives';

// ─── Workflow Envelope ───

export const WorkflowEnvelopeIdsSchema = Schema.Struct({
  adoId: Schema.optionalWith(NullableAdoId, { default: () => null }),
  suite: Schema.optionalWith(NullableString, { default: () => null }),
  sessionId: Schema.optionalWith(NullableString, { default: () => null }),
  runId: Schema.optionalWith(NullableString, { default: () => null }),
  stepIndex: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  dataset: Schema.optionalWith(NullableString, { default: () => null }),
  runbook: Schema.optionalWith(NullableString, { default: () => null }),
  resolutionControl: Schema.optionalWith(NullableString, { default: () => null }),
  participantIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  interventionIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  improvementRunId: Schema.optionalWith(NullableString, { default: () => null }),
  iteration: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  parentExperimentId: Schema.optionalWith(NullableString, { default: () => null }),
});

export const WorkflowEnvelopeFingerprintsSchema = Schema.Struct({
  artifact: Schema.String,
  content: Schema.optionalWith(NullableString, { default: () => null }),
  knowledge: Schema.optionalWith(NullableString, { default: () => null }),
  controls: Schema.optionalWith(NullableString, { default: () => null }),
  task: Schema.optionalWith(NullableString, { default: () => null }),
  run: Schema.optionalWith(NullableString, { default: () => null }),
});

export const WorkflowEnvelopeLineageSchema = Schema.Struct({
  sources: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  parents: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  handshakes: Schema.optionalWith(Schema.Array(WorkflowStageSchema), { default: () => [] as readonly (typeof WorkflowStageSchema.Type)[] }),
  experimentIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const WorkflowEnvelopeSchema = <P extends Schema.Schema.Any>(payloadSchema: P) =>
  Schema.Struct({
    version: Schema.Literal(1),
    stage: WorkflowStageSchema,
    scope: WorkflowScopeSchema,
    ids: WorkflowEnvelopeIdsSchema,
    fingerprints: WorkflowEnvelopeFingerprintsSchema,
    lineage: WorkflowEnvelopeLineageSchema,
    governance: GovernanceSchema,
    payload: payloadSchema,
  });

// ─── Canonical lineage & metadata ───

export const CanonicalLineageSchema = Schema.Struct({
  runIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  evidenceIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  sourceArtifactPaths: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  role: Schema.optionalWith(NullableString, { default: () => null }),
  state: Schema.optionalWith(NullableString, { default: () => null }),
  driftSeed: Schema.optionalWith(NullableString, { default: () => null }),
});

export const CanonicalKnowledgeMetadataSchema = Schema.Struct({
  certification: CertificationStatusSchema,
  activatedAt: Schema.String,
  certifiedAt: Schema.optionalWith(NullableString, { default: () => null }),
  lineage: CanonicalLineageSchema,
});

export const ProposalActivationSchema = Schema.Struct({
  status: Schema.optionalWith(Schema.Literal('pending', 'activated', 'blocked'), { default: () => 'pending' as const }),
  activatedAt: Schema.optionalWith(NullableString, { default: () => null }),
  certifiedAt: Schema.optionalWith(NullableString, { default: () => null }),
  reason: Schema.optionalWith(NullableString, { default: () => null }),
});

// ─── Trust Policy ───

export const TrustPolicyEvidenceRuleSchema = Schema.Struct({
  minCount: Schema.Number,
  kinds: StringArray,
});

export const TrustPolicyArtifactRuleSchema = Schema.Struct({
  minimumConfidence: Schema.Number,
  requiredEvidence: TrustPolicyEvidenceRuleSchema,
});

export const TrustPolicySchema = Schema.Struct({
  version: Schema.Literal(1),
  artifactTypes: Schema.Record({ key: TrustPolicyArtifactTypeSchema, value: TrustPolicyArtifactRuleSchema }),
  forbiddenAutoHealClasses: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

export const TrustPolicyEvaluationReasonSchema = Schema.Struct({
  code: Schema.Literal('minimum-confidence', 'required-evidence', 'forbidden-auto-heal'),
  message: Schema.String,
});

export const TrustPolicyEvaluationSchema = Schema.Struct({
  decision: TrustPolicyDecisionSchema,
  reasons: Schema.optionalWith(Schema.Array(TrustPolicyEvaluationReasonSchema), { default: () => [] as readonly (typeof TrustPolicyEvaluationReasonSchema.Type)[] }),
});

// ─── Locator Strategy (discriminated union) ───

export const LocatorStrategyTestIdSchema = Schema.Struct({
  kind: Schema.Literal('test-id'),
  value: Schema.String,
});

export const LocatorStrategyRoleNameSchema = Schema.Struct({
  kind: Schema.Literal('role-name'),
  role: Schema.String,
  name: Schema.optionalWith(NullableString, { default: () => null }),
});

export const LocatorStrategyCssSchema = Schema.Struct({
  kind: Schema.Literal('css'),
  value: Schema.String,
});

export const LocatorStrategySchema = Schema.Union(
  LocatorStrategyTestIdSchema,
  LocatorStrategyRoleNameSchema,
  LocatorStrategyCssSchema,
);

// ─── Resolution Target ───

export const ResolutionTargetSchema = Schema.Struct({
  action: StepActionSchema,
  screen: ScreenIdSchema,
  element: Schema.optionalWith(NullableElementId, { default: () => null }),
  posture: Schema.optionalWith(NullablePostureId, { default: () => null }),
  override: Schema.optionalWith(NullableString, { default: () => null }),
  snapshot_template: Schema.optionalWith(NullableSnapshotTemplateId, { default: () => null }),
});

// ─── Diagnostics ───

export const DiagnosticProvenanceSchema = Schema.Struct({
  sourceRevision: Schema.optional(Schema.Number),
  contentHash: Schema.optional(Schema.String),
  scenarioPath: Schema.optional(Schema.String),
  snapshotPath: Schema.optional(Schema.String),
  knowledgePath: Schema.optional(Schema.String),
  confidence: Schema.optional(DiagnosticConfidenceSchema),
});

export const CompilerDiagnosticSchema = Schema.Struct({
  code: Schema.String,
  severity: DiagnosticSeveritySchema,
  message: Schema.String,
  adoId: AdoIdSchema,
  stepIndex: Schema.optional(Schema.Number),
  artifactPath: Schema.optional(Schema.String),
  provenance: DiagnosticProvenanceSchema,
});

// ─── Execution Posture ───

export const ExecutionPostureSchema = Schema.Struct({
  interpreterMode: RuntimeInterpreterModeSchema,
  writeMode: WriteModeSchema,
  headed: Schema.Boolean,
  executionProfile: ExecutionProfileSchema,
});

// ─── Manifest ───

export const ManifestEntrySchema = Schema.Struct({
  adoId: AdoIdSchema,
  revision: Schema.Number,
  contentHash: Schema.String,
  syncedAt: Schema.String,
  sourcePath: Schema.String,
});

export const ManifestSchema = Schema.Struct({
  entries: Schema.Record({ key: Schema.String, value: ManifestEntrySchema }),
});

// ─── Write Journal ───

export const WriteJournalEntrySchema = Schema.Struct({
  path: Schema.String,
  operation: Schema.Literal('write-text', 'write-json', 'ensure-dir'),
  serialized: Schema.NullOr(Schema.String),
});

// ─── Auto-Approval Policy ───

export const AutoApprovalPolicySchema = Schema.Struct({
  enabled: Schema.Boolean,
  profile: ExecutionProfileSchema,
  forbiddenHealClasses: Schema.Array(Schema.String),
  thresholdOverrides: Schema.Record({ key: Schema.String, value: Schema.Number }),
});

export const AutoApprovalResultSchema = Schema.Struct({
  approved: Schema.Boolean,
  reason: Schema.String,
});

// ─── Proposed Change Metadata ───

export const ProposedChangeMetadataSchema = Schema.Struct({
  artifactType: TrustPolicyArtifactTypeSchema,
  confidence: Schema.Number,
  autoHealClass: Schema.optionalWith(NullableString, { default: () => null }),
});

// ─── Evidence Descriptor ───

export const EvidenceDescriptorSchema = Schema.Struct({
  kind: Schema.String,
});

// ─── Derived types ───
export type WorkflowEnvelopeIds = typeof WorkflowEnvelopeIdsSchema.Type;
export type WorkflowEnvelopeFingerprints = typeof WorkflowEnvelopeFingerprintsSchema.Type;
export type WorkflowEnvelopeLineage = typeof WorkflowEnvelopeLineageSchema.Type;
export type CanonicalLineage = typeof CanonicalLineageSchema.Type;
export type CanonicalKnowledgeMetadata = typeof CanonicalKnowledgeMetadataSchema.Type;
export type ProposalActivation = typeof ProposalActivationSchema.Type;
export type TrustPolicy = typeof TrustPolicySchema.Type;
export type TrustPolicyEvaluation = typeof TrustPolicyEvaluationSchema.Type;
export type TrustPolicyEvaluationReason = typeof TrustPolicyEvaluationReasonSchema.Type;
export type LocatorStrategy = typeof LocatorStrategySchema.Type;
export type ResolutionTarget = typeof ResolutionTargetSchema.Type;
export type CompilerDiagnostic = typeof CompilerDiagnosticSchema.Type;
export type DiagnosticProvenance = typeof DiagnosticProvenanceSchema.Type;
export type ExecutionPosture = typeof ExecutionPostureSchema.Type;
export type Manifest = typeof ManifestSchema.Type;
export type ManifestEntry = typeof ManifestEntrySchema.Type;
export type WriteJournalEntry = typeof WriteJournalEntrySchema.Type;
export type AutoApprovalPolicy = typeof AutoApprovalPolicySchema.Type;
export type AutoApprovalResult = typeof AutoApprovalResultSchema.Type;
export type ProposedChangeMetadata = typeof ProposedChangeMetadataSchema.Type;
export type EvidenceDescriptor = typeof EvidenceDescriptorSchema.Type;

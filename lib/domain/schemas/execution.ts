import { Schema } from 'effect';
import {
  StepActionSchema,
  TrustPolicyArtifactTypeSchema,
  ResolutionModeSchema,
  StepWinningSourceSchema,
  WorkflowLaneSchema,
  OperatorInboxItemKindSchema,
  InterventionParticipationModeSchema,
  GraphNodeKindSchema,
  GraphEdgeKindSchema,
} from './enums';
import {
  AdoIdSchema,
  NullableAdoId,
  NullableString,
  StringArray,
} from './primitives';
import {
  ExecutionPostureSchema,
  DiagnosticProvenanceSchema,
} from './workflow';
import { LearningScorecardSchema } from './learning';
import { InterventionHandoffSchema } from './intervention';

// ─── Operator Inbox ───

export const OperatorInboxItemSchema = Schema.Struct({
  id: Schema.String,
  kind: OperatorInboxItemKindSchema,
  status: Schema.Literal('actionable', 'approved', 'blocked', 'informational'),
  title: Schema.String,
  summary: Schema.String,
  adoId: Schema.optionalWith(NullableAdoId, { default: () => null }),
  suite: Schema.optionalWith(NullableString, { default: () => null }),
  runId: Schema.optionalWith(NullableString, { default: () => null }),
  stepIndex: Schema.optionalWith(Schema.NullOr(Schema.Number), { default: () => null }),
  proposalId: Schema.optionalWith(NullableString, { default: () => null }),
  artifactPath: Schema.optionalWith(NullableString, { default: () => null }),
  targetPath: Schema.optionalWith(NullableString, { default: () => null }),
  winningConcern: Schema.optionalWith(Schema.NullOr(WorkflowLaneSchema), { default: () => null }),
  winningSource: Schema.optionalWith(Schema.NullOr(StepWinningSourceSchema), { default: () => null }),
  resolutionMode: Schema.optionalWith(Schema.NullOr(ResolutionModeSchema), { default: () => null }),
  requestedParticipation: Schema.optionalWith(Schema.NullOr(InterventionParticipationModeSchema), { default: () => null }),
  handoff: Schema.optionalWith(Schema.NullOr(InterventionHandoffSchema), { default: () => null }),
  nextCommands: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

// ─── Approval Receipt ───

export const ApprovalReceiptSchema = Schema.Struct({
  kind: Schema.Literal('approval-receipt'),
  version: Schema.Literal(1),
  proposalId: Schema.String,
  inboxItemId: Schema.String,
  approvedAt: Schema.String,
  artifactType: TrustPolicyArtifactTypeSchema,
  targetPath: Schema.String,
  receiptPath: Schema.String,
  rerunPlanId: Schema.String,
});

// ─── Rerun Plan ───

const RerunExplanationSchema = Schema.Struct({
  triggeringChange: Schema.String,
  dependencyPath: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  requiredBecause: Schema.String,
  fingerprint: Schema.String,
});

export const RerunPlanSchema = Schema.Struct({
  kind: Schema.Literal('rerun-plan'),
  version: Schema.Literal(1),
  planId: Schema.String,
  createdAt: Schema.String,
  reason: Schema.String,
  sourceProposalId: Schema.optionalWith(NullableString, { default: () => null }),
  sourceNodeIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  impactedScenarioIds: Schema.optionalWith(Schema.Array(AdoIdSchema), { default: () => [] as readonly (typeof AdoIdSchema.Type)[] }),
  impactedRunbooks: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  impactedProjections: Schema.optionalWith(Schema.Array(Schema.Literal('emit', 'graph', 'types', 'run')), { default: () => [] as readonly ('emit' | 'graph' | 'types' | 'run')[] }),
  impactedConfidenceRecords: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  reasons: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  explanationFingerprint: Schema.String,
  selection: Schema.optionalWith(
    Schema.Struct({
      scenarios: Schema.optionalWith(Schema.Array(Schema.Struct({
        id: AdoIdSchema,
        why: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
        explanations: Schema.optionalWith(Schema.Array(RerunExplanationSchema), { default: () => [] as readonly (typeof RerunExplanationSchema.Type)[] }),
      })), { default: () => [] as const }),
      runbooks: Schema.optionalWith(Schema.Array(Schema.Struct({
        name: Schema.String,
        why: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
        explanations: Schema.optionalWith(Schema.Array(RerunExplanationSchema), { default: () => [] as readonly (typeof RerunExplanationSchema.Type)[] }),
      })), { default: () => [] as const }),
      projections: Schema.optionalWith(Schema.Array(Schema.Struct({
        name: Schema.Literal('emit', 'graph', 'types', 'run'),
        why: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
      })), { default: () => [] as const }),
      confidenceRecords: Schema.optionalWith(Schema.Array(Schema.Struct({
        id: Schema.String,
        why: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
      })), { default: () => [] as const }),
    }),
    { default: () => ({ scenarios: [], runbooks: [], projections: [], confidenceRecords: [] }) },
  ),
});

// ─── Derived Graph ───

const GraphNodeSchema = Schema.Struct({
  id: Schema.String,
  kind: GraphNodeKindSchema,
  label: Schema.String,
  fingerprint: Schema.String,
  artifactPath: Schema.optional(Schema.String),
  provenance: DiagnosticProvenanceSchema,
  payload: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const GraphEdgeSchema = Schema.Struct({
  id: Schema.String,
  kind: GraphEdgeKindSchema,
  from: Schema.String,
  to: Schema.String,
  fingerprint: Schema.String,
  provenance: DiagnosticProvenanceSchema,
  payload: Schema.optional(Schema.Record({ key: Schema.String, value: Schema.Unknown })),
});

const MappedMcpResourceSchema = Schema.Struct({
  uri: Schema.String,
  description: Schema.String,
});

const MappedMcpTemplateSchema = Schema.Struct({
  uriTemplate: Schema.String,
  description: Schema.String,
});

export const DerivedGraphSchema = Schema.Struct({
  version: Schema.Literal('v1'),
  fingerprint: Schema.String,
  nodes: Schema.optionalWith(Schema.Array(GraphNodeSchema), { default: () => [] as readonly (typeof GraphNodeSchema.Type)[] }),
  edges: Schema.optionalWith(Schema.Array(GraphEdgeSchema), { default: () => [] as readonly (typeof GraphEdgeSchema.Type)[] }),
  resources: Schema.optionalWith(Schema.Array(MappedMcpResourceSchema), { default: () => [] as readonly (typeof MappedMcpResourceSchema.Type)[] }),
  resourceTemplates: Schema.optionalWith(Schema.Array(MappedMcpTemplateSchema), { default: () => [] as readonly (typeof MappedMcpTemplateSchema.Type)[] }),
});

// ─── Benchmark ───

const BenchmarkFieldSchema = Schema.Struct({
  id: Schema.String,
  screen: Schema.String,
  element: Schema.String,
  label: Schema.String,
  category: Schema.String,
  required: Schema.Boolean,
  postures: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

const BenchmarkFlowSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  steps: Schema.Array(Schema.Struct({
    action: StepActionSchema,
    screen: Schema.String,
    element: Schema.optional(Schema.String),
    label: Schema.optional(Schema.String),
  })),
});

const BenchmarkDriftEventSchema = Schema.Struct({
  id: Schema.String,
  kind: Schema.String,
  label: Schema.String,
  description: Schema.String,
  affectedScreens: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  affectedElements: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
});

const BenchmarkExpansionRuleSchema = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  description: Schema.String,
  sourceFlowId: Schema.String,
  generatedVariantCount: Schema.Number,
});

export const BenchmarkContextSchema = Schema.Struct({
  kind: Schema.Literal('benchmark-context'),
  version: Schema.Literal(1),
  name: Schema.String,
  suite: Schema.String,
  appRoute: Schema.String,
  fieldCatalog: Schema.optionalWith(Schema.Array(BenchmarkFieldSchema), { default: () => [] as readonly (typeof BenchmarkFieldSchema.Type)[] }),
  flows: Schema.optionalWith(Schema.Array(BenchmarkFlowSchema), { default: () => [] as readonly (typeof BenchmarkFlowSchema.Type)[] }),
  driftEvents: Schema.optionalWith(Schema.Array(BenchmarkDriftEventSchema), { default: () => [] as readonly (typeof BenchmarkDriftEventSchema.Type)[] }),
  fieldAwarenessThresholds: Schema.Struct({
    minFieldAwarenessCount: Schema.Number,
    minFirstPassScreenResolutionRate: Schema.Number,
    minFirstPassElementResolutionRate: Schema.Number,
    maxDegradedLocatorRate: Schema.Number,
  }),
  benchmarkRunbooks: Schema.optionalWith(Schema.Array(Schema.Struct({
    name: Schema.String,
    runbook: Schema.String,
    tag: Schema.optionalWith(NullableString, { default: () => null }),
  })), { default: () => [] as const }),
  expansionRules: Schema.optionalWith(Schema.Array(BenchmarkExpansionRuleSchema), { default: () => [] as readonly (typeof BenchmarkExpansionRuleSchema.Type)[] }),
});

// ─── Benchmark Scorecard ───

export const BenchmarkScorecardSchema = Schema.Struct({
  kind: Schema.Literal('benchmark-scorecard'),
  version: Schema.Literal(1),
  benchmark: Schema.String,
  generatedAt: Schema.String,
  uniqueFieldAwarenessCount: Schema.Number,
  firstPassScreenResolutionRate: Schema.Number,
  firstPassElementResolutionRate: Schema.Number,
  effectiveHitRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  ambiguityRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  suspensionRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  agentFallbackRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  liveDomFallbackRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  routeMismatchRate: Schema.optionalWith(Schema.Number, { default: () => 0 }),
  degradedLocatorRate: Schema.Number,
  reviewRequiredCount: Schema.Number,
  repairLoopCount: Schema.Number,
  operatorTouchCount: Schema.Number,
  knowledgeChurn: Schema.Record({ key: Schema.String, value: Schema.Number }),
  proposalCategoryCounts: Schema.optionalWith(Schema.Record({ key: Schema.String, value: Schema.Number }), { default: () => ({}) }),
  generatedVariantCount: Schema.Number,
  translationHitRate: Schema.Number,
  agenticHitRate: Schema.Number,
  approvedEquivalentCount: Schema.Number,
  winningSourceDistribution: Schema.optionalWith(Schema.Array(Schema.Struct({
    source: StepWinningSourceSchema,
    count: Schema.Number,
    rate: Schema.Number,
  })), { default: () => [] as const }),
  proofObligations: Schema.optionalWith(Schema.Array(Schema.Struct({
    obligation: Schema.Literal(
      'target-observability',
      'posture-separability',
      'affordance-recoverability',
      'structural-legibility',
      'semantic-persistence',
      'dynamic-topology',
      'variance-factorability',
      'recoverability',
      'participatory-unresolvedness',
      'actor-chain-coherence',
      'compounding-economics',
      'surface-compressibility',
      'surface-predictability',
      'surface-repairability',
      'participatory-repairability',
      'memory-worthiness',
      'meta-worthiness',
      'handoff-integrity',
    ),
    propertyRefs: Schema.Array(Schema.Literal('K', 'L', 'S', 'D', 'V', 'R', 'A', 'H', 'C', 'M')),
    score: Schema.Number,
    status: Schema.Literal('healthy', 'watch', 'critical'),
    evidence: Schema.String,
  })), { default: () => [] as const }),
  falsifierSignals: Schema.optionalWith(Schema.Array(Schema.Struct({
    name: Schema.Literal('semantic-non-persistence', 'behavioral-non-boundedness', 'opaque-suspension', 'economic-flatness', 'inert-intervention'),
    status: Schema.Literal('healthy', 'watch', 'critical'),
    evidence: Schema.String,
  })), { default: () => [] as const }),
  thinKnowledgeScreenCount: Schema.Number,
  degradedLocatorHotspotCount: Schema.Number,
  interpretationDriftHotspotCount: Schema.Number,
  overlayChurn: Schema.Number,
  executionTimingTotalsMs: Schema.Struct({
    setup: Schema.Number,
    resolution: Schema.Number,
    action: Schema.Number,
    assertion: Schema.Number,
    retries: Schema.Number,
    teardown: Schema.Number,
    total: Schema.Number,
  }),
  executionCostTotals: Schema.Struct({
    instructionCount: Schema.Number,
    diagnosticCount: Schema.Number,
  }),
  executionFailureFamilies: Schema.Record({ key: Schema.String, value: Schema.Number }),
  recoveryFamilies: Schema.Record({ key: Schema.String, value: Schema.Number }),
  recoveryStrategies: Schema.Record({ key: Schema.String, value: Schema.Number }),
  budgetBreachCount: Schema.Number,
  thresholdStatus: Schema.Literal('pass', 'warn', 'fail'),
  learning: Schema.optionalWith(Schema.NullOr(LearningScorecardSchema), { default: () => null }),
});

// ─── Dogfood Run ───

const ImprovementProjectionSummarySchema = Schema.Struct({
  relatedRunIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  latestRunId: Schema.optionalWith(NullableString, { default: () => null }),
  latestAccepted: Schema.optionalWith(Schema.NullOr(Schema.Boolean), { default: () => null }),
  latestVerdict: Schema.optionalWith(NullableString, { default: () => null }),
  latestDecisionId: Schema.optionalWith(NullableString, { default: () => null }),
  signalCount: Schema.Number,
  candidateInterventionCount: Schema.Number,
  checkpointRef: Schema.optionalWith(NullableString, { default: () => null }),
});

const BenchmarkImprovementProjectionFields = {
  version: Schema.Literal(1),
  benchmark: Schema.String,
  runId: Schema.String,
  executedAt: Schema.String,
  posture: ExecutionPostureSchema,
  runbooks: StringArray,
  scenarioIds: Schema.Array(AdoIdSchema),
  driftEventIds: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
  scorecard: BenchmarkScorecardSchema,
  improvement: Schema.optionalWith(Schema.NullOr(ImprovementProjectionSummarySchema), { default: () => null }),
  nextCommands: Schema.optionalWith(StringArray, { default: () => [] as readonly string[] }),
} as const;

export const BenchmarkImprovementProjectionSchema = Schema.Struct({
  kind: Schema.Literal('benchmark-improvement-projection'),
  ...BenchmarkImprovementProjectionFields,
});

export const DogfoodRunSchema = Schema.Struct({
  kind: Schema.Literal('dogfood-run'),
  ...BenchmarkImprovementProjectionFields,
});

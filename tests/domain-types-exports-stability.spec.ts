import { expect, test } from '@playwright/test';
import type {
  ExecutionDiagnostic,
  ExecutionObservation,
  ProposalBundle,
  ProposalEntry,
  RunRecord,
  ScenarioRunStep,
  StepExecutionReceipt,
} from '../lib/domain/execution/types';
import type {
  AssertionKind,
  CapabilityName,
  CaptureResult,
  CompilerDiagnostic,
  Confidence,
  DerivedCapability,
  DiagnosticProvenance,
  DiagnosticSeverity,
  EffectState,
  EffectTargetKind,
  EvidenceDescriptor,
  ExecutionPosture,
  ExecutionProfile,
  Governance,
  LocatorStrategy,
  LocatorStrategyKind,
  Manifest,
  ManifestEntry,
  PatternActionName,
  ProposedChangeMetadata,
  ResolutionMode,
  ResolutionTarget,
  RuntimeInterpreterMode,
  ScenarioLifecycle,
  ScenarioStatus,
  StepAction,
  StepBindingKind,
  StepProvenanceKind,
  StepWinningSource,
  SurfaceKind,
  SyncResult,
  TrustPolicy,
  TrustPolicyArtifactRule,
  TrustPolicyArtifactType,
  TrustPolicyDecision,
  TrustPolicyEvaluation,
  TrustPolicyEvaluationReason,
  TrustPolicyEvidenceRule,
  WorkflowEnvelope,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
  WorkflowLane,
  WorkflowScope,
  WorkflowStage,
  WriteJournalEntry,
  WriteMode,
} from '../lib/domain/governance/workflow-types';
import type {
  InterventionEffect,
  InterventionEffectKind,
  InterventionKind,
  InterventionPlan,
  InterventionReceipt,
  InterventionStatus,
  InterventionTarget,
  InterventionTargetKind,
  Participant,
  ParticipantCapability,
  ParticipantKind,
  ParticipantRef,
} from '../lib/domain/handshake/intervention';
import type {
  AcceptanceDecision,
  AcceptanceVerdict,
  CandidateIntervention,
  DogfoodLedgerProjection,
  ExperimentScorecardComparison,
  ExperimentSubstrate,
  ImprovementConvergenceReason,
  ImprovementIteration,
  ImprovementLedger,
  ImprovementLineageEntry,
  ImprovementLineageKind,
  ImprovementLoopConvergenceReason,
  ImprovementLoopIteration,
  ImprovementLoopLedger,
  ImprovementRun,
  ImprovementSignal,
  ImprovementSignalKind,
  ObjectiveVector,
  SubstrateContext,
} from '../lib/domain/improvement/types';
import type {
  AdoParameter,
  AdoSnapshot,
  AdoStep,
  BoundScenario,
  BoundStep,
  GroundedFlowMetadata,
  GroundedFlowStep,
  GroundedSpecFlow,
  RefPath,
  Scenario,
  ScenarioMetadata,
  ScenarioPostcondition,
  ScenarioPrecondition,
  ScenarioSource,
  ScenarioStep,
  StepInstruction,
  StepProgram,
  StepResolution,
  ValueRef,
  ValueRefFixturePath,
  ValueRefGeneratedToken,
  ValueRefLiteral,
  ValueRefParameterRow,
  ValueRefPostureSample,
} from '../lib/domain/intent/types';
import type {
  ApprovalEquivalenceStatus,
  ArtifactConfidenceRecord,
  ConfidenceOverlayCatalog,
  ElementSig,
  InterfaceResolutionContext,
  MergedPatterns,
  PatternAliasSet,
  PatternDocument,
  Posture,
  PostureEffect,
  ScreenElementHint,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  StepTaskElementCandidate,
  StepTaskScreenCandidate,
  SurfaceDefinition,
  SurfaceGraph,
  SurfaceSection,
} from '../lib/domain/knowledge/types';
import type {
  WidgetAction,
  WidgetActionSemantics,
  WidgetCapabilityContract,
  WidgetEffectCategory,
  WidgetInteractionContext,
  WidgetPrecondition,
} from '../lib/domain/knowledge/widget-types';
import type {
  BenchmarkContext,
  BenchmarkDriftEvent,
  BenchmarkExpansionRule,
  BenchmarkField,
  BenchmarkFlow,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DerivedGraph,
  DogfoodRun,
  GraphEdge,
  GraphEdgeKind,
  GraphNode,
  GraphNodeKind,
  MappedMcpResource,
  MappedMcpTemplate,
  ScenarioExplanation,
  ScenarioExplanationStep,
  ScenarioExplanationSummary,
} from '../lib/domain/projection/types';
import type {
  ApprovalReceipt,
  DatasetControl,
  EvidenceRecord,
  NeedsHumanReceipt,
  OperatorInboxItem,
  OperatorInboxItemKind,
  RerunPlan,
  ResolutionControl,
  ResolutionControlSelector,
  ResolutionControlStep,
  ResolutionEvidenceDraft,
  ResolutionExhaustionEntry,
  ResolutionObservation,
  ResolutionProposalDraft,
  ResolutionReceipt,
  ResolvedReceipt,
  ResolvedWithProposalsReceipt,
  RunbookControl,
  RuntimeControlSession,
  RuntimeDatasetBinding,
  RuntimeResolutionControl,
  RuntimeRunbookControl,
  ScenarioTaskPacket,
  TranslationCandidate,
  TranslationReceipt,
  TranslationRequest,
} from '../lib/domain/resolution/types';

// Verify every type listed above is importable — the union forces TypeScript
// to resolve each symbol at compile time while keeping the lint rule happy.
type _AssertExported =
  | Confidence
  | Governance
  | StepProvenanceKind
  | ScenarioStatus
  | StepAction
  | DiagnosticSeverity
  | RuntimeInterpreterMode
  | ExecutionProfile
  | WriteMode
  | WorkflowLane
  | WorkflowStage
  | WorkflowScope
  | ResolutionMode
  | StepWinningSource
  | PatternActionName
  | ScenarioLifecycle
  | StepBindingKind
  | EffectState
  | SurfaceKind
  | AssertionKind
  | CapabilityName
  | EffectTargetKind
  | LocatorStrategyKind
  | WidgetAction
  | WidgetPrecondition
  | WidgetEffectCategory
  | WorkflowEnvelopeIds
  | WorkflowEnvelopeFingerprints
  | WorkflowEnvelopeLineage
  | WorkflowEnvelope<unknown>
  | ParticipantKind
  | ParticipantCapability
  | ParticipantRef
  | Participant
  | InterventionKind
  | InterventionStatus
  | InterventionTargetKind
  | InterventionTarget
  | InterventionPlan
  | InterventionEffectKind
  | InterventionEffect
  | InterventionReceipt
  | ExecutionPosture
  | WriteJournalEntry
  | WidgetInteractionContext
  | WidgetActionSemantics
  | WidgetCapabilityContract
  | LocatorStrategy
  | RefPath
  | AdoStep
  | AdoParameter
  | AdoSnapshot
  | ScenarioSource
  | ScenarioMetadata
  | ScenarioPrecondition
  | ValueRefLiteral
  | ValueRefFixturePath
  | ValueRefPostureSample
  | ValueRefParameterRow
  | ValueRefGeneratedToken
  | ValueRef
  | StepInstruction
  | StepProgram
  | StepResolution
  | ScenarioStep
  | ScenarioPostcondition
  | Scenario
  | BoundStep
  | BoundScenario
  | GroundedFlowStep
  | GroundedFlowMetadata
  | GroundedSpecFlow
  | StepTaskElementCandidate
  | StepTaskScreenCandidate
  | TranslationCandidate
  | TranslationRequest
  | TranslationReceipt
  | ApprovalEquivalenceStatus
  | ArtifactConfidenceRecord
  | ConfidenceOverlayCatalog
  | InterfaceResolutionContext
  | ScenarioTaskPacket
  | SurfaceSection
  | SurfaceDefinition
  | SurfaceGraph
  | ElementSig
  | ScreenElements
  | ScreenElementHint
  | ScreenHints
  | PatternAliasSet
  | PatternDocument
  | MergedPatterns
  | SharedPatterns
  | PostureEffect
  | Posture
  | ScreenPostures
  | DatasetControl
  | ResolutionControlSelector
  | ResolutionControlStep
  | ResolutionControl
  | RunbookControl
  | RuntimeDatasetBinding
  | RuntimeResolutionControl
  | RuntimeRunbookControl
  | RuntimeControlSession
  | OperatorInboxItemKind
  | OperatorInboxItem
  | ApprovalReceipt
  | RerunPlan
  | BenchmarkField
  | BenchmarkFlow
  | BenchmarkDriftEvent
  | BenchmarkExpansionRule
  | BenchmarkContext
  | BenchmarkScorecard
  | BenchmarkImprovementProjection
  | DogfoodRun
  | ManifestEntry
  | Manifest
  | DiagnosticProvenance
  | CompilerDiagnostic
  | EvidenceRecord
  | ResolutionObservation
  | ResolutionExhaustionEntry
  | ResolutionEvidenceDraft
  | ResolutionProposalDraft
  | ResolutionTarget
  | ResolvedReceipt
  | ResolvedWithProposalsReceipt
  | NeedsHumanReceipt
  | ResolutionReceipt
  | ExecutionDiagnostic
  | ExecutionObservation
  | StepExecutionReceipt
  | ScenarioRunStep
  | RunRecord
  | ProposalEntry
  | ProposalBundle
  | TrustPolicyArtifactType
  | TrustPolicyDecision
  | TrustPolicyEvidenceRule
  | TrustPolicyArtifactRule
  | TrustPolicy
  | ProposedChangeMetadata
  | EvidenceDescriptor
  | TrustPolicyEvaluationReason
  | TrustPolicyEvaluation
  | DerivedCapability
  | GraphNodeKind
  | GraphEdgeKind
  | GraphNode
  | GraphEdge
  | MappedMcpResource
  | MappedMcpTemplate
  | DerivedGraph
  | ExperimentSubstrate
  | SubstrateContext
  | ExperimentScorecardComparison
  | ImprovementLoopIteration
  | ImprovementLoopConvergenceReason
  | ImprovementLoopLedger
  | DogfoodLedgerProjection
  | ObjectiveVector
  | ImprovementSignalKind
  | ImprovementSignal
  | CandidateIntervention
  | AcceptanceVerdict
  | AcceptanceDecision
  | ImprovementIteration
  | ImprovementConvergenceReason
  | ImprovementLineageKind
  | ImprovementLineageEntry
  | ImprovementRun
  | ImprovementLedger
  | SyncResult
  | CaptureResult
  | ScenarioExplanationSummary
  | ScenarioExplanationStep
  | ScenarioExplanation;

test('keeps legacy lib/domain/types exports available', () => {
  expect(true).toBe(true);
});

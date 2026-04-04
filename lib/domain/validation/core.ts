import type {
  InterpretationDriftRecord,
  ProposalBundle,
  ResolutionGraphRecord,
  RunRecord,
} from '../execution/types';
import type { Manifest, TrustPolicy, TrustPolicyEvaluation } from '../governance/workflow-types';
import type { AdoSnapshot, BoundScenario, Scenario } from '../intent/types';
import type {
  BehaviorPatternDocument,
  ConfidenceOverlayCatalog,
  PatternDocument,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  SurfaceGraph,
} from '../knowledge/types';
import type { WidgetCapabilityContract } from '../knowledge/widget-types';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DerivedGraph,
  DogfoodRun,
} from '../projection/types';
import type {
  ApprovalReceipt,
  DatasetControl,
  OperatorInboxItem,
  RerunPlan,
  ResolutionControl,
  RunbookControl,
  ScenarioInterpretationSurface,
  ScenarioTaskPacket,
} from '../resolution/types';
import {
  validateAdoSnapshotArtifact,
  validateBoundScenarioArtifact,
  validateScenarioArtifact,
} from './core/intent-validator';
import {
  validateBehaviorPatternDocumentArtifact,
  validateManifestArtifact,
  validatePatternDocumentArtifact,
  validateScreenBehaviorArtifact,
  validateScreenElementsArtifact,
  validateScreenHintsArtifact,
  validateScreenPosturesArtifact,
  validateSharedPatternsArtifact,
  validateWidgetCapabilityContractArtifact,
} from './core/knowledge-validator';
import {
  validateDatasetControlArtifact,
  validateResolutionControlArtifact,
  validateRunbookControlArtifact,
  validateScenarioInterpretationSurfaceArtifact,
  validateScenarioTaskPacketArtifact,
} from './core/resolution-validator';
import {
  validateBenchmarkContextArtifact,
  validateBenchmarkImprovementProjectionArtifact,
  validateBenchmarkScorecardArtifact,
  validateDogfoodRunArtifact,
  validateInterpretationDriftRecordArtifact,
  validateResolutionGraphRecordArtifact,
  validateRunRecordArtifact,
} from './core/execution-validator';
import {
  validateApprovalReceiptArtifact,
  validateOperatorInboxItemArtifact,
  validateProposalBundleArtifact,
  validateRerunPlanArtifact,
  validateTrustPolicyArtifact,
  validateTrustPolicyEvaluationArtifact,
} from './core/governance-validator';
import {
  validateConfidenceOverlayCatalogArtifact,
  validateDerivedGraphArtifact,
  validateSurfaceGraphArtifact,
} from './core/graph-validator';

export const validateWidgetCapabilityContract: (value: unknown, path?: string) => WidgetCapabilityContract =
  validateWidgetCapabilityContractArtifact;
export const validateAdoSnapshot: (value: unknown) => AdoSnapshot = validateAdoSnapshotArtifact;
export const validateScenario: (value: unknown) => Scenario = validateScenarioArtifact;
export const validateBoundScenario: (value: unknown) => BoundScenario = validateBoundScenarioArtifact;
export const validateScenarioInterpretationSurface: (value: unknown) => ScenarioInterpretationSurface =
  validateScenarioInterpretationSurfaceArtifact;
export const validateScenarioTaskPacket: (value: unknown) => ScenarioTaskPacket = validateScenarioTaskPacketArtifact;
export const validateRunRecord: (value: unknown) => RunRecord = validateRunRecordArtifact;
export const validateProposalBundle: (value: unknown) => ProposalBundle = validateProposalBundleArtifact;
export const validateSurfaceGraph: (value: unknown) => SurfaceGraph = validateSurfaceGraphArtifact;
export const validateScreenElements: (value: unknown) => ScreenElements = validateScreenElementsArtifact;
export const validateScreenHints: (value: unknown) => ScreenHints = validateScreenHintsArtifact;
export const validateDatasetControl: (value: unknown) => DatasetControl = validateDatasetControlArtifact;
export const validateResolutionControl: (value: unknown) => ResolutionControl = validateResolutionControlArtifact;
export const validateRunbookControl: (value: unknown) => RunbookControl = validateRunbookControlArtifact;
export const validatePatternDocument: (value: unknown) => PatternDocument = validatePatternDocumentArtifact;
export const validateSharedPatterns: (value: unknown) => SharedPatterns = validateSharedPatternsArtifact;
export const validateScreenPostures: (value: unknown) => ScreenPostures = validateScreenPosturesArtifact;
export const validateScreenBehavior: (value: unknown) => ScreenBehavior = validateScreenBehaviorArtifact;
export const validateBehaviorPatternDocument: (value: unknown) => BehaviorPatternDocument =
  validateBehaviorPatternDocumentArtifact;
export const validateManifest: (value: unknown) => Manifest = validateManifestArtifact;
export const validateDerivedGraph: (value: unknown) => DerivedGraph = validateDerivedGraphArtifact;
export const validateTrustPolicy: (value: unknown) => TrustPolicy = validateTrustPolicyArtifact;
export const validateTrustPolicyEvaluation: (value: unknown) => TrustPolicyEvaluation = validateTrustPolicyEvaluationArtifact;
export const validateOperatorInboxItem: (value: unknown) => OperatorInboxItem = validateOperatorInboxItemArtifact;
export const validateApprovalReceipt: (value: unknown) => ApprovalReceipt = validateApprovalReceiptArtifact;
export const validateRerunPlan: (value: unknown) => RerunPlan = validateRerunPlanArtifact;
export const validateConfidenceOverlayCatalog: (value: unknown) => ConfidenceOverlayCatalog =
  validateConfidenceOverlayCatalogArtifact;
export const validateBenchmarkContext: (value: unknown) => BenchmarkContext = validateBenchmarkContextArtifact;
export const validateResolutionGraphRecord: (value: unknown) => ResolutionGraphRecord = validateResolutionGraphRecordArtifact;
export const validateInterpretationDriftRecord: (value: unknown) => InterpretationDriftRecord =
  validateInterpretationDriftRecordArtifact;
export const validateBenchmarkScorecard: (value: unknown) => BenchmarkScorecard = validateBenchmarkScorecardArtifact;
export const validateBenchmarkImprovementProjection: (value: unknown) => BenchmarkImprovementProjection =
  validateBenchmarkImprovementProjectionArtifact;
export const validateDogfoodRun: (value: unknown) => DogfoodRun = validateDogfoodRunArtifact;

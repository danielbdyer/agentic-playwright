import type {
  AdoSnapshot,
  ApprovalReceipt,
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  BehaviorPatternDocument,
  BoundScenario,
  ConfidenceOverlayCatalog,
  DatasetControl,
  DerivedGraph,
  DogfoodRun,
  InterpretationDriftRecord,
  Manifest,
  OperatorInboxItem,
  PatternDocument,
  ProposalBundle,
  ResolutionControl,
  ResolutionGraphRecord,
  RerunPlan,
  RunRecord,
  RunbookControl,
  Scenario,
  ScenarioInterpretationSurface,
  ScenarioTaskPacket,
  ScreenBehavior,
  ScreenElements,
  ScreenHints,
  ScreenPostures,
  SharedPatterns,
  SurfaceGraph,
  TrustPolicy,
  TrustPolicyEvaluation,
  WidgetCapabilityContract,
} from '../types';
import { validateDatasetControlArtifact, validateResolutionControlArtifact, validateRunbookControlArtifact } from './core/controls';
import { validateConfidenceOverlayCatalogArtifact, validateDerivedGraphArtifact, validateSurfaceGraphArtifact } from './core/graph';
import {
  validateBenchmarkContextArtifact,
  validateBenchmarkImprovementProjectionArtifact,
  validateBenchmarkScorecardArtifact,
  validateDogfoodRunArtifact,
  validateInterpretationDriftRecordArtifact,
  validateResolutionGraphRecordArtifact,
  validateRunRecordArtifact,
} from './core/runtime-receipts';
import {
  validateAdoSnapshotArtifact,
  validateBoundScenarioArtifact,
  validateScenarioArtifact,
  validateScenarioInterpretationSurfaceArtifact,
  validateScenarioTaskPacketArtifact,
} from './core/scenario';
import {
  validateApprovalReceiptArtifact,
  validateOperatorInboxItemArtifact,
  validateProposalBundleArtifact,
  validateRerunPlanArtifact,
  validateTrustPolicyArtifact,
  validateTrustPolicyEvaluationArtifact,
} from './core/trust-policy';
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
} from './core/workflow-envelope';
import type { ArtifactValidationKind } from './shared/enums';

export type ValidatorResultByKind = {
  'ado-snapshot': AdoSnapshot;
  scenario: Scenario;
  'bound-scenario': BoundScenario;
  'scenario-interpretation-surface': ScenarioInterpretationSurface;
  'scenario-task-packet': ScenarioTaskPacket;
  'run-record': RunRecord;
  'proposal-bundle': ProposalBundle;
  'surface-graph': SurfaceGraph;
  'screen-elements': ScreenElements;
  'screen-hints': ScreenHints;
  'dataset-control': DatasetControl;
  'resolution-control': ResolutionControl;
  'runbook-control': RunbookControl;
  'pattern-document': PatternDocument;
  'shared-patterns': SharedPatterns;
  'screen-postures': ScreenPostures;
  'screen-behavior': ScreenBehavior;
  'behavior-pattern-document': BehaviorPatternDocument;
  manifest: Manifest;
  'derived-graph': DerivedGraph;
  'trust-policy': TrustPolicy;
  'trust-policy-evaluation': TrustPolicyEvaluation;
  'operator-inbox-item': OperatorInboxItem;
  'approval-receipt': ApprovalReceipt;
  'rerun-plan': RerunPlan;
  'confidence-overlay-catalog': ConfidenceOverlayCatalog;
  'benchmark-context': BenchmarkContext;
  'resolution-graph-record': ResolutionGraphRecord;
  'interpretation-drift-record': InterpretationDriftRecord;
  'benchmark-scorecard': BenchmarkScorecard;
  'benchmark-improvement-projection': BenchmarkImprovementProjection;
  'dogfood-run': DogfoodRun;
  'widget-capability-contract': WidgetCapabilityContract;
};

type ValidatorFn<K extends ArtifactValidationKind | 'widget-capability-contract'> =
  (value: unknown) => ValidatorResultByKind[K];

const validatorRegistry: { [K in keyof ValidatorResultByKind]: ValidatorFn<K> } = {
  'ado-snapshot': validateAdoSnapshotArtifact,
  scenario: validateScenarioArtifact,
  'bound-scenario': validateBoundScenarioArtifact,
  'scenario-interpretation-surface': validateScenarioInterpretationSurfaceArtifact,
  'scenario-task-packet': validateScenarioTaskPacketArtifact,
  'run-record': validateRunRecordArtifact,
  'proposal-bundle': validateProposalBundleArtifact,
  'surface-graph': validateSurfaceGraphArtifact,
  'screen-elements': validateScreenElementsArtifact,
  'screen-hints': validateScreenHintsArtifact,
  'dataset-control': validateDatasetControlArtifact,
  'resolution-control': validateResolutionControlArtifact,
  'runbook-control': validateRunbookControlArtifact,
  'pattern-document': validatePatternDocumentArtifact,
  'shared-patterns': validateSharedPatternsArtifact,
  'screen-postures': validateScreenPosturesArtifact,
  'screen-behavior': validateScreenBehaviorArtifact,
  'behavior-pattern-document': validateBehaviorPatternDocumentArtifact,
  manifest: validateManifestArtifact,
  'derived-graph': validateDerivedGraphArtifact,
  'trust-policy': validateTrustPolicyArtifact,
  'trust-policy-evaluation': validateTrustPolicyEvaluationArtifact,
  'operator-inbox-item': validateOperatorInboxItemArtifact,
  'approval-receipt': validateApprovalReceiptArtifact,
  'rerun-plan': validateRerunPlanArtifact,
  'confidence-overlay-catalog': validateConfidenceOverlayCatalogArtifact,
  'benchmark-context': validateBenchmarkContextArtifact,
  'resolution-graph-record': validateResolutionGraphRecordArtifact,
  'interpretation-drift-record': validateInterpretationDriftRecordArtifact,
  'benchmark-scorecard': validateBenchmarkScorecardArtifact,
  'benchmark-improvement-projection': validateBenchmarkImprovementProjectionArtifact,
  'dogfood-run': validateDogfoodRunArtifact,
  'widget-capability-contract': validateWidgetCapabilityContractArtifact,
};

export function validateByKind<K extends keyof ValidatorResultByKind>(kind: K, value: unknown): ValidatorResultByKind[K] {
  return validatorRegistry[kind](value);
}

export function getValidator<K extends keyof ValidatorResultByKind>(kind: K): ValidatorFn<K> {
  return validatorRegistry[kind];
}

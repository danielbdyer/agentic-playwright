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
} from '../resolution/types';
import { validateDatasetControlArtifact, validateResolutionControlArtifact, validateRunbookControlArtifact } from './core/resolution-validator';
import { validateConfidenceOverlayCatalogArtifact, validateDerivedGraphArtifact, validateSurfaceGraphArtifact } from './core/graph-validator';
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
  validateAdoSnapshotArtifact,
  validateBoundScenarioArtifact,
  validateScenarioArtifact,
  validateScenarioInterpretationSurfaceArtifact,
} from './core/intent-validator';
import {
  validateApprovalReceiptArtifact,
  validateOperatorInboxItemArtifact,
  validateProposalBundleArtifact,
  validateRerunPlanArtifact,
  validateTrustPolicyArtifact,
  validateTrustPolicyEvaluationArtifact,
} from './core/governance-validator';
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
import type { ArtifactValidationKind } from './shared/enums';

export type ValidatorResultByKind = {
  'ado-snapshot': AdoSnapshot;
  scenario: Scenario;
  'bound-scenario': BoundScenario;
  'scenario-interpretation-surface': ScenarioInterpretationSurface;
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

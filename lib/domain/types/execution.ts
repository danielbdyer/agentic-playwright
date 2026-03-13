import type { AdoId, EventSignatureRef, StateNodeRef, TransitionRef } from '../identity';
import type {
  CanonicalLineage,
  CertificationStatus,
  Governance,
  ProposalActivation,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from './workflow';
import type { ResolutionReceipt } from './resolution';
import type { TransitionObservation } from './interface';


export interface ResolutionGraphDriftDelta {
  traversalPathChanged: boolean;
  winnerRungChanged: boolean;
  winnerRationaleChanged: boolean;
}

export interface ResolutionGraphStepRecord {
  stepIndex: number;
  graph: import('./resolution').StepResolutionGraph;
}

export interface ResolutionGraphRecord {
  kind: 'resolution-graph-record';
  version: 1;
  stage: 'resolution';
  scope: 'run';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  adoId: AdoId;
  runId: string;
  providerId: string;
  mode: string;
  generatedAt: string;
  steps: ResolutionGraphStepRecord[];
}

export interface InterpretationDriftChange {
  field: 'winningSource' | 'target' | 'governance' | 'confidence' | 'exhaustion-path' | 'resolution-graph';
  before: unknown;
  after: unknown;
}

export interface InterpretationDriftStep {
  stepIndex: number;
  changed: boolean;
  changes: InterpretationDriftChange[];
  before: {
    winningSource: string;
    target: string;
    governance: Governance;
    confidence: string;
    exhaustionPath: string[];
    resolutionGraphDigest: string;
  };
  after: {
    winningSource: string;
    target: string;
    governance: Governance;
    confidence: string;
    exhaustionPath: string[];
    resolutionGraphDigest: string;
  };
  resolutionGraphDrift: ResolutionGraphDriftDelta;
}

export interface InterpretationDriftRecord {
  kind: 'interpretation-drift-record';
  version: 1;
  stage: 'resolution';
  scope: 'run';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  adoId: AdoId;
  runId: string;
  comparedRunId: string | null;
  providerId: string;
  mode: string;
  comparedAt: string;
  changedStepCount: number;
  unchangedStepCount: number;
  totalStepCount: number;
  hasDrift: boolean;
  provenance: {
    taskFingerprint: string;
    knowledgeFingerprint: string;
    controlsFingerprint: string | null;
    comparedTaskFingerprint: string | null;
    comparedKnowledgeFingerprint: string | null;
    comparedControlsFingerprint: string | null;
  };
  explainableByFingerprintDelta: boolean;
  steps: InterpretationDriftStep[];
}

export interface ExecutionDiagnostic {
  code: string;
  message: string;
  context?: Record<string, string> | undefined;
}

export interface ExecutionObservation {
  status: 'ok' | 'failed' | 'skipped';
  observedEffects: string[];
  diagnostics: ExecutionDiagnostic[];
}

export interface StepExecutionReceipt {
  version: 1;
  stage: 'execution';
  scope: 'step';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  stepIndex: number;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  runAt: string;
  mode: string;
  widgetContract?: string | null | undefined;
  locatorStrategy?: string | null | undefined;
  locatorRung?: number | null | undefined;
  degraded: boolean;
  preconditionFailures: string[];
  requiredStateRefs?: StateNodeRef[] | undefined;
  forbiddenStateRefs?: StateNodeRef[] | undefined;
  effectAssertions?: string[] | undefined;
  eventSignatureRefs?: EventSignatureRef[] | undefined;
  expectedTransitionRefs?: TransitionRef[] | undefined;
  observedStateRefs?: StateNodeRef[] | undefined;
  transitionObservations?: TransitionObservation[] | undefined;
  durationMs: number;
  timing: {
    setupMs: number;
    resolutionMs: number;
    actionMs: number;
    assertionMs: number;
    retriesMs: number;
    teardownMs: number;
    totalMs: number;
  };
  cost: {
    instructionCount: number;
    diagnosticCount: number;
  };
  budget: {
    thresholds: {
      maxSetupMs?: number | undefined;
      maxResolutionMs?: number | undefined;
      maxActionMs?: number | undefined;
      maxAssertionMs?: number | undefined;
      maxRetriesMs?: number | undefined;
      maxTeardownMs?: number | undefined;
      maxTotalMs?: number | undefined;
      maxInstructionCount?: number | undefined;
      maxDiagnosticCount?: number | undefined;
    };
    status: 'within-budget' | 'over-budget' | 'not-configured';
    breaches: string[];
  };
  failure: {
    family: 'none' | 'precondition-failure' | 'locator-degradation-failure' | 'environment-runtime-failure';
    code?: string | null | undefined;
    message?: string | null | undefined;
  };
  recovery: {
    policyProfile: string;
    attempts: RecoveryAttemptReceipt[];
  };
  handshakes: import('./workflow').WorkflowStage[];
  execution: ExecutionObservation;
}



export interface RecoveryAttemptReceipt {
  strategyId: import('../execution/recovery-policy').RecoveryStrategyId;
  family: Exclude<StepExecutionReceipt['failure']['family'], 'none'>;
  attempt: number;
  startedAt: string;
  durationMs: number;
  result: 'recovered' | 'failed' | 'skipped';
  diagnostics: string[];
}

export interface TranslationRunMetrics {
  total: number;
  hits: number;
  misses: number;
  disabled: number;
  hitRate: number;
  missReasons: Record<string, number>;
  failureClasses: Record<string, number>;
}

export interface ScenarioRunStep {
  stepIndex: number;
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
  evidenceIds: string[];
}

export interface RunRecord {
  kind: 'scenario-run-record';
  version: 1;
  stage: 'execution';
  scope: 'run';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    runId: string;
    adoId: AdoId;
    revision: number;
    title: string;
    suite: string;
    taskFingerprint: string;
    knowledgeFingerprint: string;
    provider: string;
    mode: string;
    startedAt: string;
    completedAt: string;
    steps: ScenarioRunStep[];
    evidenceIds: string[];
    translationMetrics: TranslationRunMetrics;
    executionMetrics: {
      timingTotals: StepExecutionReceipt['timing'];
      costTotals: StepExecutionReceipt['cost'];
      budgetBreaches: number;
      failureFamilies: Record<StepExecutionReceipt['failure']['family'], number>;
      recoveryFamilies: Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>;
      recoveryStrategies: Record<import('../execution/recovery-policy').RecoveryStrategyId, number>;
    };
  };
  runId: string;
  adoId: AdoId;
  revision: number;
  title: string;
  suite: string;
  taskFingerprint: string;
  knowledgeFingerprint: string;
  provider: string;
  mode: string;
  startedAt: string;
  completedAt: string;
  steps: ScenarioRunStep[];
  evidenceIds: string[];
  translationMetrics: TranslationRunMetrics;
  executionMetrics: {
    timingTotals: StepExecutionReceipt['timing'];
    costTotals: StepExecutionReceipt['cost'];
    budgetBreaches: number;
    failureFamilies: Record<StepExecutionReceipt['failure']['family'], number>;
    recoveryFamilies: Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>;
    recoveryStrategies: Record<import('../execution/recovery-policy').RecoveryStrategyId, number>;
  };
}

export interface ProposalEntry {
  proposalId: string;
  stepIndex: number;
  artifactType: TrustPolicyArtifactType;
  targetPath: string;
  title: string;
  patch: Record<string, unknown>;
  evidenceIds: string[];
  impactedSteps: number[];
  trustPolicy: TrustPolicyEvaluation;
  certification: CertificationStatus;
  activation: ProposalActivation;
  lineage: CanonicalLineage;
}

export interface ProposalBundle {
  kind: 'proposal-bundle';
  version: 1;
  stage: 'proposal';
  scope: 'scenario';
  ids: WorkflowEnvelopeIds;
  fingerprints: WorkflowEnvelopeFingerprints;
  lineage: WorkflowEnvelopeLineage;
  governance: Governance;
  payload: {
    adoId: AdoId;
    runId: string;
    revision: number;
    title: string;
    suite: string;
    proposals: ProposalEntry[];
  };
  adoId: AdoId;
  runId: string;
  revision: number;
  title: string;
  suite: string;
  proposals: ProposalEntry[];
}

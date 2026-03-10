import type { AdoId } from '../identity';
import type {
  Governance,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from './workflow';
import type { ResolutionReceipt } from './resolution';

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
  handshakes: import('./workflow').WorkflowStage[];
  execution: ExecutionObservation;
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

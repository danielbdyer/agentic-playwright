import type { AdoId, EventSignatureRef, StateNodeRef, TransitionRef } from '../identity';
import type { RecoveryStrategyId } from '../execution/recovery-policy';
import type {
  CanonicalLineage,
  CertificationStatus,
  Governance,
  ProposalActivation,
  ResolutionMode,
  StepWinningSource,
  TrustPolicyArtifactType,
  TrustPolicyEvaluation,
  WorkflowStage,
  WorkflowEnvelopeFingerprints,
  WorkflowEnvelopeIds,
  WorkflowEnvelopeLineage,
} from './workflow';
import type { ResolutionReceipt, ResolutionRungOverride, StepResolutionGraph, TranslationReceipt } from './resolution';
import type { ResolutionPrecedenceRung } from '../precedence';
import type { TransitionObservation } from './interface';


export interface ResolutionGraphDriftDelta {
  readonly traversalPathChanged: boolean;
  readonly winnerRungChanged: boolean;
  readonly winnerRationaleChanged: boolean;
}

export interface ResolutionGraphStepRecord {
  readonly stepIndex: number;
  readonly graph: StepResolutionGraph;
}

export interface ResolutionGraphRecord {
  readonly kind: 'resolution-graph-record';
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'run';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly providerId: string;
  readonly mode: string;
  readonly generatedAt: string;
  readonly steps: readonly ResolutionGraphStepRecord[];
}

export interface InterpretationDriftChange {
  readonly field: 'winningSource' | 'target' | 'governance' | 'confidence' | 'exhaustion-path' | 'resolution-graph';
  readonly before: unknown;
  readonly after: unknown;
}

export interface InterpretationDriftStep {
  readonly stepIndex: number;
  readonly changed: boolean;
  readonly changes: readonly InterpretationDriftChange[];
  readonly before: {
    readonly winningSource: string;
    readonly target: string;
    readonly governance: Governance;
    readonly confidence: string;
    readonly exhaustionPath: readonly string[];
    readonly resolutionGraphDigest: string;
  };
  readonly after: {
    readonly winningSource: string;
    readonly target: string;
    readonly governance: Governance;
    readonly confidence: string;
    readonly exhaustionPath: readonly string[];
    readonly resolutionGraphDigest: string;
  };
  readonly resolutionGraphDrift: ResolutionGraphDriftDelta;
}

export interface InterpretationDriftRecord {
  readonly kind: 'interpretation-drift-record';
  readonly version: 1;
  readonly stage: 'resolution';
  readonly scope: 'run';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly comparedRunId: string | null;
  readonly providerId: string;
  readonly mode: string;
  readonly comparedAt: string;
  readonly changedStepCount: number;
  readonly unchangedStepCount: number;
  readonly totalStepCount: number;
  readonly hasDrift: boolean;
  readonly provenance: {
    readonly taskFingerprint: string;
    readonly knowledgeFingerprint: string;
    readonly controlsFingerprint: string | null;
    readonly comparedTaskFingerprint: string | null;
    readonly comparedKnowledgeFingerprint: string | null;
    readonly comparedControlsFingerprint: string | null;
  };
  readonly explainableByFingerprintDelta: boolean;
  readonly steps: readonly InterpretationDriftStep[];
}

export interface ExecutionDiagnostic {
  readonly code: string;
  readonly message: string;
  readonly context?: Readonly<Record<string, string>> | undefined;
}

export interface ConsoleEntry {
  readonly level: 'log' | 'warn' | 'error' | 'info' | 'debug';
  readonly text: string;
  readonly timestamp: string;
  readonly url?: string | undefined;
}

export interface ExecutionObservation {
  readonly status: 'ok' | 'failed' | 'skipped';
  readonly observedEffects: readonly string[];
  readonly diagnostics: readonly ExecutionDiagnostic[];
  readonly consoleMessages?: readonly ConsoleEntry[] | undefined;
}



export interface PlannedTransitionEdgeReceipt {
  readonly transitionRef: TransitionRef;
  readonly eventSignatureRef: EventSignatureRef;
  readonly sourceStateRefs: readonly StateNodeRef[];
  readonly targetStateRefs: readonly StateNodeRef[];
}

export interface PlannedTransitionPathStepReceipt {
  readonly depth: number;
  readonly transitionRef: TransitionRef;
  readonly eventSignatureRef: EventSignatureRef;
  readonly fromStateRefs: readonly StateNodeRef[];
  readonly toStateRefs: readonly StateNodeRef[];
}

export interface PlannedExecutionStepReceipt {
  readonly requiredPreconditions: readonly StateNodeRef[];
  readonly forbiddenPreconditions: readonly StateNodeRef[];
  readonly availableTransitions: readonly PlannedTransitionEdgeReceipt[];
  readonly chosenTransitionPath: readonly PlannedTransitionPathStepReceipt[];
  readonly projectedSatisfiedStateRefs: readonly StateNodeRef[];
  readonly status: 'already-satisfied' | 'path-found' | 'no-path' | 'not-applicable';
  readonly failure?: {
    readonly code: 'runtime-state-precondition-unreachable';
    readonly message: string;
    readonly missingRequiredStates: readonly StateNodeRef[];
    readonly forbiddenActiveStates: readonly StateNodeRef[];
  } | undefined;
}
export interface StepExecutionReceipt {
  readonly version: 1;
  readonly stage: 'execution';
  readonly scope: 'step';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly stepIndex: number;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly runAt: string;
  readonly mode: string;
  readonly widgetContract?: string | null | undefined;
  readonly locatorStrategy?: string | null | undefined;
  readonly locatorRung?: number | null | undefined;
  readonly degraded: boolean;
  readonly preconditionFailures: readonly string[];
  readonly planning?: PlannedExecutionStepReceipt | undefined;
  readonly requiredStateRefs?: readonly StateNodeRef[] | undefined;
  readonly forbiddenStateRefs?: readonly StateNodeRef[] | undefined;
  readonly effectAssertions?: readonly string[] | undefined;
  readonly eventSignatureRefs?: readonly EventSignatureRef[] | undefined;
  readonly expectedTransitionRefs?: readonly TransitionRef[] | undefined;
  readonly observedStateRefs?: readonly StateNodeRef[] | undefined;
  readonly transitionObservations?: readonly TransitionObservation[] | undefined;
  readonly navigation?: {
    readonly selectedRouteVariantRef: string | null;
    readonly selectedRouteUrl: string | null;
    readonly semanticDestination: string | null;
    readonly expectedEntryStateRefs: readonly StateNodeRef[];
    readonly observedEntryStateRefs: readonly StateNodeRef[];
    readonly fallbackRoutePath: readonly string[];
    readonly mismatch: boolean;
    readonly rationale?: string | null | undefined;
  } | undefined;
  readonly durationMs: number;
  readonly timing: {
    readonly setupMs: number;
    readonly resolutionMs: number;
    readonly actionMs: number;
    readonly assertionMs: number;
    readonly retriesMs: number;
    readonly teardownMs: number;
    readonly totalMs: number;
  };
  readonly cost: {
    readonly instructionCount: number;
    readonly diagnosticCount: number;
  };
  readonly budget: {
    readonly thresholds: {
      readonly maxSetupMs?: number | undefined;
      readonly maxResolutionMs?: number | undefined;
      readonly maxActionMs?: number | undefined;
      readonly maxAssertionMs?: number | undefined;
      readonly maxRetriesMs?: number | undefined;
      readonly maxTeardownMs?: number | undefined;
      readonly maxTotalMs?: number | undefined;
      readonly maxInstructionCount?: number | undefined;
      readonly maxDiagnosticCount?: number | undefined;
    };
    readonly status: 'within-budget' | 'over-budget' | 'not-configured';
    readonly breaches: readonly string[];
  };
  readonly failure: {
    readonly family: 'none' | 'precondition-failure' | 'locator-degradation-failure' | 'environment-runtime-failure';
    readonly code?: string | null | undefined;
    readonly message?: string | null | undefined;
  };
  readonly recovery: {
    readonly policyProfile: string;
    readonly attempts: readonly RecoveryAttemptReceipt[];
  };
  readonly handshakes: readonly WorkflowStage[];
  readonly execution: ExecutionObservation;
}



export interface RecoveryAttemptReceipt {
  readonly strategyId: RecoveryStrategyId;
  readonly family: Exclude<StepExecutionReceipt['failure']['family'], 'none'>;
  readonly attempt: number;
  readonly startedAt: string;
  readonly durationMs: number;
  readonly result: 'recovered' | 'failed' | 'skipped';
  readonly diagnostics: readonly string[];
}

export interface TranslationRunMetrics {
  readonly total: number;
  readonly hits: number;
  readonly misses: number;
  readonly disabled: number;
  readonly hitRate: number;
  readonly missReasons: Readonly<Record<string, number>>;
  readonly failureClasses: Readonly<Record<string, number>>;
}

export interface StepFold {
  readonly stepIndex: number;
  readonly evidenceIds: readonly string[];
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly matchedTransitionRefs: readonly TransitionRef[];
  readonly failureFamily: StepExecutionReceipt['failure']['family'];
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly translation: TranslationReceipt | null;
  readonly recoveryAttempts: readonly RecoveryStrategyId[];
  readonly timing: StepExecutionReceipt['timing'];
  readonly cost: StepExecutionReceipt['cost'];
  readonly budgetStatus: StepExecutionReceipt['budget']['status'];
  readonly degraded: boolean;
  readonly resolutionMode: ResolutionMode;
  readonly winningSource: StepWinningSource;
}

export interface ScenarioRunFold {
  readonly kind: 'scenario-run-fold';
  readonly version: 1;
  readonly adoId: AdoId;
  readonly runId: string;
  readonly surfaceFingerprint: string;
  readonly byStep: ReadonlyMap<number, StepFold>;
  readonly translationMetrics: TranslationRunMetrics;
  readonly executionMetrics: {
    readonly timingTotals: StepExecutionReceipt['timing'];
    readonly costTotals: StepExecutionReceipt['cost'];
    readonly budgetBreaches: number;
    readonly failureFamilies: Readonly<Record<StepExecutionReceipt['failure']['family'], number>>;
    readonly recoveryFamilies: Readonly<Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>>;
    readonly recoveryStrategies: Readonly<Record<RecoveryStrategyId, number>>;
  };
  readonly evidenceIds: readonly string[];
  readonly observedStateRefs: readonly StateNodeRef[];
  readonly matchedTransitionRefs: readonly TransitionRef[];
}

export interface ScenarioRunStep {
  readonly stepIndex: number;
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
  readonly evidenceIds: readonly string[];
}

export interface RunRecord {
  readonly kind: 'scenario-run-record';
  readonly version: 1;
  readonly stage: 'execution';
  readonly scope: 'run';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: {
    readonly runId: string;
    readonly adoId: AdoId;
    readonly revision: number;
    readonly title: string;
    readonly suite: string;
    readonly taskFingerprint: string;
    readonly knowledgeFingerprint: string;
    readonly provider: string;
    readonly mode: string;
    readonly startedAt: string;
    readonly completedAt: string;
    readonly steps: readonly ScenarioRunStep[];
    readonly evidenceIds: readonly string[];
    readonly translationMetrics: TranslationRunMetrics;
    readonly executionMetrics: {
      readonly timingTotals: StepExecutionReceipt['timing'];
      readonly costTotals: StepExecutionReceipt['cost'];
      readonly budgetBreaches: number;
      readonly failureFamilies: Readonly<Record<StepExecutionReceipt['failure']['family'], number>>;
      readonly recoveryFamilies: Readonly<Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>>;
      readonly recoveryStrategies: Readonly<Record<RecoveryStrategyId, number>>;
    };
  };
  readonly runId: string;
  readonly adoId: AdoId;
  readonly revision: number;
  readonly title: string;
  readonly suite: string;
  readonly taskFingerprint: string;
  readonly knowledgeFingerprint: string;
  readonly provider: string;
  readonly mode: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly steps: readonly ScenarioRunStep[];
  readonly evidenceIds: readonly string[];
  readonly translationMetrics: TranslationRunMetrics;
  readonly executionMetrics: {
    readonly timingTotals: StepExecutionReceipt['timing'];
    readonly costTotals: StepExecutionReceipt['cost'];
    readonly budgetBreaches: number;
    readonly failureFamilies: Readonly<Record<StepExecutionReceipt['failure']['family'], number>>;
    readonly recoveryFamilies: Readonly<Record<Exclude<StepExecutionReceipt['failure']['family'], 'none'>, number>>;
    readonly recoveryStrategies: Readonly<Record<RecoveryStrategyId, number>>;
  };
}

export interface ProposalEntry {
  readonly proposalId: string;
  readonly stepIndex: number;
  readonly artifactType: TrustPolicyArtifactType;
  readonly targetPath: string;
  readonly title: string;
  readonly patch: Readonly<Record<string, unknown>>;
  readonly evidenceIds: readonly string[];
  readonly impactedSteps: readonly number[];
  readonly trustPolicy: TrustPolicyEvaluation;
  readonly certification: CertificationStatus;
  readonly activation: ProposalActivation;
  readonly lineage: CanonicalLineage;
}

export interface ProposalBundle {
  readonly kind: 'proposal-bundle';
  readonly version: 1;
  readonly stage: 'proposal';
  readonly scope: 'scenario';
  readonly ids: WorkflowEnvelopeIds;
  readonly fingerprints: WorkflowEnvelopeFingerprints;
  readonly lineage: WorkflowEnvelopeLineage;
  readonly governance: Governance;
  readonly payload: {
    readonly adoId: AdoId;
    readonly runId: string;
    readonly revision: number;
    readonly title: string;
    readonly suite: string;
    readonly proposals: readonly ProposalEntry[];
  };
  readonly adoId: AdoId;
  readonly runId: string;
  readonly revision: number;
  readonly title: string;
  readonly suite: string;
  readonly proposals: readonly ProposalEntry[];
}

// ─── Execution Tempo Awareness (N1.4) ───

export interface ScreenTempoProfile {
  readonly screenId: string;
  readonly observedDurationsMs: readonly number[];
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly recommendedTimeoutMs: number;
  readonly sampleCount: number;
  readonly lastUpdated: string;
}

export interface TempoAdaptationResult {
  readonly screenId: string;
  readonly previousTimeoutMs: number;
  readonly adaptedTimeoutMs: number;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly reason: string;
}

// ─── Rung Stress Test (N1.6) ───

export interface StressTestConfig {
  readonly kind: 'rung-isolation';
  readonly version: 1;
  readonly rungOverride: ResolutionRungOverride;
  readonly baselineRunId?: string;
}

export interface RungStressStepResult {
  readonly stepIndex: number;
  readonly resolvedWithForce: boolean;
  readonly resolvedWithBaseline: boolean;
  readonly degradedFromBaseline: boolean;
  readonly rungConfidence: number;
}

export interface RungMarginalValue {
  readonly rung: ResolutionPrecedenceRung;
  readonly resolutionRate: number;
  readonly degradationRate: number;
  readonly avgConfidence: number;
  readonly uniqueResolutions: number;
  readonly verdict: 'essential' | 'valuable' | 'marginal' | 'redundant';
}

export interface RungStressTestReceipt {
  readonly kind: 'rung-stress-test-receipt';
  readonly version: 1;
  readonly rung: ResolutionPrecedenceRung;
  readonly stepResults: readonly RungStressStepResult[];
  readonly marginalValue: RungMarginalValue;
}

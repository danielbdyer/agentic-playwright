/**
 * Evidence types — structured records of what happened.
 *
 * Extracted from execution/types.ts during Phase 2 domain decomposition.
 */
import type { AdoId, EventSignatureRef, StateNodeRef, TransitionRef } from '../kernel/identity';
import type { RecoveryStrategyId } from '../commitment/recovery-policy';
import type {
  ResolutionMode,
  StepWinningSource,
  WorkflowMetadata,
  WorkflowStage,
} from '../governance/workflow-types';
import type { ResolutionReceipt, TranslationReceipt } from '../resolution/types';
import type { TransitionObservation } from '../target/interface-graph';

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

export interface StepExecutionReceipt extends WorkflowMetadata<'execution'> {
  readonly scope: 'step';
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

export interface RunRecord extends WorkflowMetadata<'execution'> {
  readonly kind: 'scenario-run-record';
  readonly scope: 'run';
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

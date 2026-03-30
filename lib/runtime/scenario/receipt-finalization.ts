import { emptyExecutionTiming, evaluateExecutionBudget, normalizeFailureFamily } from '../../domain/execution/telemetry';
import { mintBlocked } from '../../domain/types/workflow';
import type { ExecutionDiagnostic, GroundedStep, InterfaceResolutionContext, ResolutionReceipt, StepExecutionReceipt } from '../../domain/types';
import type { RuntimeScenarioEnvironment } from '../scenario';
import type { ScenarioContextRef } from './types';

export function executionDiagnosticsFromError(code: string, message: string, context?: Record<string, string>): ExecutionDiagnostic[] {
  return [{ code, message, context }];
}

export function buildBlockedExecutionReceipt(input: {
  readonly task: GroundedStep;
  readonly runAt: string;
  readonly context?: ScenarioContextRef | undefined;
  readonly environment: RuntimeScenarioEnvironment;
  readonly resolutionContext: InterfaceResolutionContext;
  readonly interpretation: Extract<ResolutionReceipt, { kind: 'needs-human' }>;
}): StepExecutionReceipt {
  const timing = { ...emptyExecutionTiming(), totalMs: 0 };
  const diagnostics = executionDiagnosticsFromError('needs-human', input.interpretation.reason);
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: {
      adoId: input.context?.adoId ?? null,
      suite: null,
      runId: null,
      stepIndex: input.task.index,
      dataset: input.environment.controlSelection?.dataset ?? null,
      runbook: input.environment.controlSelection?.runbook ?? null,
      resolutionControl: input.environment.controlSelection?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: input.task.taskFingerprint,
      knowledge: input.resolutionContext.knowledgeFingerprint,
      task: input.task.taskFingerprint,
      controls: null,
      content: input.context?.contentHash ?? null,
      run: null,
    },
    lineage: {
      sources: [],
      parents: [input.task.taskFingerprint],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
    governance: mintBlocked(),
    stepIndex: input.task.index,
    taskFingerprint: input.task.taskFingerprint,
    knowledgeFingerprint: input.resolutionContext.knowledgeFingerprint,
    runAt: input.runAt,
    mode: input.environment.mode,
    widgetContract: null,
    locatorStrategy: null,
    locatorRung: null,
    degraded: false,
    preconditionFailures: [],
    requiredStateRefs: input.task.grounding.requiredStateRefs,
    forbiddenStateRefs: input.task.grounding.forbiddenStateRefs,
    eventSignatureRefs: input.task.grounding.eventSignatureRefs,
    expectedTransitionRefs: input.task.grounding.expectedTransitionRefs,
    observedStateRefs: [],
    transitionObservations: [],
    durationMs: 0,
    timing,
    cost: {
      instructionCount: 0,
      diagnosticCount: diagnostics.length,
    },
    budget: evaluateExecutionBudget({
      timing,
      cost: {
        instructionCount: 0,
        diagnosticCount: diagnostics.length,
      },
      thresholds: input.environment.executionBudgetThresholds,
    }),
    failure: normalizeFailureFamily({
      status: 'skipped',
      degraded: false,
      diagnostics,
    }),
    recovery: {
      policyProfile: input.environment.recoveryPolicy?.profile ?? 'default',
      attempts: [],
    },
    handshakes: ['preparation', 'resolution', 'execution'],
    execution: {
      status: 'skipped',
      observedEffects: [],
      diagnostics,
    },
  };
}

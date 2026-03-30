import type { Page } from '@playwright/test';
import { uniqueSorted } from '../domain/collections';
import type { AdoId, StateNodeRef, TransitionRef } from '../domain/identity';
import type { ExecutionBudgetThresholds } from '../domain/execution/telemetry';
import { defaultRecoveryPolicy, type RecoveryPolicy } from '../domain/execution/recovery-policy';
import { emptyExecutionTiming, evaluateExecutionBudget, normalizeFailureFamily } from '../domain/execution/telemetry';
import type { SnapshotTemplateLoader } from '../domain/runtime-loaders';
import { RuntimeError } from '../domain/errors';
import { mintBlocked } from '../domain/types/workflow';
import type {
  ExecutionPosture,
  ExecutionDiagnostic,
  InterfaceResolutionContext,
  ObservedStateSession,
  ResolutionReceipt,
  ScenarioRunPlan,
  ResolutionTarget,
  ScenarioStep,
  StepExecutionReceipt,
  GroundedStep,
  TransitionObservation,
  TranslationRequest,
  TranslationReceipt,
} from '../domain/types';
import type { RouteVariantKnowledge } from '../domain/types/route-knowledge';
import type { InterpreterMode, InterpreterScreenRegistry } from './interpreters/types';
import type { RuntimeStepAgent } from './agent';
import { applyProposalDraftsToRuntimeContext } from './agent/proposals';
import type { RuntimeDomResolver } from '../domain/types';
import { observeStateRefsOnPage, observeTransitionOnPage } from '../playwright/state-topology';
import { planExecutionStep } from '../domain/execution-planner';
import type { AgentInterpreterProvider } from '../domain/types/agent-interpreter';
import { createScenarioRunState, stepHandshakeFromPlan as stepHandshakeFromPlanInternal } from './scenario/handshake';
import { runInterpretationStage } from './scenario/interpretation';
import { selectRouteForNavigate } from './scenario/route-selection';
import { runRecoveryStage } from './scenario/recovery';
import { buildBlockedExecutionReceipt, executionDiagnosticsFromError } from './scenario/receipt-finalization';
import { executeStepProgramStage, resolvedScenarioStep } from './scenario/step-execution';
import type {
  ScenarioContextRef,
  ScenarioRunState,
  ScenarioStepHandshake,
  ScenarioStepRunResult,
} from './scenario/types';
export type { ScenarioContextRef, ScenarioRunState, ScenarioStepHandshake, ScenarioStepRunResult } from './scenario/types';

export interface RuntimeScenarioEnvironment {
  mode: InterpreterMode;
  provider: string;
  posture?: ExecutionPosture | undefined;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  translator?: ((request: TranslationRequest) => Promise<TranslationReceipt>) | undefined;
  fixtures: Record<string, unknown>;
  screens: InterpreterScreenRegistry;
  snapshotLoader: SnapshotTemplateLoader;
  agent?: RuntimeStepAgent | undefined;
  page?: Page | undefined;
  domResolver?: RuntimeDomResolver | undefined;
  agentInterpreter?: AgentInterpreterProvider | undefined;
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

function activeRouteVariantRefs(state: ScenarioRunState, task: GroundedStep): readonly string[] {
  return state.observedStateSession.activeRouteVariantRefs.length > 0
    ? state.observedStateSession.activeRouteVariantRefs
    : task.grounding.routeVariantRefs;
}

function relevantStateRefs(task: GroundedStep): readonly StateNodeRef[] {
  return uniqueSorted([
    ...task.grounding.requiredStateRefs,
    ...task.grounding.forbiddenStateRefs,
    ...task.grounding.resultStateRefs,
  ]);
}


function inferTransitionObservations(input: {
  task: GroundedStep;
  interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
  success: boolean;
}): TransitionObservation[] {
  if (input.task.grounding.expectedTransitionRefs.length === 0) {
    return [];
  }

  const observedStateRefs = input.success ? input.task.grounding.resultStateRefs : [];
  return [{
    observationId: `runtime:${input.task.index}:${input.interpretation.target.action}`,
    source: 'runtime',
    actor: 'runtime-execution',
    screen: input.interpretation.target.screen,
    eventSignatureRef: input.task.grounding.eventSignatureRefs[0] ?? null,
    transitionRef: input.task.grounding.expectedTransitionRefs.length === 1 ? input.task.grounding.expectedTransitionRefs[0]! : null,
    expectedTransitionRefs: input.task.grounding.expectedTransitionRefs,
    observedStateRefs,
    unexpectedStateRefs: [],
    confidence: input.success ? 'inferred' : 'missing',
    classification: input.success ? 'matched' : 'missing-expected',
    detail: {
      mode: 'static-inference',
      result: input.success ? 'ok' : 'failed',
    },
  }];
}

function mergeObservedStateSession(input: {
  state: ScenarioRunState;
  task: GroundedStep;
  interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
  observedStateRefs: readonly StateNodeRef[];
  transitionRefs: readonly TransitionRef[];
}) {
  const relevant = new Set(relevantStateRefs(input.task));
  input.state.observedStateSession = {
    ...input.state.observedStateSession,
    currentScreen: {
      screen: input.interpretation.target.screen,
      confidence: input.interpretation.confidence === 'compiler-derived' ? 1 : 0.8,
      observedAtStep: input.task.index,
    },
    activeStateRefs: uniqueSorted([
      ...input.state.observedStateSession.activeStateRefs.filter((ref) => !relevant.has(ref)),
      ...input.observedStateRefs,
    ]),
    lastObservedTransitionRefs: uniqueSorted(input.transitionRefs),
    activeRouteVariantRefs: uniqueSorted([
      ...input.state.observedStateSession.activeRouteVariantRefs,
      ...input.task.grounding.routeVariantRefs,
    ]),
    activeTargetRefs: uniqueSorted([
      ...input.state.observedStateSession.activeTargetRefs,
      ...input.task.grounding.targetRefs,
    ]),
    lineage: uniqueSorted([
      ...input.state.observedStateSession.lineage,
      `step:${input.task.index}`,
      `screen:${input.interpretation.target.screen}`,
      ...input.transitionRefs.map((ref) => `transition:${ref}`),
      ...input.observedStateRefs.map((ref) => `state:${ref}`),
    ]).slice(-48),
  };
}


export async function runScenarioStep(
  task: GroundedStep,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: ScenarioContextRef,
  interfaceResolutionContext?: InterfaceResolutionContext | undefined,
): Promise<ScenarioStepRunResult> {
  if (!interfaceResolutionContext) {
    throw new RuntimeError('runtime-missing-resolution-context', `Missing interface resolution context for step ${task.index}`);
  }

  const interpretationStage = await runInterpretationStage({
    task,
    environment,
    state,
    resolutionContext: interfaceResolutionContext,
  });
  const { interpretation, runAt, startedAt, agentContext } = interpretationStage;

  // runScenarioStep is the only coordinator allowed to mutate run-local ephemeral refs.
  state.observedStateSession = agentContext.observedStateSession ?? state.observedStateSession;

  if (interpretation.kind === 'needs-human') {
    return {
      interpretation,
      execution: buildBlockedExecutionReceipt({
        task,
        runAt,
        context,
        environment,
        resolutionContext: interfaceResolutionContext,
        interpretation,
      }),
    };
  }

  const routeSelection = selectRouteForNavigate({
    context: interfaceResolutionContext,
    task,
    interpretation,
  });

  const observedRelevantStateRefs = relevantStateRefs(task);
  const activeVariants = activeRouteVariantRefs(state, task);
  const beforeObservedStateRefs = environment.page && interfaceResolutionContext.stateGraph
    ? (await observeStateRefsOnPage({
        page: environment.page,
        context: interfaceResolutionContext,
        stateRefs: observedRelevantStateRefs,
        activeRouteVariantRefs: activeVariants,
      }))
        .flatMap((entry) => entry.observed ? [entry.stateRef] : [])
    : state.observedStateSession.activeStateRefs.filter((ref) => observedRelevantStateRefs.includes(ref));
  const skipStatePreconditions = interpretation.target.action === 'navigate';
  const planning = planExecutionStep({
    stateGraph: interfaceResolutionContext.stateGraph,
    activeStateRefs: beforeObservedStateRefs,
    requiredStateRefs: task.grounding.requiredStateRefs,
    forbiddenStateRefs: task.grounding.forbiddenStateRefs,
    skipPreconditions: skipStatePreconditions,
  });
  const missingRequiredStates = planning.failure?.missingRequiredStates ?? [];
  const forbiddenActiveStates = planning.failure?.forbiddenActiveStates ?? [];
  if (planning.status === 'no-path' || planning.status === 'not-applicable') {
    const diagnostics = executionDiagnosticsFromError(
      'runtime-state-precondition-unreachable',
      `State preconditions are unreachable for step ${task.index}`,
      {
        missingRequiredStates: missingRequiredStates.join(','),
        forbiddenActiveStates: forbiddenActiveStates.join(','),
        plannerStatus: planning.status,
        plannedTransitionRefs: planning.chosenTransitionPath.map((entry) => entry.transitionRef).join(','),
      },
    );
    const timing = {
      ...emptyExecutionTiming(),
      totalMs: 0,
    };
    return {
      interpretation,
      execution: {
        version: 1,
        stage: 'execution',
        scope: 'step',
        ids: {
          adoId: context?.adoId ?? null,
          suite: null,
          runId: null,
          stepIndex: task.index,
          dataset: environment.controlSelection?.dataset ?? null,
          runbook: environment.controlSelection?.runbook ?? null,
          resolutionControl: environment.controlSelection?.resolutionControl ?? null,
        },
        fingerprints: {
          artifact: task.taskFingerprint,
          knowledge: interfaceResolutionContext.knowledgeFingerprint,
          task: task.taskFingerprint,
          controls: null,
          content: context?.contentHash ?? null,
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution', 'execution'],
        },
        governance: mintBlocked(),
        stepIndex: task.index,
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: interfaceResolutionContext.knowledgeFingerprint,
        runAt,
        mode: environment.mode,
        widgetContract: null,
        locatorStrategy: null,
        locatorRung: null,
        degraded: false,
        preconditionFailures: diagnostics.map((entry) => entry.message),
        planning,
        requiredStateRefs: task.grounding.requiredStateRefs,
        forbiddenStateRefs: task.grounding.forbiddenStateRefs,
        eventSignatureRefs: task.grounding.eventSignatureRefs,
        expectedTransitionRefs: task.grounding.expectedTransitionRefs,
        observedStateRefs: beforeObservedStateRefs,
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
          thresholds: environment.executionBudgetThresholds,
        }),
        failure: normalizeFailureFamily({
          status: 'failed',
          degraded: false,
          diagnostics,
        }),
        recovery: {
          policyProfile: (environment.recoveryPolicy ?? defaultRecoveryPolicy).profile,
          attempts: [],
        },
        handshakes: ['preparation', 'resolution', 'execution'],
        execution: {
          status: 'failed',
          observedEffects: [],
          diagnostics,
        },
      },
    };
  }

  state.previousResolution = interpretation.target;
  const { result, consoleMessages } = await executeStepProgramStage({
    task,
    environment,
    interpretation: {
      target: interpretation.target,
      confidence: interpretation.confidence,
    },
    routeSelection,
    context,
  });

  const firstOutcome = result.value.outcomes[0];
  const diagnostics = result.ok
    ? []
    : result.diagnostic
      ? executionDiagnosticsFromError(result.diagnostic.code, result.diagnostic.message)
      : executionDiagnosticsFromError(result.error.code, result.error.message, result.error.context);
  const preconditionFailures = diagnostics
    .flatMap((diagnostic) => diagnostic.code === 'runtime-widget-precondition-failed' ? [diagnostic.message] : []);
  const completedAt = Date.now();
  const timing = {
    ...emptyExecutionTiming(),
    resolutionMs: firstOutcome ? Math.max(0, completedAt - startedAt - 1) : completedAt - startedAt,
    actionMs: firstOutcome ? 1 : 0,
    totalMs: completedAt - startedAt,
  };
  const cost = {
    instructionCount: result.value.outcomes.length,
    diagnosticCount: diagnostics.length,
  };
  const failure = normalizeFailureFamily({
    status: result.ok ? 'ok' : 'failed',
    degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
    diagnostics,
  });
  const recovery = result.ok
    ? { policyProfile: (environment.recoveryPolicy ?? defaultRecoveryPolicy).profile, attempts: [], recovered: false }
    : await runRecoveryStage({
      family: failure.family,
      policy: environment.recoveryPolicy,
      preconditionFailures,
      diagnostics,
      degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
    });
  const runtimeSucceeded = result.ok || recovery.recovered;
  const transitionObservations = task.grounding.expectedTransitionRefs.length === 0
    ? []
    : environment.page && interfaceResolutionContext.stateGraph
      ? await Promise.all(
          (task.grounding.eventSignatureRefs.length > 0 ? task.grounding.eventSignatureRefs : [null]).map((eventSignatureRef, index) =>
            observeTransitionOnPage({
              page: environment.page!,
              context: interfaceResolutionContext,
              screen: interpretation.target.screen,
              eventSignatureRef,
              expectedTransitionRefs: task.grounding.expectedTransitionRefs,
              beforeObservedStateRefs,
              activeRouteVariantRefs: activeVariants,
              source: 'runtime',
              actor: 'runtime-execution',
              observationId: `runtime:${task.index}:${index}:${eventSignatureRef ?? 'none'}`,
            }),
          ),
        )
      : inferTransitionObservations({
          task,
          interpretation,
          success: runtimeSucceeded,
        });
  const observedStateRefs = uniqueSorted(transitionObservations.flatMap((entry) => entry.observedStateRefs));
  const navigationMismatch = interpretation.target.action === 'navigate'
    && task.grounding.resultStateRefs.length > 0
    && task.grounding.resultStateRefs.some((ref) => !observedStateRefs.includes(ref));
  const matchedTransitionRefs = uniqueSorted(
    transitionObservations
      .flatMap((entry) => entry.classification === 'matched' && entry.transitionRef ? [entry.transitionRef] : [])
  );
  if (runtimeSucceeded) {
    if (interpretation.kind === 'resolved-with-proposals') {
      applyProposalDraftsToRuntimeContext(interfaceResolutionContext, interpretation.proposalDrafts);
    }
    mergeObservedStateSession({
      state,
      task,
      interpretation,
      observedStateRefs: observedStateRefs.length > 0 ? observedStateRefs : task.grounding.resultStateRefs,
      transitionRefs: matchedTransitionRefs,
    });
  }

  const execution: StepExecutionReceipt = {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: {
      adoId: context?.adoId ?? null,
      suite: null,
      runId: null,
      stepIndex: task.index,
      dataset: environment.controlSelection?.dataset ?? null,
      runbook: environment.controlSelection?.runbook ?? null,
      resolutionControl: environment.controlSelection?.resolutionControl ?? null,
    },
    fingerprints: {
      artifact: task.taskFingerprint,
      knowledge: agentContext.resolutionContext.knowledgeFingerprint,
      task: task.taskFingerprint,
      controls: null,
      content: context?.contentHash ?? null,
      run: null,
    },
    lineage: {
      sources: [],
      parents: [task.taskFingerprint],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
    governance: result.ok || recovery.recovered ? 'approved' : 'blocked',
    stepIndex: task.index,
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: agentContext.resolutionContext.knowledgeFingerprint,
    runAt,
    mode: environment.mode,
    widgetContract: firstOutcome?.widgetContract ?? null,
    locatorStrategy: firstOutcome?.locatorStrategy,
    locatorRung: firstOutcome?.locatorRung ?? null,
    degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
    preconditionFailures,
    planning,
    requiredStateRefs: task.grounding.requiredStateRefs,
    forbiddenStateRefs: task.grounding.forbiddenStateRefs,
    effectAssertions: task.grounding.effectAssertions,
    eventSignatureRefs: task.grounding.eventSignatureRefs,
    expectedTransitionRefs: task.grounding.expectedTransitionRefs,
    observedStateRefs,
    transitionObservations,
    navigation: interpretation.target.action === 'navigate'
      ? {
          selectedRouteVariantRef: routeSelection.selectedRouteVariantRef,
          selectedRouteUrl: routeSelection.selectedRouteUrl,
          semanticDestination: routeSelection.semanticDestination,
          expectedEntryStateRefs: task.grounding.resultStateRefs,
          observedEntryStateRefs: observedStateRefs,
          fallbackRoutePath: navigationMismatch ? routeSelection.fallbackRoutePath : [],
          mismatch: navigationMismatch,
          rationale: routeSelection.rationale,
        }
      : undefined,
    durationMs: completedAt - startedAt,
    timing,
    cost,
    budget: evaluateExecutionBudget({
      timing,
      cost,
      thresholds: environment.executionBudgetThresholds,
    }),
    failure,
    recovery: {
      policyProfile: recovery.policyProfile,
      attempts: recovery.attempts,
    },
    handshakes: ['preparation', 'resolution', 'execution'],
    execution: result.ok
      ? {
          status: 'ok',
          observedEffects: firstOutcome?.observedEffects ?? [],
          diagnostics: [],
          ...(consoleMessages.length > 0 ? { consoleMessages } : {}),
        }
      : recovery.recovered
        ? {
            status: 'ok',
            observedEffects: [...(firstOutcome?.observedEffects ?? []), 'recovery-succeeded'],
            diagnostics: [],
            ...(consoleMessages.length > 0 ? { consoleMessages } : {}),
          }
        : {
            status: 'failed',
            observedEffects: firstOutcome?.observedEffects ?? [],
            diagnostics,
            ...(consoleMessages.length > 0 ? { consoleMessages } : {}),
          },
  };

  return {
    interpretation,
    execution,
  };
}

export async function runScenarioHandshake(
  handshake: ScenarioStepHandshake,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: ScenarioContextRef,
): Promise<ScenarioStepRunResult> {
  return runScenarioStep(handshake.task, environment, state, context, handshake.resolutionContext);
}

export function stepHandshakeFromPlan(plan: ScenarioRunPlan, zeroBasedIndex: number): ScenarioStepHandshake {
  return stepHandshakeFromPlanInternal({ plan, zeroBasedIndex });
}

export { createScenarioRunState };

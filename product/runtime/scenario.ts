import type { Page } from '@playwright/test';
import { performNavigation } from './adapters/navigation-strategy';
import { attachConsoleSentinel } from './observe/console-sentinel';
import { asFingerprint } from '../domain/kernel/hash';
import { uniqueSorted } from '../domain/kernel/collections';
import type { AdoId } from '../domain/kernel/identity';
import { defaultRecoveryPolicy, recoveryFamilyConfig, type RecoveryAttempt, type RecoveryPolicy } from '../domain/commitment/recovery-policy';
import { emptyExecutionTiming, normalizeFailureFamily } from '../domain/commitment/telemetry';
import { compileStepProgram } from '../domain/commitment/program';
import { RuntimeError } from '../domain/kernel/errors';
import {
  advanceScenarioRunState,
  inferTransitionObservations,
  type ScenarioRunState,
} from '../domain/aggregates/runtime-scenario-run';
import { evaluateExecutionBudgetHandoff } from '../domain/scenario/policies/execution-budget-handoff';
import { buildRecoveryStrategyEnvelope } from '../domain/scenario/policies/recovery-envelope';
import { decideSemanticAccrual } from '../domain/scenario/policies/semantic-accrual';
import type { ExecutionDiagnostic, StepExecutionReceipt } from '../domain/execution/types';
import type { ResolutionTarget } from '../domain/governance/workflow-types';
import type { ScenarioStep } from '../domain/intent/types';
import type { InterfaceResolutionContext } from '../domain/knowledge/types';
import type {
  GroundedStep,
} from '../domain/resolution/types';
import { runStaticInterpreter } from './interpreters/execute';
import { playwrightStepProgramInterpreter } from './execute/program';
import { deterministicRuntimeStepAgent } from './resolution/agent';
import { applyProposalDraftsToRuntimeContext } from './resolution/proposals';
import { observeStateRefsOnPage, observeTransitionOnPage } from '../instruments/observation/state-topology';
import { planExecutionStep } from '../domain/resolution/execution-planner';


// ─── Carved-out sub-module — Step 4a ──────────────────────────
//
// The scenario-environment types and the handshake helpers live
// at ./scenario/environment.ts. Re-exported here so existing
// callers that import from product/runtime/scenario.ts keep
// working.
export type {
  RuntimeScenarioEnvironment,
  ScenarioRunState,
  ScenarioStepRunResult,
  ScenarioStepHandshake,
} from './scenario/environment';
export {
  stepHandshakeFromPlan,
  createScenarioRunState,
} from './scenario/environment';
import {
  executionDiagnosticsFromError,
  type RuntimeScenarioEnvironment,
  type ScenarioStepRunResult,
  type ScenarioStepHandshake,
} from './scenario/environment';


// ─── Carved-out sub-module — Step 4a (round 2) ────────────────
//
// Route selection helpers live at ./scenario/route.ts.
import {
  activeRouteVariantRefs,
  relevantStateRefs,
  selectRouteForNavigate,
} from './scenario/route';
import {
  recoveryDiagnostics,
  recoveryAttemptResult,
  wait,
} from './scenario/recovery';


function resolvedScenarioStep(task: GroundedStep, target: ResolutionTarget, confidence: ScenarioStep['confidence']): ScenarioStep {
  return {
    index: task.index,
    intent: task.intent,
    action_text: task.actionText,
    expected_text: task.expectedText,
    action: target.action,
    screen: target.screen,
    element: target.element ?? null,
    posture: target.posture ?? null,
    override: target.override ?? null,
    snapshot_template: target.snapshot_template ?? null,
    resolution: target,
    confidence,
  };
}


async function executeRecoveryAttempts(input: {
  family: StepExecutionReceipt['failure']['family'];
  policy: RecoveryPolicy;
  preconditionFailures: readonly string[];
  diagnostics: readonly ExecutionDiagnostic[];
  degraded: boolean;
}): Promise<{ policyProfile: string; attempts: RecoveryAttempt[]; recovered: boolean }> {
  const config = recoveryFamilyConfig(input.policy, input.family);
  if (!config) {
    return { policyProfile: input.policy.profile, attempts: [], recovered: false };
  }

  const enabledStrategies = config.strategies.flatMap((entry) => entry.enabled ? [entry] : []);
  const tryStrategy = async (
    remainingStrategies: readonly typeof enabledStrategies[number][],
    priorAttempts: readonly RecoveryAttempt[],
  ): Promise<{ policyProfile: string; attempts: RecoveryAttempt[]; recovered: boolean }> => {
    if (remainingStrategies.length === 0) {
      return { policyProfile: input.policy.profile, attempts: [...priorAttempts], recovered: false };
    }
    const [head, ...restStrategies] = remainingStrategies;
    const strategy = head!;
    const maxAttempts = Math.max(1, strategy.maxAttempts ?? 1);
    const tryAttempt = async (
      attempt: number,
      accumulated: readonly RecoveryAttempt[],
    ): Promise<{ policyProfile: string; attempts: RecoveryAttempt[]; recovered: boolean }> => {
      if (attempt > maxAttempts || accumulated.length >= config.budget.maxAttempts) {
        return tryStrategy(restStrategies, accumulated);
      }
      const started = Date.now();
      const startedAt = new Date(started).toISOString();
      const result = recoveryAttemptResult(strategy, input);
      const durationMs = Math.max(0, Date.now() - started);
      const updated = [...accumulated, {
        strategyId: strategy.id,
        family: input.family as Exclude<StepExecutionReceipt['failure']['family'], 'none'>,
        attempt,
        startedAt,
        durationMs,
        result,
        diagnostics: recoveryDiagnostics(strategy, input),
      }];
      if (result === 'recovered') {
        return { policyProfile: input.policy.profile, attempts: updated, recovered: true };
      }
      const backoff = strategy.backoffMs ?? config.budget.backoffMs;
      if (backoff > 0) {
        await wait(backoff);
      }
      return tryAttempt(attempt + 1, updated);
    };
    return tryAttempt(1, priorAttempts);
  };
  return tryStrategy(enabledStrategies, []);
}


export async function runScenarioStep(
  task: GroundedStep,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: { adoId: AdoId; artifactPath?: string | undefined; revision?: number | undefined; contentHash?: string | undefined },
  interfaceResolutionContext?: InterfaceResolutionContext | undefined,
): Promise<ScenarioStepRunResult> {
  let runState = state;
  const startedAt = Date.now();
  const runAt = new Date().toISOString();
  const agent = environment.agent ?? deterministicRuntimeStepAgent;
  if (!interfaceResolutionContext) {
    throw new RuntimeError('runtime-missing-resolution-context', `Missing interface resolution context for step ${task.index}`);
  }

  const agentContext = {
    resolutionContext: interfaceResolutionContext,
    domResolver: environment.domResolver,
    previousResolution: runState.previousResolution,
    observedStateSession: runState.observedStateSession,
    provider: environment.provider,
    mode: environment.mode,
    runAt,
    translate: environment.translator,
    agentInterpreter: environment.agentInterpreter,
    controlSelection: environment.controlSelection,
    semanticDictionary: environment.semanticDictionary,
  };
  const outcome = await agent.resolve(task, agentContext);
  const interpretation = outcome.receipt;
  runState = {
    ...runState,
    observedStateSession: agentContext.observedStateSession ?? runState.observedStateSession,
  };
  const routeSelection = interpretation.kind === 'needs-human'
    ? {
      selectedRouteVariantRef: null,
      selectedRouteUrl: null,
      semanticDestination: null,
      fallbackRoutePath: [] as readonly string[],
      rationale: null,
      preNavigationRequested: false,
    }
    : selectRouteForNavigate({
      context: interfaceResolutionContext,
      task,
      interpretation,
    });

  if (interpretation.kind === 'needs-human') {
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
          artifact: asFingerprint('artifact', task.taskFingerprint),
          content: asFingerprint('content', context?.contentHash ?? ''),
          knowledge: asFingerprint('knowledge', agentContext.resolutionContext.knowledgeFingerprint),
          controls: null,
          surface: asFingerprint('surface', task.taskFingerprint),
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution', 'execution'],
        },
        governance: 'review-required' as const,
        stepIndex: task.index,
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: agentContext.resolutionContext.knowledgeFingerprint,
        runAt,
        mode: environment.mode,
        widgetContract: null,
        locatorStrategy: null,
        locatorRung: null,
        degraded: false,
        preconditionFailures: [],
        requiredStateRefs: task.grounding.requiredStateRefs,
        forbiddenStateRefs: task.grounding.forbiddenStateRefs,
        eventSignatureRefs: task.grounding.eventSignatureRefs,
        expectedTransitionRefs: task.grounding.expectedTransitionRefs,
        observedStateRefs: [],
        transitionObservations: [],
        durationMs: 0,
        timing: {
          ...emptyExecutionTiming(),
          totalMs: 0,
        },
        cost: {
          instructionCount: 0,
          diagnosticCount: 1,
        },
        budget: evaluateExecutionBudgetHandoff({
          timing: {
            ...emptyExecutionTiming(),
            totalMs: 0,
          },
          cost: {
            instructionCount: 0,
            diagnosticCount: 1,
          },
          thresholds: environment.executionBudgetThresholds,
        }),
        failure: normalizeFailureFamily({
          status: 'skipped',
          degraded: false,
          diagnostics: executionDiagnosticsFromError('needs-human', interpretation.reason),
        }),
        recovery: {
          policyProfile: (environment.recoveryPolicy ?? defaultRecoveryPolicy).profile,
          attempts: [],
        },
        handshakes: ['preparation', 'resolution', 'execution'],
        execution: {
          status: 'skipped',
          observedEffects: [],
          diagnostics: executionDiagnosticsFromError('needs-human', interpretation.reason),
        },
      },
    };
  }

  const observedRelevantStateRefs = relevantStateRefs(task);
  const activeVariants = activeRouteVariantRefs(runState, task);
  const beforeObservedStateRefs = environment.page && interfaceResolutionContext.stateGraph
    ? (await observeStateRefsOnPage({
        page: environment.page,
        context: interfaceResolutionContext,
        stateRefs: observedRelevantStateRefs,
        activeRouteVariantRefs: activeVariants,
      }))
        .flatMap((entry) => entry.observed ? [entry.stateRef] : [])
    : runState.observedStateSession.activeStateRefs.filter((ref) => observedRelevantStateRefs.includes(ref));
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
          artifact: asFingerprint('artifact', task.taskFingerprint),
          content: asFingerprint('content', context?.contentHash ?? ''),
          knowledge: asFingerprint('knowledge', interfaceResolutionContext.knowledgeFingerprint),
          controls: null,
          surface: asFingerprint('surface', task.taskFingerprint),
          run: null,
        },
        lineage: {
          sources: [],
          parents: [task.taskFingerprint],
          handshakes: ['preparation', 'resolution', 'execution'],
        },
        governance: 'review-required' as const,
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
        budget: evaluateExecutionBudgetHandoff({
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

  runState = {
    ...runState,
    previousResolution: interpretation.target,
  };
  const resolvedStep = resolvedScenarioStep(task, interpretation.target, interpretation.confidence);
  const program = compileStepProgram(resolvedStep);
  const diagnosticContext = context
    ? {
        adoId: context.adoId,
        stepIndex: task.index,
        artifactPath: context.artifactPath,
        provenance: {
          sourceRevision: context.revision,
          contentHash: context.contentHash,
        },
      }
    : undefined;
  // Console sentinel: capture browser console errors/warnings during step execution.
  const consoleSentinel = environment.mode === 'playwright' && environment.page
    ? attachConsoleSentinel(environment.page as Page)
    : null;

  if (
    environment.mode === 'playwright'
    && environment.page
    && interpretation.target.action !== 'navigate'
    && routeSelection.preNavigationRequested
    && routeSelection.selectedRouteUrl
  ) {
    await performNavigation(environment.page, routeSelection.selectedRouteUrl);
  }

  const result = environment.mode === 'playwright'
    ? await playwrightStepProgramInterpreter.run(program, {
        page: environment.page as Page,
        screens: (() => {
          if (interpretation.target.action !== 'navigate' || !routeSelection.selectedRouteUrl) {
            return environment.screens as never;
          }
          const current = environment.screens[interpretation.target.screen];
          if (!current) {
            return environment.screens as never;
          }
          return {
            ...environment.screens,
            [interpretation.target.screen]: {
              ...current,
              screen: {
                ...current.screen,
                url: routeSelection.selectedRouteUrl,
              },
            },
          } as never;
        })(),
        fixtures: environment.fixtures,
        snapshotLoader: environment.snapshotLoader,
      }, diagnosticContext)
    : await runStaticInterpreter(
        environment.mode,
        program,
        interpretation.target.action === 'navigate' && routeSelection.selectedRouteUrl
          ? {
            ...environment.screens,
            [interpretation.target.screen]: {
              ...environment.screens[interpretation.target.screen]!,
              screen: {
                ...environment.screens[interpretation.target.screen]!.screen,
                url: routeSelection.selectedRouteUrl,
              },
            },
          }
          : environment.screens,
        environment.fixtures,
        diagnosticContext,
        environment.snapshotLoader,
      );

  const consoleMessages = consoleSentinel?.detach() ?? [];

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
    : await executeRecoveryAttempts(
      buildRecoveryStrategyEnvelope({
        family: failure.family,
        policy: environment.recoveryPolicy ?? defaultRecoveryPolicy,
        preconditionFailures,
        diagnostics,
        degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
      }),
    );
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
    runState = advanceScenarioRunState({
      state: runState,
      task,
      interpretation,
      observedStateRefs: observedStateRefs.length > 0 ? observedStateRefs : task.grounding.resultStateRefs,
      transitionRefs: matchedTransitionRefs,
    });
  }
  state.previousResolution = runState.previousResolution;
  state.observedStateSession = runState.observedStateSession;

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
      artifact: asFingerprint('artifact', task.taskFingerprint),
      content: asFingerprint('content', context?.contentHash ?? ''),
      knowledge: asFingerprint('knowledge', agentContext.resolutionContext.knowledgeFingerprint),
      controls: null,
      surface: asFingerprint('surface', task.taskFingerprint),
      run: null,
    },
    lineage: {
      sources: [],
      parents: [task.taskFingerprint],
      handshakes: ['preparation', 'resolution', 'execution'],
    },
    governance: result.ok || recovery.recovered ? 'approved' : 'review-required',
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
    budget: evaluateExecutionBudgetHandoff({
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

  const semanticDecision = decideSemanticAccrual({
    interpretation,
    executionStatus: execution.execution.status,
    semanticAccrual: outcome.semanticAccrual,
    semanticDictionaryHitId: outcome.semanticDictionaryHitId,
  });

  return {
    interpretation,
    execution,
    semanticAccrual: semanticDecision.semanticAccrual,
    semanticDictionaryHitId: semanticDecision.semanticDictionaryHitId,
  };
}

export async function runScenarioHandshake(
  handshake: ScenarioStepHandshake,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: { adoId: AdoId; artifactPath?: string | undefined; revision?: number | undefined; contentHash?: string | undefined },
): Promise<ScenarioStepRunResult> {
  return runScenarioStep(handshake.task, environment, state, context, handshake.resolutionContext);
}

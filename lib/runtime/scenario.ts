import type { Page } from '@playwright/test';
import { attachConsoleSentinel } from './console-sentinel';
import { uniqueSorted } from '../domain/collections';
import type { AdoId, StateNodeRef, TransitionRef } from '../domain/identity';
import type { ExecutionBudgetThresholds } from '../domain/execution/telemetry';
import { defaultRecoveryPolicy, recoveryFamilyConfig, type RecoveryAttempt, type RecoveryPolicy, type RecoveryStrategy } from '../domain/execution/recovery-policy';
import { emptyExecutionTiming, evaluateExecutionBudget, normalizeFailureFamily } from '../domain/execution/telemetry';
import { compileStepProgram } from '../domain/program';
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
import { runStaticInterpreter } from './interpreters/execute';
import type { InterpreterMode, InterpreterScreenRegistry } from './interpreters/types';
import { playwrightStepProgramInterpreter } from './program';
import { deterministicRuntimeStepAgent, type RuntimeStepAgent } from './agent';
import { applyProposalDraftsToRuntimeContext } from './agent/proposals';
import type { RuntimeDomResolver } from '../domain/types';
import { observeStateRefsOnPage, observeTransitionOnPage } from '../playwright/state-topology';

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
  agentInterpreter?: import('../application/agent-interpreter-provider').AgentInterpreterProvider | undefined;
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface ScenarioRunState {
  previousResolution: ResolutionTarget | null;
  observedStateSession: ObservedStateSession;
}

export interface ScenarioStepRunResult {
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
}

export interface ScenarioStepHandshake {
  task: GroundedStep;
  resolutionContext: InterfaceResolutionContext;
  directive?: unknown;
}

export function stepHandshakeFromPlan(plan: ScenarioRunPlan, zeroBasedIndex: number): ScenarioStepHandshake {
  const step = plan.steps[zeroBasedIndex] ?? null;
  if (!step) {
    throw new RuntimeError('runtime-missing-run-plan-step', `Missing run plan step ${zeroBasedIndex + 1} for ${plan.adoId}`);
  }
  return {
    task: step,
    directive: undefined,
    resolutionContext: plan.resolutionContext,
  };
}

export function createScenarioRunState(): ScenarioRunState {
  return {
    previousResolution: null,
    observedStateSession: {
      currentScreen: null,
      activeStateRefs: [],
      lastObservedTransitionRefs: [],
      activeRouteVariantRefs: [],
      activeTargetRefs: [],
      lastSuccessfulLocatorRung: null,
      recentAssertions: [],
      causalLinks: [],
      lineage: [],
    },
  };
}

function executionDiagnosticsFromError(code: string, message: string, context?: Record<string, string>): ExecutionDiagnostic[] {
  return [{ code, message, context }];
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

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

function recoveryDiagnostics(strategy: RecoveryStrategy, input: {
  preconditionFailures: readonly string[];
  diagnostics: readonly ExecutionDiagnostic[];
  degraded: boolean;
}): string[] {
  const base = strategy.diagnostics ?? [];
  if (strategy.id === 'verify-prerequisites') {
    return [...base, ...input.preconditionFailures.map((entry) => `precondition:${entry}`)].slice(0, 5);
  }
  if (strategy.id === 'force-alternate-locator-rungs' || strategy.id === 'snapshot-guided-reresolution') {
    return [...base, input.degraded ? 'degraded-locator-observed' : 'no-degraded-locator-observed'];
  }
  return [...base, ...input.diagnostics.map((entry) => `${entry.code}:${entry.message}`).slice(0, 3)];
}

function recoveryAttemptResult(strategy: RecoveryStrategy, input: {
  preconditionFailures: readonly string[];
  diagnostics: readonly ExecutionDiagnostic[];
  degraded: boolean;
}): RecoveryAttempt['result'] {
  if (strategy.id === 'verify-prerequisites') {
    return input.preconditionFailures.length === 0 ? 'recovered' : 'failed';
  }
  if (strategy.id === 'execute-prerequisite-actions') {
    return input.preconditionFailures.length > 0 ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'force-alternate-locator-rungs' || strategy.id === 'snapshot-guided-reresolution') {
    return input.degraded ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'bounded-retry-with-backoff') {
    return input.diagnostics.length > 0 ? 'recovered' : 'skipped';
  }
  if (strategy.id === 'refresh-runtime') {
    return input.diagnostics.length > 0 ? 'recovered' : 'skipped';
  }
  return 'failed';
}

function parseRoleNameLocator(locatorStrategy?: string | null): { role: string | null; name: string | null } {
  if (!locatorStrategy || !locatorStrategy.startsWith('role:')) {
    return { role: null, name: null };
  }
  const roleMatch = /^role:([^\[]+)/.exec(locatorStrategy);
  const nameMatch = /\[name=(.+)\]$/.exec(locatorStrategy);
  return {
    role: roleMatch?.[1]?.trim() ?? null,
    name: nameMatch?.[1]?.trim() ?? null,
  };
}

function normalizeSemanticLabel(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function semanticConsistencySignals(input: {
  task: GroundedStep;
  interpretation: ResolutionReceipt;
  interfaceResolutionContext: InterfaceResolutionContext;
  locatorStrategy?: string | null;
  transitionObservations: readonly TransitionObservation[];
}): StepExecutionReceipt['semanticConsistency'] {
  const resolvedTarget = input.interpretation.kind === 'needs-human' ? null : input.interpretation.target;
  const elementCandidate = resolvedTarget?.element
    ? input.interfaceResolutionContext.screens
      .find((screen) => screen.screen === resolvedTarget.screen)
      ?.elements.find((element) => element.element === resolvedTarget.element)
    : null;
  const parsedLocator = parseRoleNameLocator(input.locatorStrategy ?? null);
  const labelRoleMismatch = Boolean(
    elementCandidate?.role
    && parsedLocator.role
    && normalizeSemanticLabel(elementCandidate.role) !== normalizeSemanticLabel(parsedLocator.role),
  );
  const accessibleNameSemanticsChanged = Boolean(
    elementCandidate?.name
    && parsedLocator.name
    && normalizeSemanticLabel(elementCandidate.name) !== normalizeSemanticLabel(parsedLocator.name),
  );
  const unexpectedStateTransitionEffects = input.transitionObservations.some((entry) => entry.classification === 'unexpected-effects');
  const assertionTargetAmbiguity = input.transitionObservations.some((entry) => entry.classification === 'ambiguous-match')
    || (input.task.grounding.effectAssertions.length > 0
      && input.transitionObservations.filter((entry) => entry.classification === 'matched').length > 1);
  const signals = uniqueSorted([
    ...(labelRoleMismatch ? ['label-role-mismatch' as const] : []),
    ...(accessibleNameSemanticsChanged ? ['accessible-name-semantics-changed' as const] : []),
    ...(unexpectedStateTransitionEffects ? ['unexpected-state-transition-effects' as const] : []),
    ...(assertionTargetAmbiguity ? ['assertion-target-ambiguity' as const] : []),
  ]);
  return {
    labelRoleMismatch,
    accessibleNameSemanticsChanged,
    unexpectedStateTransitionEffects,
    assertionTargetAmbiguity,
    signals,
  };
}

export async function runScenarioStep(
  task: GroundedStep,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: { adoId: AdoId; artifactPath?: string | undefined; revision?: number | undefined; contentHash?: string | undefined },
  interfaceResolutionContext?: InterfaceResolutionContext | undefined,
): Promise<ScenarioStepRunResult> {
  const startedAt = Date.now();
  const runAt = new Date().toISOString();
  const agent = environment.agent ?? deterministicRuntimeStepAgent;
  if (!interfaceResolutionContext) {
    throw new RuntimeError('runtime-missing-resolution-context', `Missing interface resolution context for step ${task.index}`);
  }

  const agentContext = {
    resolutionContext: interfaceResolutionContext,
    domResolver: environment.domResolver,
    previousResolution: state.previousResolution,
    observedStateSession: state.observedStateSession,
    provider: environment.provider,
    mode: environment.mode,
    runAt,
    translate: environment.translator,
    agentInterpreter: environment.agentInterpreter,
    controlSelection: environment.controlSelection,
  };
  const interpretation = await agent.resolve(task, agentContext);
  state.observedStateSession = agentContext.observedStateSession ?? state.observedStateSession;

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
        governance: mintBlocked(),
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
        semanticConsistency: {
          labelRoleMismatch: false,
          accessibleNameSemanticsChanged: false,
          unexpectedStateTransitionEffects: false,
          assertionTargetAmbiguity: false,
          signals: [],
        },
        durationMs: 0,
        timing: {
          ...emptyExecutionTiming(),
          totalMs: 0,
        },
        cost: {
          instructionCount: 0,
          diagnosticCount: 1,
        },
        budget: evaluateExecutionBudget({
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
  const beforeSet = new Set(beforeObservedStateRefs);
  const skipStatePreconditions = interpretation.target.action === 'navigate';
  const missingRequiredStates = skipStatePreconditions
    ? []
    : task.grounding.requiredStateRefs.filter((ref) => !beforeSet.has(ref));
  const forbiddenActiveStates = skipStatePreconditions
    ? []
    : task.grounding.forbiddenStateRefs.filter((ref) => beforeSet.has(ref));
  if (missingRequiredStates.length > 0 || forbiddenActiveStates.length > 0) {
    const diagnostics = executionDiagnosticsFromError(
      'runtime-state-precondition-failed',
      `State preconditions failed for step ${task.index}`,
      {
        missingRequiredStates: missingRequiredStates.join(','),
        forbiddenActiveStates: forbiddenActiveStates.join(','),
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
        requiredStateRefs: task.grounding.requiredStateRefs,
        forbiddenStateRefs: task.grounding.forbiddenStateRefs,
        eventSignatureRefs: task.grounding.eventSignatureRefs,
        expectedTransitionRefs: task.grounding.expectedTransitionRefs,
        observedStateRefs: beforeObservedStateRefs,
        transitionObservations: [],
        semanticConsistency: {
          labelRoleMismatch: false,
          accessibleNameSemanticsChanged: false,
          unexpectedStateTransitionEffects: false,
          assertionTargetAmbiguity: false,
          signals: [],
        },
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

  const result = environment.mode === 'playwright'
    ? await playwrightStepProgramInterpreter.run(program, {
        page: environment.page as Page,
        screens: environment.screens as never,
        fixtures: environment.fixtures,
        snapshotLoader: environment.snapshotLoader,
      }, diagnosticContext)
    : await runStaticInterpreter(
        environment.mode,
        program,
        environment.screens,
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
    : await executeRecoveryAttempts({
      family: failure.family,
      policy: environment.recoveryPolicy ?? defaultRecoveryPolicy,
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
    requiredStateRefs: task.grounding.requiredStateRefs,
    forbiddenStateRefs: task.grounding.forbiddenStateRefs,
    effectAssertions: task.grounding.effectAssertions,
    eventSignatureRefs: task.grounding.eventSignatureRefs,
    expectedTransitionRefs: task.grounding.expectedTransitionRefs,
    observedStateRefs,
    transitionObservations,
    semanticConsistency: semanticConsistencySignals({
      task,
      interpretation,
      interfaceResolutionContext,
      locatorStrategy: firstOutcome?.locatorStrategy ?? null,
      transitionObservations,
    }),
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
  context?: { adoId: AdoId; artifactPath?: string | undefined; revision?: number | undefined; contentHash?: string | undefined },
): Promise<ScenarioStepRunResult> {
  return runScenarioStep(handshake.task, environment, state, context, handshake.resolutionContext);
}

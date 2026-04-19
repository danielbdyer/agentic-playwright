import type { Page } from '@playwright/test';
import { navigationOptionsForUrl } from './adapters/navigation-strategy';
import { attachConsoleSentinel } from './observe/console-sentinel';
import { asFingerprint } from '../domain/kernel/hash';
import { uniqueSorted } from '../domain/kernel/collections';
import { rankRouteVariants } from '../domain/knowledge/route-knowledge';
import { chooseByPrecedence, routeSelectionPrecedenceLaw } from '../domain/resolution/precedence';
import type { AdoId, StateNodeRef, TransitionRef } from '../domain/kernel/identity';
import type { ExecutionBudgetThresholds } from '../domain/commitment/telemetry';
import { defaultRecoveryPolicy, recoveryFamilyConfig, type RecoveryAttempt, type RecoveryPolicy, type RecoveryStrategy } from '../domain/commitment/recovery-policy';
import { emptyExecutionTiming, normalizeFailureFamily } from '../domain/commitment/telemetry';
import { compileStepProgram } from '../domain/commitment/program';
import type { SnapshotTemplateLoader } from '../domain/commitment/runtime-loaders';
import { RuntimeError } from '../domain/kernel/errors';
import {
  advanceScenarioRunState,
  createScenarioRunState as createScenarioRunStateAggregate,
  inferTransitionObservations,
  type ScenarioRunState,
} from '../domain/aggregates/runtime-scenario-run';
import { evaluateExecutionBudgetHandoff } from '../domain/scenario/policies/execution-budget-handoff';
import { buildRecoveryStrategyEnvelope } from '../domain/scenario/policies/recovery-envelope';
import { decideSemanticAccrual } from '../domain/scenario/policies/semantic-accrual';
import type { ExecutionDiagnostic, StepExecutionReceipt } from '../domain/execution/types';
import type { ExecutionPosture, ResolutionTarget } from '../domain/governance/workflow-types';
import type { ScenarioStep } from '../domain/intent/types';
import type { SemanticDictionaryAccrualInput } from '../domain/knowledge/semantic-dictionary-types';
import type { InterfaceResolutionContext } from '../domain/knowledge/types';
import type {
  GroundedStep,
  ResolutionReceipt,
  ScenarioRunPlan,
  TranslationReceipt,
  TranslationRequest,
} from '../domain/resolution/types';
import type { TransitionObservation } from '../domain/target/interface-graph';
import type { RouteVariantKnowledge } from '../domain/knowledge/route-knowledge-types';
import { runStaticInterpreter } from './interpreters/execute';
import type { InterpreterMode, InterpreterScreenRegistry } from './interpreters/types';
import { playwrightStepProgramInterpreter } from './execute/program';
import { deterministicRuntimeStepAgent, type RuntimeStepAgent, type ResolutionStepOutcome } from './resolution/agent';
import { applyProposalDraftsToRuntimeContext } from './resolution/proposals';
import type { RuntimeAgentInterpreter } from './resolution/types';
import type { RuntimeDomResolver } from '../domain/resolution/types';
import { observeStateRefsOnPage, observeTransitionOnPage } from '../playwright/state-topology';
import { planExecutionStep } from '../domain/resolution/execution-planner';

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
  agentInterpreter?: RuntimeAgentInterpreter | undefined;
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
  /** Semantic dictionary catalog, loaded once per run and injected for all steps. */
  semanticDictionary?: import('../domain/knowledge/semantic-dictionary-types').SemanticDictionaryCatalog | undefined;
}

export type { ScenarioRunState };

export interface ScenarioStepRunResult {
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
  /** Semantic dictionary learning signal: accrual input when a later rung resolved. */
  semanticAccrual?: SemanticDictionaryAccrualInput | null | undefined;
  /** Entry ID of the dictionary entry that was used, for success/failure tracking. */
  semanticDictionaryHitId?: string | null | undefined;
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

export const createScenarioRunState = createScenarioRunStateAggregate;

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

interface RouteSelection {
  readonly selectedRouteVariantRef: string | null;
  readonly selectedRouteUrl: string | null;
  readonly semanticDestination: string | null;
  readonly fallbackRoutePath: readonly string[];
  readonly rationale: string | null;
  readonly preNavigationRequested: boolean;
}

function normalizeStateRecord(value: Readonly<Record<string, string>> | null | undefined): Readonly<Record<string, string>> {
  return Object.entries(value ?? {})
    .map(([key, entry]) => [key.trim().toLowerCase(), entry.trim().toLowerCase()] as const)
    .filter(([key, entry]) => key.length > 0 && entry.length > 0)
    .sort((left, right) => left[0].localeCompare(right[0]) || left[1].localeCompare(right[1]))
    .reduce<Readonly<Record<string, string>>>((acc, [key, entry]) => ({ ...acc, [key]: entry }), {});
}

function variantStateMatchScore(
  variant: RouteVariantKnowledge & { state?: Readonly<Record<string, string>> | undefined; tab?: string | null | undefined; hash?: string | null | undefined; query?: Readonly<Record<string, string>> | undefined },
  requestedState: Readonly<Record<string, string>>,
): number {
  const requestedEntries = Object.entries(requestedState);
  if (requestedEntries.length === 0) {
    return 0;
  }
  const variantState = normalizeStateRecord(variant.state ?? {});
  const matched = requestedEntries.filter(([key, value]) =>
    variantState[key] === value
    || (key === 'tab' && ((variant.tab ?? '').toLowerCase() === value))
    || (key === 'hash' && ((variant.hash ?? '').replace(/^#/, '').toLowerCase() === value.replace(/^#/, '').toLowerCase()))
    || ((variant.query ?? {})[key]?.toLowerCase() === value),
  ).length;
  return Number((matched / requestedEntries.length).toFixed(3));
}

function routeVariantsForScreen(
  context: InterfaceResolutionContext,
  screen: string,
): readonly RouteVariantKnowledge[] {
  const screenEntry = context.screens.find((candidate) => candidate.screen === screen);
  return (screenEntry?.routeVariants ?? []).map((variant) => ({
    routeVariantRef: variant.routeVariantRef,
    screenId: screen,
    url: variant.url,
    urlPattern: variant.urlPattern ?? variant.url,
    dimensions: variant.dimensions ?? [],
    expectedEntryStateRefs: variant.expectedEntryStateRefs ?? [],
    historicalSuccess: {
      successCount: variant.historicalSuccess?.successCount ?? 0,
      failureCount: variant.historicalSuccess?.failureCount ?? 0,
      lastSuccessAt: variant.historicalSuccess?.lastSuccessAt ?? null,
    },
    state: variant.state ?? {},
    tab: variant.tab ?? null,
    hash: variant.hash ?? null,
    query: variant.query ?? {},
  }));
}

function selectRouteForNavigate(input: {
  context: InterfaceResolutionContext;
  task: GroundedStep;
  interpretation: Exclude<ResolutionReceipt, { kind: 'needs-human' }>;
}): RouteSelection {
  const requestedRouteState = normalizeStateRecord(input.interpretation.target.routeState ?? null);
  if (input.interpretation.target.action !== 'navigate' && Object.keys(requestedRouteState).length === 0) {
    return {
      selectedRouteVariantRef: null,
      selectedRouteUrl: null,
      semanticDestination: null,
      fallbackRoutePath: [],
      rationale: null,
      preNavigationRequested: false,
    };
  }
  const semanticDestination = input.interpretation.target.semanticDestination
    ?? `${input.task.normalizedIntent} ${input.task.actionText}`.trim();
  const rankedBase = rankRouteVariants(
    routeVariantsForScreen(input.context, input.interpretation.target.screen),
    {
      screenId: input.interpretation.target.screen,
      semanticDestination,
      expectedEntryStateRefs: input.task.grounding.resultStateRefs,
    },
  );
  const ranked = rankedBase
    .map((entry) => ({
      ...entry,
      routeStateScore: variantStateMatchScore(entry.variant, requestedRouteState),
      score: Number((entry.score + variantStateMatchScore(entry.variant, requestedRouteState) * 8).toFixed(3)),
    }))
    .sort((left, right) => right.score - left.score || left.variant.routeVariantRef.localeCompare(right.variant.routeVariantRef));
  const selected = ranked[0] ?? null;
  const explicitVariant = ranked.find((entry) => entry.variant.routeVariantRef === input.interpretation.target.routeVariantRef) ?? null;
  const selectedRouteUrl = chooseByPrecedence(
    [
      { rung: 'explicit-url' as const, value: explicitVariant?.variant.url ?? null },
      { rung: 'runbook-binding' as const, value: null },
      { rung: 'route-knowledge' as const, value: selected?.variant.url ?? null },
      { rung: 'screen-default' as const, value: null },
    ],
    routeSelectionPrecedenceLaw,
  );
  const selectedRouteVariantRef = selectedRouteUrl === explicitVariant?.variant.url
    ? explicitVariant?.variant.routeVariantRef ?? null
    : (selected?.variant.routeVariantRef ?? input.interpretation.target.routeVariantRef ?? null);
  return {
    selectedRouteVariantRef,
    selectedRouteUrl,
    semanticDestination,
    fallbackRoutePath: ranked.slice(1, 4).map((entry) => entry.variant.routeVariantRef),
    rationale: selected ? `${selected.rationale}, routeState=${selected.routeStateScore.toFixed(3)}` : null,
    preNavigationRequested: Object.keys(requestedRouteState).length > 0,
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
    const navOpts = navigationOptionsForUrl(routeSelection.selectedRouteUrl);
    await environment.page.goto(routeSelection.selectedRouteUrl, {
      waitUntil: navOpts.waitUntil,
      timeout: navOpts.timeout,
    });
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

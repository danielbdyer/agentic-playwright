import type { Page } from '@playwright/test';
import type { AdoId } from '../domain/identity';
import type { ExecutionBudgetThresholds } from '../domain/execution/telemetry';
import { defaultRecoveryPolicy, recoveryFamilyConfig, type RecoveryAttempt, type RecoveryPolicy, type RecoveryStrategy } from '../domain/execution/recovery-policy';
import { emptyExecutionTiming, evaluateExecutionBudget, normalizeFailureFamily } from '../domain/execution/telemetry';
import { compileStepProgram } from '../domain/program';
import type { SnapshotTemplateLoader } from '../domain/runtime-loaders';
import type {
  ExecutionPosture,
  ExecutionDiagnostic,
  ResolutionReceipt,
  ResolutionTarget,
  ScenarioStep,
  StepExecutionReceipt,
  StepTask,
  RuntimeKnowledgeSession,
  TranslationRequest,
  TranslationReceipt,
} from '../domain/types';
import { runStaticInterpreter } from './interpreters/execute';
import type { InterpreterMode, InterpreterScreenRegistry } from './interpreters/types';
import type { RuntimeWorkingMemory } from './agent/types';
import { playwrightStepProgramInterpreter } from './program';
import { deterministicRuntimeStepAgent, type RuntimeStepAgent } from './agent';
import type { RuntimeDomResolver } from '../domain/types';

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
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
  recoveryPolicy?: RecoveryPolicy | undefined;
}

export interface ScenarioRunState {
  previousResolution: ResolutionTarget | null;
  runtimeWorkingMemory: RuntimeWorkingMemory;
}

export interface ScenarioStepRunResult {
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
}

export interface ScenarioStepHandshake {
  task: StepTask;
  runtimeKnowledgeSession?: RuntimeKnowledgeSession | undefined;
  directive?: unknown;
}

export function createScenarioRunState(): ScenarioRunState {
  return {
    previousResolution: null,
    runtimeWorkingMemory: {
      currentScreen: null,
      activeEntityKeys: [],
      openedPanels: [],
      openedModals: [],
      lastSuccessfulLocatorRung: null,
      recentAssertions: [],
      lineage: [],
    },
  };
}

function executionDiagnosticsFromError(code: string, message: string, context?: Record<string, string>): ExecutionDiagnostic[] {
  return [{ code, message, context }];
}

function resolvedScenarioStep(task: StepTask, target: ResolutionTarget, confidence: ScenarioStep['confidence']): ScenarioStep {
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

  const attempts: RecoveryAttempt[] = [];
  for (const strategy of config.strategies.filter((entry) => entry.enabled)) {
    const maxAttempts = Math.max(1, strategy.maxAttempts ?? 1);
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (attempts.length >= config.budget.maxAttempts) {
        break;
      }
      const started = Date.now();
      const startedAt = new Date(started).toISOString();
      const result = recoveryAttemptResult(strategy, input);
      const durationMs = Math.max(0, Date.now() - started);
      attempts.push({
        strategyId: strategy.id,
        family: input.family as Exclude<StepExecutionReceipt['failure']['family'], 'none'>,
        attempt,
        startedAt,
        durationMs,
        result,
        diagnostics: recoveryDiagnostics(strategy, input),
      });
      if (result === 'recovered') {
        return { policyProfile: input.policy.profile, attempts, recovered: true };
      }
      const backoff = strategy.backoffMs ?? config.budget.backoffMs;
      if (backoff > 0) {
        await wait(backoff);
      }
    }
  }

  return { policyProfile: input.policy.profile, attempts, recovered: false };
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
  task: StepTask,
  environment: RuntimeScenarioEnvironment,
  state: ScenarioRunState,
  context?: { adoId: AdoId; artifactPath?: string | undefined; revision?: number | undefined; contentHash?: string | undefined },
  runtimeKnowledgeSession?: RuntimeKnowledgeSession | undefined,
): Promise<ScenarioStepRunResult> {
  const startedAt = Date.now();
  const runAt = new Date().toISOString();
  const agent = environment.agent ?? deterministicRuntimeStepAgent;
  const runtimeKnowledge = task.runtimeKnowledge ?? runtimeKnowledgeSession;
  if (!runtimeKnowledge) {
    throw new Error(`Missing runtime knowledge for step ${task.index}`);
  }
  const resolvedTask = task.runtimeKnowledge ? task : { ...task, runtimeKnowledge };

  const resolutionContext = {
    domResolver: environment.domResolver,
    previousResolution: state.previousResolution,
    runtimeWorkingMemory: state.runtimeWorkingMemory,
    provider: environment.provider,
    mode: environment.mode,
    runAt,
    translate: environment.translator,
    controlSelection: environment.controlSelection,
  };
  const interpretation = await agent.resolve(resolvedTask, resolutionContext);
  state.runtimeWorkingMemory = resolutionContext.runtimeWorkingMemory ?? state.runtimeWorkingMemory;

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
          knowledge: runtimeKnowledge.knowledgeFingerprint,
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
        governance: 'blocked',
        stepIndex: task.index,
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: runtimeKnowledge.knowledgeFingerprint,
        runAt,
        mode: environment.mode,
        widgetContract: null,
        locatorStrategy: null,
        locatorRung: null,
        degraded: false,
        preconditionFailures: [],
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

  state.previousResolution = interpretation.target;
  const resolvedStep = resolvedScenarioStep(resolvedTask, interpretation.target, interpretation.confidence);
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

  const firstOutcome = result.value.outcomes[0];
  const diagnostics = result.ok
    ? []
    : result.diagnostic
      ? executionDiagnosticsFromError(result.diagnostic.code, result.diagnostic.message)
      : executionDiagnosticsFromError(result.error.code, result.error.message, result.error.context);
  const preconditionFailures = diagnostics
    .filter((diagnostic) => diagnostic.code === 'runtime-widget-precondition-failed')
    .map((diagnostic) => diagnostic.message);
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
      knowledge: runtimeKnowledge.knowledgeFingerprint,
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
    knowledgeFingerprint: runtimeKnowledge.knowledgeFingerprint,
    runAt,
    mode: environment.mode,
    widgetContract: firstOutcome?.widgetContract ?? null,
    locatorStrategy: firstOutcome?.locatorStrategy,
    locatorRung: firstOutcome?.locatorRung ?? null,
    degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
    preconditionFailures,
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
        }
      : recovery.recovered
        ? {
          status: 'ok',
          observedEffects: [...(firstOutcome?.observedEffects ?? []), 'recovery-succeeded'],
          diagnostics: [],
        }
        : {
          status: 'failed',
          observedEffects: firstOutcome?.observedEffects ?? [],
          diagnostics,
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
  runtimeKnowledgeSession?: RuntimeKnowledgeSession | undefined,
): Promise<ScenarioStepRunResult> {
  return runScenarioStep(handshake.task, environment, state, context, handshake.runtimeKnowledgeSession);
}

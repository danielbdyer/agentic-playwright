import type { Page } from '@playwright/test';
import type { AdoId } from '../domain/identity';
import type { ExecutionBudgetThresholds } from '../domain/execution/telemetry';
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
import { playwrightStepProgramInterpreter } from './program';
import { deterministicRuntimeStepAgent, type RuntimeStepAgent } from './agent';

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
  executionBudgetThresholds?: ExecutionBudgetThresholds | undefined;
}

export interface ScenarioRunState {
  previousResolution: ResolutionTarget | null;
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

  const interpretation = await agent.resolve(resolvedTask, {
    page: environment.page,
    previousResolution: state.previousResolution,
    provider: environment.provider,
    mode: environment.mode,
    runAt,
    translate: environment.translator,
    controlSelection: environment.controlSelection,
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
    governance: result.ok ? 'approved' : 'blocked',
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
    failure: normalizeFailureFamily({
      status: result.ok ? 'ok' : 'failed',
      degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
      diagnostics,
    }),
    handshakes: ['preparation', 'resolution', 'execution'],
    execution: result.ok
      ? {
          status: 'ok',
          observedEffects: firstOutcome?.observedEffects ?? [],
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

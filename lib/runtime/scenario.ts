import type { Page } from '@playwright/test';
import type { AdoId } from '../domain/identity';
import { compileStepProgram } from '../domain/program';
import type { SnapshotTemplateLoader } from '../domain/runtime-loaders';
import type {
  ExecutionDiagnostic,
  ResolutionReceipt,
  ResolutionTarget,
  ScenarioStep,
  StepExecutionReceipt,
  StepTask,
} from '../domain/types';
import { runStaticInterpreter } from './interpreters/execute';
import type { InterpreterMode, InterpreterScreenRegistry } from './interpreters/types';
import { playwrightStepProgramInterpreter } from './program';
import { deterministicRuntimeStepAgent, type RuntimeStepAgent } from './agent';

export interface RuntimeScenarioEnvironment {
  mode: InterpreterMode;
  provider: string;
  fixtures: Record<string, unknown>;
  screens: InterpreterScreenRegistry;
  snapshotLoader: SnapshotTemplateLoader;
  agent?: RuntimeStepAgent | undefined;
  page?: Page | undefined;
}

export interface ScenarioRunState {
  previousResolution: ResolutionTarget | null;
}

export interface ScenarioStepRunResult {
  interpretation: ResolutionReceipt;
  execution: StepExecutionReceipt;
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
): Promise<ScenarioStepRunResult> {
  const runAt = new Date().toISOString();
  const agent = environment.agent ?? deterministicRuntimeStepAgent;
  const interpretation = await agent.resolve(task, {
    page: environment.page,
    previousResolution: state.previousResolution,
    provider: environment.provider,
    mode: environment.mode,
    runAt,
  });

  if (interpretation.kind === 'needs-human') {
    return {
      interpretation,
      execution: {
        stepIndex: task.index,
        taskFingerprint: task.taskFingerprint,
        knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
        runAt,
        mode: environment.mode,
        locatorStrategy: null,
        degraded: false,
        execution: {
          status: 'skipped',
          observedEffects: [],
          diagnostics: executionDiagnosticsFromError('needs-human', interpretation.reason),
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
  const execution: StepExecutionReceipt = {
    stepIndex: task.index,
    taskFingerprint: task.taskFingerprint,
    knowledgeFingerprint: task.runtimeKnowledge.knowledgeFingerprint,
    runAt,
    mode: environment.mode,
    locatorStrategy: firstOutcome?.locatorStrategy,
    degraded: Boolean(firstOutcome?.observedEffects.includes('degraded-locator')),
    execution: result.ok
      ? {
          status: 'ok',
          observedEffects: firstOutcome?.observedEffects ?? [],
          diagnostics: [],
        }
      : {
          status: 'failed',
          observedEffects: firstOutcome?.observedEffects ?? [],
          diagnostics: result.diagnostic
            ? executionDiagnosticsFromError(result.diagnostic.code, result.diagnostic.message)
            : executionDiagnosticsFromError(result.error.code, result.error.message, result.error.context),
        },
  };

  return {
    interpretation,
    execution,
  };
}

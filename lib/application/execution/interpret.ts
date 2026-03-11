import { Effect } from 'effect';
import type { AdoId } from '../../domain/identity';
import type { ScenarioTaskPacket, StepTask } from '../../domain/types';
import type { RuntimeScenarioRunnerPort, RuntimeScenarioStepResult } from '../ports';
import { resolveRuntimeProvider } from '../provider-registry';
import { validateStepResults } from './validate-step-results';

export interface InterpretScenarioResult {
  stepResults: RuntimeScenarioStepResult[];
  interpretationOutput: {
    kind: 'scenario-interpretation-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; interpretation: RuntimeScenarioStepResult['interpretation'] }>;
  };
  executionOutput: {
    kind: 'scenario-execution-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; execution: RuntimeScenarioStepResult['execution'] }>;
  };
}

export function interpretScenarioTaskPacket(input: {
  runtimeScenarioRunner: RuntimeScenarioRunnerPort;
  rootDir: string;
  adoId: AdoId;
  runId: string;
  taskPacket: ScenarioTaskPacket;
  mode: 'dry-run' | 'diagnostic' | 'playwright';
  providerId: string;
  screenIds: readonly import('../../domain/identity').ScreenId[];
  fixtures: Record<string, unknown>;
  controlSelection?: {
    runbook?: string | null | undefined;
    dataset?: string | null | undefined;
    resolutionControl?: string | null | undefined;
  } | undefined;
  context?: {
    adoId: AdoId;
    artifactPath?: string | undefined;
    revision?: number | undefined;
    contentHash?: string | undefined;
  } | undefined;
  posture?: import('../../domain/types').ExecutionPosture | undefined;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
  steps?: readonly StepTask[] | undefined;
}) {
  return Effect.gen(function* () {
    const runtimeProvider = resolveRuntimeProvider({
      providerId: input.providerId,
      mode: input.mode,
      translationEnabled: !(input.translationOptions?.disableTranslation ?? false),
    });

    const stepResults = yield* input.runtimeScenarioRunner.runSteps({
      rootDir: input.rootDir,
      screenIds: input.screenIds,
      controlSelection: input.controlSelection,
      fixtures: input.fixtures,
      mode: input.mode,
      runtimeProvider,
      steps: input.steps ?? input.taskPacket.steps,
      runtimeKnowledgeSession: input.taskPacket.runtimeKnowledgeSession ?? input.taskPacket.payload.runtimeKnowledgeSession,
      posture: input.posture,
      context: input.context,
      translationOptions: input.translationOptions,
    });

    validateStepResults({ providerId: runtimeProvider.id, results: stepResults });

    return {
      stepResults,
      interpretationOutput: {
        kind: 'scenario-interpretation-record',
        adoId: input.adoId,
        runId: input.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.interpretation.stepIndex,
          interpretation: step.interpretation,
        })),
      },
      executionOutput: {
        kind: 'scenario-execution-record',
        adoId: input.adoId,
        runId: input.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.execution.stepIndex,
          execution: step.execution,
        })),
      },
    } satisfies InterpretScenarioResult;
  });
}

import { Effect } from 'effect';
import type { RuntimeScenarioRunnerPort } from '../ports';
import type { AdoId } from '../../domain/identity';
import type { RuntimeScenarioStepResult } from '../ports';
import type { SelectedRunContext } from './select-run-context';
import { resolveRuntimeProvider } from '../runtime-provider';
import { validateStepResults } from './validate-step-results';

export interface ExecuteStepsResult {
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

export function executeSteps(input: {
  runtimeScenarioRunner: RuntimeScenarioRunnerPort;
  rootDir: string;
  adoId: AdoId;
  selectedContext: SelectedRunContext;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
}) {
  return Effect.gen(function* () {
    const runtimeProvider = resolveRuntimeProvider({
      providerId: input.selectedContext.providerId,
      mode: input.selectedContext.mode,
      translationEnabled: !(input.translationOptions?.disableTranslation ?? false),
    });

    const stepResults = yield* input.runtimeScenarioRunner.runSteps({
      rootDir: input.rootDir,
      screenIds: input.selectedContext.screenIds,
      controlSelection: {
        runbook: input.selectedContext.activeRunbook?.name ?? null,
        dataset: input.selectedContext.activeDataset?.name ?? null,
        resolutionControl: input.selectedContext.activeRunbook?.resolutionControl ?? null,
      },
      fixtures: input.selectedContext.fixtures,
      mode: input.selectedContext.mode,
      runtimeProvider,
      steps: input.selectedContext.steps,
      posture: input.selectedContext.posture,
      context: input.selectedContext.context,
      translationOptions: input.translationOptions,
    });

    validateStepResults({ providerId: runtimeProvider.id, results: stepResults });

    return {
      stepResults,
      interpretationOutput: {
        kind: 'scenario-interpretation-record',
        adoId: input.adoId,
        runId: input.selectedContext.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.interpretation.stepIndex,
          interpretation: step.interpretation,
        })),
      },
      executionOutput: {
        kind: 'scenario-execution-record',
        adoId: input.adoId,
        runId: input.selectedContext.runId,
        steps: stepResults.map((step) => ({
          stepIndex: step.execution.stepIndex,
          execution: step.execution,
        })),
      },
    } satisfies ExecuteStepsResult;
  });
}

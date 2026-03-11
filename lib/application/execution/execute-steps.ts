import { Effect } from 'effect';
import type { RuntimeScenarioRunnerPort } from '../ports';
import type { AdoId } from '../../domain/identity';
import type { RuntimeScenarioStepResult } from '../ports';
import type { SelectedRunContext } from './select-run-context';
import { interpretScenarioTaskPacket } from './interpret';

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
    const interpreted = yield* interpretScenarioTaskPacket({
      runtimeScenarioRunner: input.runtimeScenarioRunner,
      rootDir: input.rootDir,
      adoId: input.adoId,
      runId: input.selectedContext.runId,
      taskPacket: input.selectedContext.taskPacketEntry.artifact,
      mode: input.selectedContext.mode,
      providerId: input.selectedContext.providerId,
      screenIds: input.selectedContext.screenIds,
      fixtures: input.selectedContext.fixtures,
      controlSelection: {
        runbook: input.selectedContext.activeRunbook?.name ?? null,
        dataset: input.selectedContext.activeDataset?.name ?? null,
        resolutionControl: input.selectedContext.activeRunbook?.resolutionControl ?? null,
      },
      steps: input.selectedContext.steps,
      posture: input.selectedContext.posture,
      context: input.selectedContext.context,
      translationOptions: input.translationOptions,
    });

    return interpreted satisfies ExecuteStepsResult;
  });
}

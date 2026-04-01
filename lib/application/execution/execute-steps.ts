import { Effect } from 'effect';
import type { RuntimeScenarioRunnerPort } from '../ports';
import type { AdoId } from '../../domain/kernel/identity';
import type { ResolutionGraphRecord, ScenarioRunPlan } from '../../domain/types';
import type { RuntimeScenarioStepResult } from '../ports';
import { interpretScenarioFromPlan } from './interpret';

export interface ExecuteStepsResult {
  stepResults: RuntimeScenarioStepResult[];
  interpretationOutput: {
    kind: 'scenario-interpretation-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; interpretation: RuntimeScenarioStepResult['interpretation'] }>;
  };
  resolutionGraphOutput: ResolutionGraphRecord;
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
  plan: ScenarioRunPlan;
  knowledgeFingerprint: string;
  controlsFingerprint: string | null;
  translationOptions?: {
    disableTranslation?: boolean | undefined;
    disableTranslationCache?: boolean | undefined;
  } | undefined;
}) {
  return Effect.gen(function* () {
    const interpreted = yield* interpretScenarioFromPlan({
      runtimeScenarioRunner: input.runtimeScenarioRunner,
      rootDir: input.rootDir,
      plan: input.plan,
      knowledgeFingerprint: input.knowledgeFingerprint,
      controlsFingerprint: input.controlsFingerprint,
      translationOptions: input.translationOptions,
    });

    return interpreted satisfies ExecuteStepsResult;
  });
}

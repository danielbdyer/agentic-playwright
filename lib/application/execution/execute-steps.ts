import { Effect } from 'effect';
import type { ExecutionScenarioRunnerPort } from '../ports/execution-ports';
import type { AdoId } from '../../domain/identity';
import type { ResolutionGraphRecord, ScenarioRunPlan } from '../../domain/types';
import type { ExecutionScenarioStepResult } from '../ports/execution-ports';
import { interpretScenarioFromPlan } from './interpret';

export interface ExecuteStepsResult {
  stepResults: ExecutionScenarioStepResult[];
  interpretationOutput: {
    kind: 'scenario-interpretation-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; interpretation: ExecutionScenarioStepResult['interpretation'] }>;
  };
  resolutionGraphOutput: ResolutionGraphRecord;
  executionOutput: {
    kind: 'scenario-execution-record';
    adoId: AdoId;
    runId: string;
    steps: Array<{ stepIndex: number; execution: ExecutionScenarioStepResult['execution'] }>;
  };
}

export function executeSteps(input: {
  runtimeScenarioRunner: ExecutionScenarioRunnerPort;
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

import { Effect } from 'effect';
import type { RuntimeScenarioRunnerPort } from '../application/ports';
import { createLocalRuntimeEnvironment } from '../infrastructure/runtime/local-runtime-environment';
import { createScenarioRunState, runScenarioStep } from '../runtime/scenario';

export const LocalRuntimeScenarioRunner: RuntimeScenarioRunnerPort = {
  runSteps(input) {
    return Effect.gen(function* () {
      const runtimeEnvironment = createLocalRuntimeEnvironment({
        rootDir: input.rootDir,
        screenIds: input.screenIds,
        fixtures: input.fixtures,
        mode: input.mode,
        provider: input.provider,
        controlSelection: input.controlSelection,
        posture: input.posture,
      });
      const runState = createScenarioRunState();
      const results = [];

      for (const step of input.steps) {
        results.push(yield* Effect.promise(() => runScenarioStep(step, runtimeEnvironment, runState, input.context)));
      }

      return results;
    });
  },
};

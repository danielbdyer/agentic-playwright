import { Effect } from 'effect';
import type { ScenarioRunPlan } from '../domain/types';
import { loadScenarioRunPlanEffect, type LoadScenarioRunPlanInput } from '../application/execution/load-run-plan';
import { provideLocalServices } from './local-services';

export { loadScenarioRunPlanEffect, type LoadScenarioRunPlanInput } from '../application/execution/load-run-plan';

export function loadScenarioRunPlan(input: LoadScenarioRunPlanInput): ScenarioRunPlan {
  const program = provideLocalServices(
    loadScenarioRunPlanEffect(input),
    input.rootDir,
    { suiteRoot: input.suiteRoot, posture: input.executionContextPosture },
  );
  return Effect.runSync(program);
}

export function loadScenarioRunPlanAsync(input: LoadScenarioRunPlanInput): Promise<ScenarioRunPlan> {
  return Effect.runPromise(
    provideLocalServices(
      loadScenarioRunPlanEffect(input),
      input.rootDir,
      { suiteRoot: input.suiteRoot, posture: input.executionContextPosture },
    ),
  );
}

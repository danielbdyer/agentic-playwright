import type { ScenarioRunPlan } from '../domain/types';
import {
  runScenarioHandshake,
  stepHandshakeFromPlan,
  type RuntimeScenarioEnvironment,
  type ScenarioRunState,
  type ScenarioStepRunResult,
} from './scenario';

/**
 * Navigate to a screen. Delegates to the canonical scenario handshake pipeline.
 */
export async function navigateTo(
  environment: RuntimeScenarioEnvironment,
  runState: ScenarioRunState,
  runPlan: ScenarioRunPlan,
  stepIndex: number,
): Promise<ScenarioStepRunResult> {
  return runScenarioHandshake(
    stepHandshakeFromPlan(runPlan, stepIndex),
    environment,
    runState,
    runPlan.context,
  );
}

/**
 * Fill a field with a value. Delegates to the canonical scenario handshake pipeline.
 */
export async function fillField(
  environment: RuntimeScenarioEnvironment,
  runState: ScenarioRunState,
  runPlan: ScenarioRunPlan,
  stepIndex: number,
): Promise<ScenarioStepRunResult> {
  return runScenarioHandshake(
    stepHandshakeFromPlan(runPlan, stepIndex),
    environment,
    runState,
    runPlan.context,
  );
}

/**
 * Click an element. Delegates to the canonical scenario handshake pipeline.
 */
export async function clickElement(
  environment: RuntimeScenarioEnvironment,
  runState: ScenarioRunState,
  runPlan: ScenarioRunPlan,
  stepIndex: number,
): Promise<ScenarioStepRunResult> {
  return runScenarioHandshake(
    stepHandshakeFromPlan(runPlan, stepIndex),
    environment,
    runState,
    runPlan.context,
  );
}

/**
 * Assert a snapshot against a template. Delegates to the canonical scenario handshake pipeline.
 */
export async function expectSnapshot(
  environment: RuntimeScenarioEnvironment,
  runState: ScenarioRunState,
  runPlan: ScenarioRunPlan,
  stepIndex: number,
): Promise<ScenarioStepRunResult> {
  return runScenarioHandshake(
    stepHandshakeFromPlan(runPlan, stepIndex),
    environment,
    runState,
    runPlan.context,
  );
}

/**
 * Execute a custom step. Delegates to the canonical scenario handshake pipeline.
 */
export async function executeStep(
  environment: RuntimeScenarioEnvironment,
  runState: ScenarioRunState,
  runPlan: ScenarioRunPlan,
  stepIndex: number,
): Promise<ScenarioStepRunResult> {
  return runScenarioHandshake(
    stepHandshakeFromPlan(runPlan, stepIndex),
    environment,
    runState,
    runPlan.context,
  );
}

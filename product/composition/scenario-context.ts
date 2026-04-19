import path from 'path';
import type { Page } from '@playwright/test';
import { test } from '@playwright/test';
import type { AdoId } from '../domain/kernel/identity';
import type { RuntimeInterpreterMode, WriteMode } from '../domain/governance/workflow-types';
import { loadScenarioRunPlan } from './load-run-plan';
import { createLocalRuntimeEnvironment } from '../instruments/runtime/local-runtime-environment';
import {
  createScenarioRunState,
  runScenarioHandshake,
  stepHandshakeFromPlan,
  type ScenarioRunState,
  type RuntimeScenarioEnvironment,
} from '../runtime/scenario';
import type { ScenarioRunPlan } from '../domain/resolution/types';

/**
 * A screen-scoped context that exposes POM-style step execution.
 * Methods are generated per-screen at codegen time; at runtime, they
 * delegate to this context's `executeStep`.
 */
export interface ScreenContext {
  readonly executeStep: (stepIndex: number, stepTitle: string) => Promise<void>;
}

/**
 * Top-level scenario context that curries all runtime internals
 * (runPlan, environment, runState) and exposes a clean POM-like API.
 */
export interface ScenarioContext {
  readonly screen: (screenId: string) => ScreenContext;
  readonly executeStep: (stepIndex: number, stepTitle: string) => Promise<void>;
}

/**
 * Create a scenario context that hides all runtime internals behind
 * a POM-aligned facade. Generated specs call this once, then interact
 * only through screen-scoped methods.
 *
 * The page, adoId, and fixtures are the only values the generated spec
 * needs to provide — everything else (runPlan, environment, state) is
 * constructed internally.
 */
export function createScenarioContext(
  page: Page,
  adoId: string,
  fixtures: Record<string, unknown>,
): ScenarioContext {
  const interpreterMode: RuntimeInterpreterMode =
    (process.env.TESSERACT_INTERPRETER_MODE as RuntimeInterpreterMode | undefined) ?? 'dry-run';
  const writeMode: WriteMode = (process.env.TESSERACT_WRITE_MODE ?? 'persist') as WriteMode;
  const headed = process.env.TESSERACT_HEADLESS === '0';

  const rootDir = process.cwd();
  const runPlan: ScenarioRunPlan = loadScenarioRunPlan({
    rootDir,
    suiteRoot: path.join(rootDir, 'dogfood'),
    adoId: adoId as AdoId,
    executionContextPosture: {
      interpreterMode,
      writeMode,
      headed,
      executionProfile: 'interactive',
    },
    interpreterMode,
  });

  const localEnv = createLocalRuntimeEnvironment({
    rootDir: process.cwd(),
    screenIds: runPlan.screenIds,
    fixtures: {
      ...runPlan.fixtures,
      ...fixtures,
    },
    mode: interpreterMode,
    provider: runPlan.providerId,
    posture: {
      ...runPlan.posture,
      interpreterMode,
      writeMode,
      headed,
    },
    controlSelection: runPlan.controlSelection,
  });

  const environment: RuntimeScenarioEnvironment = {
    ...localEnv,
    page,
  };

  const runState: ScenarioRunState = createScenarioRunState();

  const isStepFailure = (result: Awaited<ReturnType<typeof runScenarioHandshake>>): boolean =>
    result.interpretation.kind === 'needs-human' ||
    result.execution.execution.status === 'failed';

  const executeStep = async (stepIndex: number, stepTitle: string): Promise<void> => {
    await test.step(stepTitle, async () => {
      const stepResult = await runScenarioHandshake(
        stepHandshakeFromPlan(runPlan, stepIndex),
        environment,
        runState,
        runPlan.context,
      );

      // Playwright's annotations API requires mutation — this is the framework boundary
      test.info().annotations.push({
        type: 'runtime-receipt',
        description: JSON.stringify(stepResult),
      });

      if (isStepFailure(stepResult)) {
        throw new Error(
          `Step ${stepIndex + 1} requires operator attention or failed execution`,
        );
      }
    });
  };

  return {
    screen: (_screenId: string): ScreenContext => ({
      executeStep,
    }),
    executeStep,
  };
}

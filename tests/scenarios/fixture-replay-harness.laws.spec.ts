/**
 * Fixture-replay scenario harness — laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.6:
 *   SC23 — per-step classifier delegation: harness emits the same
 *          observed outcome the standalone classifier would.
 *   SC24 — session state evolves across steps (form submit reveals
 *          the alert).
 *   SC25 — rung-2 verdict parity with dry-harness for happy-path
 *          scenarios (both produce trajectory-holds).
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import { ScenarioHarness } from '../../workshop/scenarios/application/scenario-harness-port';
import { runScenario } from '../../workshop/scenarios/application/run-scenario';
import { createDryScenarioHarness } from '../../workshop/scenarios/harness/dry-scenario-harness';
import { createFixtureReplayScenarioHarness } from '../../workshop/scenarios/harness/fixture-replay-scenario-harness';
import {
  scenarioId,
  stepName,
  type Scenario,
  type ScenarioStep,
} from '../../workshop/scenarios/domain/scenario';

const PINNED_NOW = new Date('2026-04-22T00:00:00.000Z');

function observeStep(name: string, role: 'button' | 'textbox', surfaceName: string): ScenarioStep {
  return {
    name: stepName(name),
    probe: {
      id: `probe:scenario:demo:${name}`,
      verb: 'observe',
      fixtureName: name,
      declaredIn: 'inline',
      expected: { classification: 'matched', errorFamily: null },
      input: { target: { role, name: surfaceName } },
      worldSetup: undefined,
      exercises: [],
    },
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [],
    postconditions: [],
  };
}

function interactStep(
  name: string,
  action: 'click' | 'input',
  role: 'button' | 'textbox',
  surfaceName: string,
  value?: string,
  postconditions: ScenarioStep['postconditions'] = [],
): ScenarioStep {
  return {
    name: stepName(name),
    probe: {
      id: `probe:scenario:demo:${name}`,
      verb: 'interact',
      fixtureName: name,
      declaredIn: 'inline',
      expected: { classification: 'matched', errorFamily: null },
      input: {
        action,
        target: { role, name: surfaceName },
        ...(value !== undefined ? { value } : {}),
      },
      worldSetup: undefined,
      exercises: [],
    },
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [],
    postconditions,
  };
}

function loginScenarioWithSubmit(): Scenario {
  return {
    id: scenarioId('demo'),
    description: '',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [
      observeStep('observe-submit', 'button', 'Submit'),
      interactStep('fill-identifier', 'input', 'textbox', 'Identifier', 'alice'),
      interactStep('fill-passphrase', 'input', 'textbox', 'Passphrase', 'secret'),
      interactStep('click-submit', 'click', 'button', 'Submit', undefined, [
        { kind: 'surface-present', target: { role: 'status', name: 'Signed in' } },
      ]),
    ],
    invariants: [],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

function loginScenarioSubmitEmpty(): Scenario {
  return {
    id: scenarioId('demo'),
    description: '',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [
      interactStep('click-submit-empty', 'click', 'button', 'Submit', undefined, [
        { kind: 'surface-present', target: { role: 'alert', name: 'Please complete required fields' } },
      ]),
    ],
    invariants: [],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

async function runWith(harness: ReturnType<typeof createFixtureReplayScenarioHarness>, scenario: Scenario) {
  return Effect.runPromise(
    runScenario(scenario, { now: () => PINNED_NOW }).pipe(
      Effect.provide(Layer.succeed(ScenarioHarness, harness)),
    ),
  );
}

describe('Fixture-replay scenario harness — laws', () => {
  test('SC23+SC24: filling required fields before submit reveals success status', async () => {
    const harness = createFixtureReplayScenarioHarness({ now: () => PINNED_NOW });
    const output = await runWith(harness, loginScenarioWithSubmit());
    expect(output.verdict).toBe('trajectory-holds');
    expect(output.harnessTag).toBe('scenario-fixture-replay');
    // The submit-step's postcondition asserts the success status
    // surface — must hold after the click.
    const submitStep = output.trace.steps[3]!;
    expect(submitStep.postconditionOutcomes).toHaveLength(1);
    expect(submitStep.postconditionOutcomes[0]!.outcome.kind).toBe('held');
  });

  test('SC24.b: submitting an empty form reveals the error alert (state evolves)', async () => {
    const harness = createFixtureReplayScenarioHarness({ now: () => PINNED_NOW });
    const output = await runWith(harness, loginScenarioSubmitEmpty());
    expect(output.verdict).toBe('trajectory-holds');
    const step = output.trace.steps[0]!;
    expect(step.postconditionOutcomes[0]!.outcome.kind).toBe('held');
  });

  test('SC25: dry-harness verdict and fixture-replay verdict agree (happy path)', async () => {
    const scenario = loginScenarioWithSubmit();
    const dryHarness = createDryScenarioHarness({ now: () => PINNED_NOW });
    const replayHarness = createFixtureReplayScenarioHarness({ now: () => PINNED_NOW });
    const dryOutput = await Effect.runPromise(
      runScenario(scenario, { now: () => PINNED_NOW }).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, dryHarness)),
      ),
    );
    const replayOutput = await runWith(replayHarness, scenario);
    expect(dryOutput.verdict).toBe(replayOutput.verdict);
    expect(dryOutput.trace.steps.length).toBe(replayOutput.trace.steps.length);
  });

  test('SC24.c: unknown topology preset → SessionOpenFailed', async () => {
    const harness = createFixtureReplayScenarioHarness({ now: () => PINNED_NOW });
    const bad: Scenario = {
      ...loginScenarioWithSubmit(),
      topology: { kind: 'preset', preset: 'totally-not-real' },
    };
    const result = await Effect.runPromiseExit(
      runScenario(bad, { now: () => PINNED_NOW }).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
      ),
    );
    expect(result._tag).toBe('Failure');
  });
});

/**
 * Dry scenario harness + runner — laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.3:
 *   SC11 — dry harness trivially confirms.
 *   SC12 — session lifecycle (open + close paired via Effect.scoped).
 *   SC13 — dry harness deterministic across runs.
 *   SC5  — foldScenarioError exhaustive.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import { createDryScenarioHarness } from '../../workshop/scenarios/harness/dry-scenario-harness';
import {
  ScenarioHarness,
} from '../../workshop/scenarios/application/scenario-harness-port';
import {
  computeVerdict,
  runScenario,
  verdictPasses,
} from '../../workshop/scenarios/application/run-scenario';
import {
  scenarioId,
  stepName,
  type Scenario,
  type ScenarioStep,
} from '../../workshop/scenarios/domain/scenario';
import {
  foldScenarioError,
  type ScenarioError,
  harnessUnavailable,
  sessionOpenFailed,
  stepExecutionFailed,
  assertionEvaluationFailed,
  invariantEvaluationFailed,
} from '../../workshop/scenarios/domain/scenario-error';
import {
  invariantViolated,
  type InvariantOutcome,
} from '../../workshop/scenarios/domain/invariant';

function step(name: string): ScenarioStep {
  return {
    name: stepName(name),
    probe: {
      id: `probe:scenario:demo:${name}`,
      verb: 'observe',
      fixtureName: name,
      declaredIn: 'inline',
      expected: { classification: 'matched', errorFamily: null },
      input: { target: { role: 'button', name: 'Action' } },
      worldSetup: undefined,
      exercises: [],
    },
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [
      { kind: 'surface-present', target: { role: 'button', name: 'Action' } },
    ],
    postconditions: [],
  };
}

function makeScenario(): Scenario {
  return {
    id: scenarioId('demo'),
    description: '',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [step('first'), step('second'), step('third')],
    invariants: [
      { kind: 'aria-alert-announces-exactly-once', target: { role: 'alert', name: 'X' } },
    ],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

describe('Dry scenario harness + runner laws', () => {
  test('SC11: dry harness produces trajectory-holds for every step', async () => {
    const scenario = makeScenario();
    const harness = createDryScenarioHarness({ now: () => new Date('2026-04-22T00:00:00Z') });
    const output = await Effect.runPromise(
      runScenario(scenario, { now: () => new Date('2026-04-22T00:00:00Z') }).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
      ),
    );
    expect(output.verdict).toBe('trajectory-holds');
    expect(output.trace.steps).toHaveLength(3);
    for (const stepOutcome of output.trace.steps) {
      expect(stepOutcome.completedAsExpected).toBe(true);
    }
    expect(output.invariantOutcomes).toHaveLength(1);
    expect(output.invariantOutcomes[0]!.outcome.kind).toBe('held');
  });

  test('SC11.b: harness tag is stamped on RunOutput', async () => {
    const harness = createDryScenarioHarness();
    const output = await Effect.runPromise(
      runScenario(makeScenario()).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
      ),
    );
    expect(output.harnessTag).toBe('scenario-dry');
  });

  test('SC12: session is closed even if a step fails', async () => {
    const closeCount: { value: number } = { value: 0 };
    const baseHarness = createDryScenarioHarness();
    const trackingHarness = {
      ...baseHarness,
      closeSession: () => Effect.sync(() => { closeCount.value += 1; }),
      executeStep: () => Effect.fail(stepExecutionFailed('first', 'simulated boom')),
    };
    const result = await Effect.runPromiseExit(
      runScenario(makeScenario()).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, trackingHarness)),
      ),
    );
    expect(result._tag).toBe('Failure');
    // Effect.scoped guarantees release on failure.
    expect(closeCount.value).toBe(1);
  });

  test('SC13: dry harness deterministic — two runs produce the same verdict + step count', async () => {
    const scenario = makeScenario();
    const harness = createDryScenarioHarness({ now: () => new Date('2026-04-22T00:00:00Z') });
    const a = await Effect.runPromise(
      runScenario(scenario, { now: () => new Date('2026-04-22T00:00:00Z') }).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
      ),
    );
    const b = await Effect.runPromise(
      runScenario(scenario, { now: () => new Date('2026-04-22T00:00:00Z') }).pipe(
        Effect.provide(Layer.succeed(ScenarioHarness, harness)),
      ),
    );
    expect(a.verdict).toBe(b.verdict);
    expect(a.trace.steps.length).toBe(b.trace.steps.length);
  });

  test('SC5: foldScenarioError routes every variant', () => {
    const errors: ScenarioError[] = [
      harnessUnavailable('reason'),
      sessionOpenFailed('id', 'cause'),
      stepExecutionFailed('step', 'cause'),
      assertionEvaluationFailed(
        { kind: 'surface-present', target: { role: 'button' } },
        'cause',
      ),
      invariantEvaluationFailed('aria-alert-announces-exactly-once', 'cause'),
    ];
    const labels = errors.map((e) =>
      foldScenarioError(e, {
        harness: () => 'h',
        session: () => 's',
        step: () => 'st',
        assertion: () => 'a',
        invariant: () => 'i',
      }),
    );
    expect(labels).toEqual(['h', 's', 'st', 'a', 'i']);
  });

  test('computeVerdict: invariant-violated when any outcome is violated', () => {
    const trace = { steps: [], firstDivergence: null };
    const invariantOutcomes = [
      {
        invariant: {
          kind: 'aria-alert-announces-exactly-once' as const,
          target: { role: 'alert' as const, name: 'X' },
        },
        outcome: invariantViolated(['twice'], 'announces-exactly-once') as InvariantOutcome,
      },
    ];
    expect(computeVerdict(trace, invariantOutcomes)).toBe('invariant-violated');
  });

  test('verdictPasses: only trajectory-holds passes', () => {
    expect(verdictPasses('trajectory-holds')).toBe(true);
    expect(verdictPasses('step-diverged')).toBe(false);
    expect(verdictPasses('invariant-violated')).toBe(false);
    expect(verdictPasses('harness-failed')).toBe(false);
  });
});

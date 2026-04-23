/**
 * Corpus + parametric laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.8:
 *   SC29 — every corpus scenario passes under dry-harness.
 *   SC30 — parametric materialization preserves structure.
 */

import { describe, test, expect } from 'vitest';
import { Effect, Layer } from 'effect';
import path from 'node:path';
import {
  defaultCorpusDir,
  loadCorpusFromDirectory,
} from '../../workshop/scenarios/corpus/catalog';
import { createDryScenarioHarness } from '../../workshop/scenarios/harness/dry-scenario-harness';
import { createFixtureReplayScenarioHarness } from '../../workshop/scenarios/harness/fixture-replay-scenario-harness';
import { ScenarioHarness } from '../../workshop/scenarios/application/scenario-harness-port';
import { runScenario } from '../../workshop/scenarios/application/run-scenario';
import {
  materializeParametricScenario,
  type ParametricScenario,
} from '../../workshop/scenarios/domain/parametric';
import {
  scenarioId,
  stepName,
  type Scenario,
} from '../../workshop/scenarios/domain/scenario';

const REPO_ROOT = path.resolve(__dirname, '../..');

describe('Corpus + parametric — laws', () => {
  test('SC29: every corpus scenario loads + passes under dry-harness', async () => {
    const corpus = loadCorpusFromDirectory(defaultCorpusDir(REPO_ROOT));
    expect(corpus.scenarios.size).toBeGreaterThanOrEqual(4);
    const errorIssues = corpus.issues.flatMap((i) => i.issues.filter((x) => x.severity === 'error'));
    expect(errorIssues).toEqual([]);

    const harness = createDryScenarioHarness();
    for (const [id, scenario] of corpus.scenarios) {
      const output = await Effect.runPromise(
        runScenario(scenario).pipe(Effect.provide(Layer.succeed(ScenarioHarness, harness))),
      );
      expect(output.verdict, `scenario ${id} verdict`).toBe('trajectory-holds');
    }
  });

  test('SC29.b: every corpus scenario passes under fixture-replay harness', async () => {
    const corpus = loadCorpusFromDirectory(defaultCorpusDir(REPO_ROOT));
    const harness = createFixtureReplayScenarioHarness();
    for (const [id, scenario] of corpus.scenarios) {
      const output = await Effect.runPromise(
        runScenario(scenario).pipe(Effect.provide(Layer.succeed(ScenarioHarness, harness))),
      );
      expect(output.verdict, `scenario ${id} verdict`).toBe('trajectory-holds');
    }
  });

  test('SC30: parametric materialization yields N structurally-equivalent scenarios', () => {
    const template: Scenario = {
      id: scenarioId('observe-named-button-template'),
      description: 'Observe ${buttonName}',
      schemaVersion: 1,
      topology: { kind: 'preset', preset: 'login-form' },
      steps: [
        {
          name: stepName('observe-${buttonName}'),
          probe: {
            id: 'probe:scenario:observe-named-button-template:observe',
            verb: 'observe',
            fixtureName: 'observe-${buttonName}',
            declaredIn: 'inline',
            expected: { classification: 'matched', errorFamily: null },
            input: { target: { role: 'button', name: '${buttonName}' } },
            worldSetup: undefined,
            exercises: [],
          },
          expected: { classification: 'matched', errorFamily: null },
          worldInheritance: 'keep',
          preconditions: [],
          postconditions: [],
        },
      ],
      invariants: [],
      expected: { verdict: 'trajectory-holds' },
      clearStateBetweenSteps: false,
      maxStepTimeoutMs: 5000,
    };
    const parametric: ParametricScenario = {
      templateId: 'observe-named-button',
      template,
      parameterSets: [
        { buttonName: 'Submit' },
        { buttonName: 'Save' },
        { buttonName: 'Cancel' },
      ],
    };
    const concrete = materializeParametricScenario(parametric);
    expect(concrete).toHaveLength(3);
    expect(concrete[0]!.id).toBe('observe-named-button--p0');
    expect(concrete[0]!.steps[0]!.name).toBe('observe-Submit');
    expect((concrete[0]!.steps[0]!.probe.input as { target: { name: string } }).target.name).toBe('Submit');
    expect(concrete[1]!.steps[0]!.name).toBe('observe-Save');
    expect(concrete[2]!.steps[0]!.name).toBe('observe-Cancel');
    expect(concrete[0]!.description).toBe('Observe Submit');
  });
});

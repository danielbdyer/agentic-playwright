/**
 * Scenario domain — structural laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.1, the S1 phase pins:
 *
 *   SC1 (Scenario identity): scenarioKeyableShape is deterministic
 *       and excludes cosmetic fields.
 *   SC2 (ScenarioVerdict exhaustiveness): foldScenarioVerdict
 *       routes every variant.
 *   SC3 (SubstrateAssertion exhaustiveness): foldSubstrateAssertion
 *       routes every kind.
 *   SC4 (Invariant exhaustiveness): foldInvariant routes every kind.
 *   SC6 (Domain purity): no file under workshop/scenarios/domain/
 *       imports from 'effect'.
 */

import { describe, test, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  foldScenarioVerdict,
  scenarioId,
  scenarioKeyableShape,
  stepName,
  type Scenario,
  type ScenarioStep,
  type ScenarioVerdict,
} from '../../workshop/scenarios/domain/scenario';
import {
  foldSubstrateAssertion,
  foldAssertionOutcome,
  ASSERTION_HELD,
  assertionViolated,
  type SubstrateAssertion,
} from '../../workshop/scenarios/domain/assertion';
import {
  foldInvariant,
  foldInvariantOutcome,
  invariantHeld,
  invariantViolated,
  type Invariant,
} from '../../workshop/scenarios/domain/invariant';

function sampleStep(name: string): ScenarioStep {
  return {
    name: stepName(name),
    probe: {
      id: `probe:observe:${name}`,
      verb: 'observe',
      fixtureName: name,
      declaredIn: 'inline.yaml',
      expected: { classification: 'matched', errorFamily: null },
      input: { target: { role: 'button', name: 'Action' } },
      worldSetup: undefined,
      exercises: [],
    },
    expected: { classification: 'matched', errorFamily: null },
    worldInheritance: 'keep',
    preconditions: [],
    postconditions: [],
  };
}

function sampleScenario(): Scenario {
  return {
    id: scenarioId('demo'),
    description: 'A description that should NOT affect the fingerprint.',
    schemaVersion: 1,
    topology: { kind: 'preset', preset: 'login-form' },
    steps: [sampleStep('first'), sampleStep('second')],
    invariants: [],
    expected: { verdict: 'trajectory-holds' },
    clearStateBetweenSteps: false,
    maxStepTimeoutMs: 5000,
  };
}

describe('Scenario domain — structural laws', () => {
  test('SC1: scenarioKeyableShape is deterministic and excludes description', () => {
    const a = sampleScenario();
    const b: Scenario = { ...a, description: 'TOTALLY different prose, same scenario.' };
    expect(scenarioKeyableShape(a)).toEqual(scenarioKeyableShape(b));
    // Two identical inputs produce identical keyable shapes.
    expect(scenarioKeyableShape(a)).toEqual(scenarioKeyableShape(a));
  });

  test('SC1.b: scenarioKeyableShape excludes step name (cosmetic)', () => {
    const a = sampleScenario();
    const b: Scenario = {
      ...a,
      steps: a.steps.map((s, i) => ({ ...s, name: stepName(`renamed-${i}`) })),
    };
    expect(scenarioKeyableShape(a)).toEqual(scenarioKeyableShape(b));
  });

  test('SC1.c: scenarioKeyableShape includes substantive fields', () => {
    const a = sampleScenario();
    const b: Scenario = {
      ...a,
      topology: { kind: 'preset', preset: 'tabbed-interface' },
    };
    expect(scenarioKeyableShape(a)).not.toEqual(scenarioKeyableShape(b));
  });

  test('SC2: foldScenarioVerdict routes every variant', () => {
    const verdicts: ScenarioVerdict[] = [
      'trajectory-holds',
      'step-diverged',
      'invariant-violated',
      'harness-failed',
    ];
    const results = verdicts.map((v) =>
      foldScenarioVerdict(v, {
        trajectoryHolds: () => 'th',
        stepDiverged: () => 'sd',
        invariantViolated: () => 'iv',
        harnessFailed: () => 'hf',
      }),
    );
    expect(results).toEqual(['th', 'sd', 'iv', 'hf']);
  });

  test('SC3: foldSubstrateAssertion routes every kind', () => {
    const assertions: SubstrateAssertion[] = [
      { kind: 'surface-present', target: { role: 'button' } },
      { kind: 'surface-absent', target: { role: 'alert' } },
      { kind: 'surface-has-value', target: { role: 'textbox', name: 'F' }, expectedValue: 'v' },
      { kind: 'surface-is-focused', target: { role: 'button' } },
      { kind: 'surface-count', role: 'button', count: 3 },
    ];
    const results = assertions.map((a) =>
      foldSubstrateAssertion(a, {
        surfacePresent: () => 'sp',
        surfaceAbsent: () => 'sa',
        surfaceHasValue: () => 'shv',
        surfaceIsFocused: () => 'sif',
        surfaceCount: () => 'sc',
      }),
    );
    expect(results).toEqual(['sp', 'sa', 'shv', 'sif', 'sc']);
  });

  test('SC3.b: foldAssertionOutcome dispatches held / violated', () => {
    expect(
      foldAssertionOutcome(ASSERTION_HELD, {
        held: () => 'h',
        violated: () => 'v',
      }),
    ).toBe('h');
    expect(
      foldAssertionOutcome(assertionViolated('o', 'e'), {
        held: () => 'h',
        violated: ({ observed, expected }) => `${observed}-${expected}`,
      }),
    ).toBe('o-e');
  });

  test('SC4: foldInvariant routes every kind', () => {
    const invariants: Invariant[] = [
      { kind: 'aria-alert-announces-exactly-once', target: { role: 'alert', name: 'X' } },
      { kind: 'focus-stays-within-landmark', landmark: { role: 'main' } },
      { kind: 'form-state-preserved-on-navigation', formName: 'Login', fieldNames: ['Identifier'] },
      { kind: 'validation-errors-clear-on-correction', fieldName: 'A', errorAlertName: 'B' },
      { kind: 'cross-verb-strategy-preference', facetId: 'ns:x', failedStrategy: 'role', preferredAlternate: 'test-id' },
    ];
    const results = invariants.map((i) =>
      foldInvariant(i, {
        ariaAlertOnce: () => 'a',
        focusStays: () => 'f',
        formStatePreserved: () => 'p',
        validationClears: () => 'v',
        crossVerbStrategy: () => 'c',
      }),
    );
    expect(results).toEqual(['a', 'f', 'p', 'v', 'c']);
  });

  test('SC4.b: foldInvariantOutcome dispatches held / violated', () => {
    expect(
      foldInvariantOutcome(invariantHeld('once'), {
        held: ({ evidence }) => evidence,
        violated: () => 'v',
      }),
    ).toBe('once');
    expect(
      foldInvariantOutcome(invariantViolated(['a', 'b'], 'unique'), {
        held: () => 'h',
        violated: ({ observedSequence }) => observedSequence.join(','),
      }),
    ).toBe('a,b');
  });

  test('SC6: no file under workshop/scenarios/domain/ imports from "effect"', () => {
    const domainDir = path.resolve(__dirname, '../../workshop/scenarios/domain');
    const offenders: string[] = [];
    for (const entry of readdirSync(domainDir)) {
      const full = path.join(domainDir, entry);
      if (!statSync(full).isFile()) continue;
      const content = readFileSync(full, 'utf-8');
      if (/from\s+['"]effect['"]/.test(content)) {
        offenders.push(entry);
      }
    }
    expect(offenders).toEqual([]);
  });
});

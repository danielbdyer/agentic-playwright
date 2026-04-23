/**
 * Invariant evaluators — held/violated laws.
 *
 * Per docs/v2-scenario-corpus-plan.md §9.5 (SC18–SC22), each
 * invariant kind has both paths exercised against hand-crafted
 * traces.
 */

import { describe, test, expect } from 'vitest';
import { evaluateInvariantPure } from '../../workshop/scenarios/application/evaluate-invariants';
import {
  ASSERTION_HELD,
  assertionViolated,
} from '../../workshop/scenarios/domain/assertion';
import type { ScenarioTrace, StepOutcome } from '../../workshop/scenarios/domain/scenario-trace';
import { stepName } from '../../workshop/scenarios/domain/scenario';

function step(
  name: string,
  postconditionRuns: StepOutcome['postconditionOutcomes'],
  observed: StepOutcome['observed'] = { classification: 'matched', errorFamily: null },
  probeId = `probe:${name}`,
): StepOutcome {
  return {
    stepName: stepName(name),
    probeReceiptRef: { probeId },
    observed,
    preconditionOutcomes: [],
    postconditionOutcomes: postconditionRuns,
    elapsedMs: 1,
    completedAsExpected: true,
  };
}

function trace(steps: readonly StepOutcome[]): ScenarioTrace {
  return { steps, firstDivergence: null };
}

describe('Invariant evaluators — laws', () => {
  // SC18 — aria-alert-announces-exactly-once
  describe('SC18 aria-alert-announces-exactly-once', () => {
    test('held when alert appears once', () => {
      const t = trace([
        step('s1', [
          {
            assertion: { kind: 'surface-present', target: { role: 'alert', name: 'X' } },
            outcome: ASSERTION_HELD,
          },
        ]),
        step('s2', []),
      ]);
      const outcome = evaluateInvariantPure(
        { kind: 'aria-alert-announces-exactly-once', target: { role: 'alert', name: 'X' } },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('violated when alert appears twice', () => {
      const presentX = {
        assertion: { kind: 'surface-present' as const, target: { role: 'alert' as const, name: 'X' } },
        outcome: ASSERTION_HELD,
      };
      const t = trace([step('s1', [presentX]), step('s2', [presentX])]);
      const outcome = evaluateInvariantPure(
        { kind: 'aria-alert-announces-exactly-once', target: { role: 'alert', name: 'X' } },
        t,
      );
      expect(outcome.kind).toBe('violated');
      if (outcome.kind === 'violated') {
        expect(outcome.observedSequence).toEqual(['step:s1', 'step:s2']);
      }
    });

    test('held when alert never appears', () => {
      const t = trace([step('s1', []), step('s2', [])]);
      const outcome = evaluateInvariantPure(
        { kind: 'aria-alert-announces-exactly-once', target: { role: 'alert', name: 'Y' } },
        t,
      );
      expect(outcome.kind).toBe('held');
    });
  });

  // SC19 — focus-stays-within-landmark
  describe('SC19 focus-stays-within-landmark', () => {
    test('held when no focus violations recorded', () => {
      const t = trace([step('s1', [
        {
          assertion: { kind: 'surface-is-focused', target: { role: 'button', name: 'A' } },
          outcome: ASSERTION_HELD,
        },
      ])]);
      const outcome = evaluateInvariantPure(
        { kind: 'focus-stays-within-landmark', landmark: { role: 'main' } },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('violated when a focus assertion was violated', () => {
      const t = trace([step('s1', [
        {
          assertion: { kind: 'surface-is-focused', target: { role: 'button', name: 'A' } },
          outcome: assertionViolated('button:Other', 'button:A'),
        },
      ])]);
      const outcome = evaluateInvariantPure(
        { kind: 'focus-stays-within-landmark', landmark: { role: 'main' } },
        t,
      );
      expect(outcome.kind).toBe('violated');
    });
  });

  // SC20 — form-state-preserved-on-navigation
  describe('SC20 form-state-preserved-on-navigation', () => {
    test('held when no field-value violations recorded', () => {
      const t = trace([step('s1', [
        {
          assertion: { kind: 'surface-has-value', target: { role: 'textbox', name: 'A' }, expectedValue: 'v' },
          outcome: ASSERTION_HELD,
        },
      ])]);
      const outcome = evaluateInvariantPure(
        { kind: 'form-state-preserved-on-navigation', formName: 'Login', fieldNames: ['A'] },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('violated when a field-value assertion failed', () => {
      const t = trace([step('s1', [
        {
          assertion: { kind: 'surface-has-value', target: { role: 'textbox', name: 'A' }, expectedValue: 'v' },
          outcome: assertionViolated('', 'v'),
        },
      ])]);
      const outcome = evaluateInvariantPure(
        { kind: 'form-state-preserved-on-navigation', formName: 'Login', fieldNames: ['A'] },
        t,
      );
      expect(outcome.kind).toBe('violated');
    });
  });

  // SC21 — validation-errors-clear-on-correction
  describe('SC21 validation-errors-clear-on-correction', () => {
    test('held vacuously when alert never appeared', () => {
      const t = trace([step('s1', []), step('s2', [])]);
      const outcome = evaluateInvariantPure(
        { kind: 'validation-errors-clear-on-correction', fieldName: 'F', errorAlertName: 'E' },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('held when alert clears after correction step', () => {
      const presentE = {
        assertion: { kind: 'surface-present' as const, target: { role: 'alert' as const, name: 'E' } },
        outcome: ASSERTION_HELD,
      };
      const t = trace([
        step('submit', [presentE]),
        step('correct', []),
        step('post-correct', []),
      ]);
      const outcome = evaluateInvariantPure(
        { kind: 'validation-errors-clear-on-correction', fieldName: 'F', errorAlertName: 'E' },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('violated when alert persists after correction', () => {
      const presentE = {
        assertion: { kind: 'surface-present' as const, target: { role: 'alert' as const, name: 'E' } },
        outcome: ASSERTION_HELD,
      };
      const t = trace([
        step('submit', [presentE]),
        step('correct', []),
        step('post-correct', [presentE]),
      ]);
      const outcome = evaluateInvariantPure(
        { kind: 'validation-errors-clear-on-correction', fieldName: 'F', errorAlertName: 'E' },
        t,
      );
      expect(outcome.kind).toBe('violated');
    });
  });

  // SC22 — cross-verb-strategy-preference
  describe('SC22 cross-verb-strategy-preference', () => {
    test('held vacuously when no track-failure recorded', () => {
      const t = trace([step('s1', [], { classification: 'matched', errorFamily: null }, 'probe:observe:s1')]);
      const outcome = evaluateInvariantPure(
        {
          kind: 'cross-verb-strategy-preference',
          facetId: 'ns:foo',
          failedStrategy: 'role',
          preferredAlternate: 'test-id',
        },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('held when subsequent observe succeeded after track-failure', () => {
      const t = trace([
        step('track', [], { classification: 'matched', errorFamily: null }, 'probe:locator-health-track:ns:foo'),
        step('observe', [], { classification: 'matched', errorFamily: null }, 'probe:observe:ns:foo'),
      ]);
      const outcome = evaluateInvariantPure(
        {
          kind: 'cross-verb-strategy-preference',
          facetId: 'ns:foo',
          failedStrategy: 'role',
          preferredAlternate: 'test-id',
        },
        t,
      );
      expect(outcome.kind).toBe('held');
    });

    test('violated when subsequent observe failed after track-failure', () => {
      const t = trace([
        step('track', [], { classification: 'matched', errorFamily: null }, 'probe:locator-health-track:ns:foo'),
        step(
          'observe',
          [],
          { classification: 'failed', errorFamily: 'not-visible' },
          'probe:observe:ns:foo',
        ),
      ]);
      const outcome = evaluateInvariantPure(
        {
          kind: 'cross-verb-strategy-preference',
          facetId: 'ns:foo',
          failedStrategy: 'role',
          preferredAlternate: 'test-id',
        },
        t,
      );
      expect(outcome.kind).toBe('violated');
    });
  });
});

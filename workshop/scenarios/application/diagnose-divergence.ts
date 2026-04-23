/**
 * Pure helper: diagnose why a step's outcome diverged from its
 * expected.
 *
 * Per docs/v2-scenario-corpus-plan.md §4.2, the runner constructs
 * a StepDivergence value when a step's `completedAsExpected` is
 * false. The diagnosis encapsulates which axis diverged and a
 * human-readable detail.
 */

import { allAssertionsHeld, type StepDivergence, type StepOutcome } from '../domain/scenario-trace';
import type { ScenarioStep } from '../domain/scenario';

export function diagnoseStepDivergence(
  step: ScenarioStep,
  outcome: StepOutcome,
): StepDivergence {
  if (!allAssertionsHeld(outcome.preconditionOutcomes)) {
    const violated = outcome.preconditionOutcomes.find((r) => r.outcome.kind === 'violated');
    return {
      stepName: step.name,
      kind: 'precondition-failed',
      detail: violated !== undefined && violated.outcome.kind === 'violated'
        ? `precondition violated: ${violated.outcome.observed} (expected ${violated.outcome.expected})`
        : 'precondition violated',
    };
  }
  const expected = step.expected;
  const observed = outcome.observed;
  if (
    expected.classification !== observed.classification ||
    expected.errorFamily !== observed.errorFamily
  ) {
    return {
      stepName: step.name,
      kind: 'classification-mismatch',
      detail: `expected ${expected.classification}/${expected.errorFamily ?? 'null'}; observed ${observed.classification}/${observed.errorFamily ?? 'null'}`,
    };
  }
  if (!allAssertionsHeld(outcome.postconditionOutcomes)) {
    const violated = outcome.postconditionOutcomes.find((r) => r.outcome.kind === 'violated');
    return {
      stepName: step.name,
      kind: 'postcondition-failed',
      detail: violated !== undefined && violated.outcome.kind === 'violated'
        ? `postcondition violated: ${violated.outcome.observed} (expected ${violated.outcome.expected})`
        : 'postcondition violated',
    };
  }
  return {
    stepName: step.name,
    kind: 'harness-error',
    detail: 'completedAsExpected was false but no specific divergence found',
  };
}

/** Recompute completedAsExpected against a step. Pure. */
export function isStepCompletedAsExpected(
  step: ScenarioStep,
  outcome: StepOutcome,
): boolean {
  if (!allAssertionsHeld(outcome.preconditionOutcomes)) return false;
  if (!allAssertionsHeld(outcome.postconditionOutcomes)) return false;
  return (
    step.expected.classification === outcome.observed.classification &&
    step.expected.errorFamily === outcome.observed.errorFamily
  );
}

/**
 * ScenarioError — tagged union of errors the runner can produce.
 *
 * Per docs/v2-scenario-corpus-plan.md §4.3, errors are dispatched
 * via Effect.catchTag. The fold is exhaustive over the closed
 * union; adding an error variant requires updating
 * `foldScenarioError`.
 *
 * Avoiding Data.TaggedError in the domain layer keeps this module
 * Effect-free per SC6 (domain purity); Effect-typed wrappers live
 * in the application layer when needed.
 */

import type { SubstrateAssertion } from './assertion';

export interface HarnessUnavailable {
  readonly _tag: 'HarnessUnavailable';
  readonly reason: string;
}

export interface SessionOpenFailed {
  readonly _tag: 'SessionOpenFailed';
  readonly scenarioId: string;
  readonly cause: string;
}

export interface StepExecutionFailed {
  readonly _tag: 'StepExecutionFailed';
  readonly stepName: string;
  readonly cause: string;
}

export interface AssertionEvaluationFailed {
  readonly _tag: 'AssertionEvaluationFailed';
  readonly assertion: SubstrateAssertion;
  readonly cause: string;
}

export interface InvariantEvaluationFailed {
  readonly _tag: 'InvariantEvaluationFailed';
  readonly invariantKind: string;
  readonly cause: string;
}

export type ScenarioError =
  | HarnessUnavailable
  | SessionOpenFailed
  | StepExecutionFailed
  | AssertionEvaluationFailed
  | InvariantEvaluationFailed;

export function harnessUnavailable(reason: string): HarnessUnavailable {
  return { _tag: 'HarnessUnavailable', reason };
}

export function sessionOpenFailed(scenarioId: string, cause: string): SessionOpenFailed {
  return { _tag: 'SessionOpenFailed', scenarioId, cause };
}

export function stepExecutionFailed(stepName: string, cause: string): StepExecutionFailed {
  return { _tag: 'StepExecutionFailed', stepName, cause };
}

export function assertionEvaluationFailed(
  assertion: SubstrateAssertion,
  cause: string,
): AssertionEvaluationFailed {
  return { _tag: 'AssertionEvaluationFailed', assertion, cause };
}

export function invariantEvaluationFailed(
  invariantKind: string,
  cause: string,
): InvariantEvaluationFailed {
  return { _tag: 'InvariantEvaluationFailed', invariantKind, cause };
}

export function foldScenarioError<R>(
  err: ScenarioError,
  cases: {
    readonly harness: (e: HarnessUnavailable) => R;
    readonly session: (e: SessionOpenFailed) => R;
    readonly step: (e: StepExecutionFailed) => R;
    readonly assertion: (e: AssertionEvaluationFailed) => R;
    readonly invariant: (e: InvariantEvaluationFailed) => R;
  },
): R {
  switch (err._tag) {
    case 'HarnessUnavailable':           return cases.harness(err);
    case 'SessionOpenFailed':            return cases.session(err);
    case 'StepExecutionFailed':          return cases.step(err);
    case 'AssertionEvaluationFailed':    return cases.assertion(err);
    case 'InvariantEvaluationFailed':    return cases.invariant(err);
  }
}

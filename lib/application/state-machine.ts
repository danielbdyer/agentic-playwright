import { Effect } from 'effect';
import { runHyloEffect, type UnfoldStep } from '../domain/algebra/hylomorphism';

export interface StateMachine<S, E, R> {
  readonly initial: S;
  readonly step: (state: S) => Effect.Effect<{ readonly next: S; readonly done: boolean }, E, R>;
}

/**
 * Run a state machine as a hylomorphism where seed = accumulator.
 *
 * A StateMachine<S> is a self-referential hylomorphism:
 *   - Seed type = S (the loop state drives the next unfold)
 *   - Element type = S (each step produces the next state)
 *   - Accumulator type = S (the fold replaces the accumulator with the element)
 *   - Unfold: step(state) → { done, next } mapped to UnfoldStep<S, S>
 *   - Fold: (_, next) => next  (identity — element IS the new accumulator)
 *
 * This is the degenerate hylomorphism where T = A = S, making fold trivial.
 * The dogfood improvement loop and convergence proof use this form.
 *
 * @see docs/design-calculus.md § Duality 1: Fold / Unfold (hylomorphism)
 */
export function runStateMachine<S, E, R>(machine: StateMachine<S, E, R>): Effect.Effect<S, E, R> {
  return runHyloEffect<S, S, S, E, R>(
    machine.initial,
    machine.initial,
    (state) => Effect.gen(function* () {
      const result = yield* machine.step(state);
      if (result.done) return { done: true } as UnfoldStep<S, S>;
      return { done: false, value: result.next, next: result.next } as UnfoldStep<S, S>;
    }),
    (_acc, next) => next,
  );
}

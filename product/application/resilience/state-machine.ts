import { Effect } from 'effect';

export interface StateMachine<S, E, R> {
  readonly initial: S;
  readonly step: (state: S) => Effect.Effect<{ readonly next: S; readonly done: boolean }, E, R>;
}

/**
 * Run a state machine as a tail-recursive Effect fold.
 *
 * Each `step` returns `{ next, done }`. When `done` is true, the loop
 * terminates and **returns `next`** — the converging step's state is
 * preserved as the final value, not discarded. This is the natural shape
 * for an improvement loop whose terminal step is the one that detected
 * convergence: that step's `nextState` carries the converged flag and
 * convergence reason and must reach the caller.
 *
 * Note: an earlier version of this adapter routed through `runHyloEffect`,
 * but a hylomorphism's anamorphism cannot emit a terminal value — its
 * `done: true` branch carries no payload. That made the converging
 * iteration's state vanish, leaving the dogfood ledger reporting
 * `converged: false` even after the FSM converged. The direct recursive
 * shape models terminal-value semantics correctly and is simpler.
 */
export function runStateMachine<S, E, R>(machine: StateMachine<S, E, R>): Effect.Effect<S, E, R> {
  const loop = (state: S): Effect.Effect<S, E, R> =>
    Effect.gen(function* () {
      const result = yield* machine.step(state);
      return result.done ? result.next : yield* loop(result.next);
    });
  return loop(machine.initial);
}

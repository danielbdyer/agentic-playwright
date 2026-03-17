import { Effect } from 'effect';

export interface StateMachine<S, E, R> {
  readonly initial: S;
  readonly step: (state: S) => Effect.Effect<{ readonly next: S; readonly done: boolean }, E, R>;
}

export function runStateMachine<S, E, R>(machine: StateMachine<S, E, R>): Effect.Effect<S, E, R> {
  const loop = (state: S): Effect.Effect<S, E, R> =>
    Effect.gen(function* () {
      const result = yield* machine.step(state);
      return result.done ? result.next : yield* loop(result.next);
    });
  return loop(machine.initial);
}

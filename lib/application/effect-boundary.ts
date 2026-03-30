import { Effect } from 'effect';

/**
 * Dedicated application boundary for escaping Effect programs to Promise.
 *
 * Keep `Effect.runPromise` usage centralized in this module.
 */
export function runEffectPromiseBoundary<A, E>(program: Effect.Effect<A, E>): Promise<A> {
  return Effect.runPromise(program);
}

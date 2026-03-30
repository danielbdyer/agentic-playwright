import { Effect } from 'effect';

/**
 * Dedicated runtime boundary for imperative callback handoff (timers, WS handlers).
 * Keeps callback sites free of unsafe queue operations.
 */
export const runForkFromRuntimeBoundary = (effect: Effect.Effect<unknown, never, never>): void => {
  Effect.runFork(effect);
};

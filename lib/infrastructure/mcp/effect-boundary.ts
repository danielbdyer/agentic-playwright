import { Effect } from 'effect';

/**
 * Dedicated Effect runner boundary for synchronous MCP handlers.
 *
 * Keep all `Effect.runSync` usage centralized in this module so boundary
 * governance is explicit and lintable.
 */
export function runEffectSyncBoundary<A>(program: Effect.Effect<A>): A {
  return Effect.runSync(program);
}

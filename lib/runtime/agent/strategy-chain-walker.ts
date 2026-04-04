/**
 * Strategy Chain Walker — discovered combinator that unifies the resolution
 * pipeline's rung-by-rung walk with the free search trail.
 *
 * The resolution pipeline walks strategies in precedence order, tries each,
 * records an exhaustion entry, and short-circuits on success. This is the
 * freeSearch from Duality 2 specialized to resolution rungs, producing
 * ResolutionExhaustionEntry trail steps.
 *
 * This combinator bridges the abstract free-forgetful algebra with the
 * concrete resolution domain types.
 *
 * @see lib/domain/algebra/free-forgetful.ts
 * @see docs/design-calculus.md § Abstraction 1 + Duality 2
 */

import type { ResolutionExhaustionEntry } from '../../domain/types/resolution';
import type { SearchTrail, TrailStep } from '../../domain/algebra/free-forgetful';
import { freeSearch } from '../../domain/algebra/free-forgetful';

/**
 * A strategy to be tried at a given rung.
 *
 * @typeParam T - The result type on success
 */
export interface RungStrategy<T> {
  readonly rung: ResolutionExhaustionEntry['stage'];
  readonly try: () => RungAttemptResult<T>;
}

export type RungAttemptResult<T> =
  | { readonly outcome: 'resolved'; readonly value: T; readonly reason: string }
  | { readonly outcome: 'failed'; readonly reason: string }
  | { readonly outcome: 'skipped'; readonly reason: string }
  | { readonly outcome: 'attempted'; readonly reason: string };

/**
 * Walk a chain of rung strategies in order, recording the exhaustion trail.
 * Returns both the search trail (for the free monad) and the
 * ResolutionExhaustionEntry[] (for the receipt).
 */
export function walkStrategyChain<T>(
  strategies: ReadonlyArray<RungStrategy<T>>,
): {
  readonly trail: SearchTrail<RungStrategy<T>, RungAttemptResult<T>, T>;
  readonly exhaustion: ReadonlyArray<ResolutionExhaustionEntry>;
  readonly result: T | null;
} {
  const trail = freeSearch(strategies, (strategy) => {
    const attempt = strategy.try();
    return {
      outcome: attempt,
      result: attempt.outcome === 'resolved' ? (attempt as { value: T }).value : null,
    };
  });

  const exhaustion: ResolutionExhaustionEntry[] = trail.steps.map(
    (step: TrailStep<RungStrategy<T>, RungAttemptResult<T>>) => ({
      stage: step.candidate.rung,
      outcome: step.outcome.outcome,
      reason: step.outcome.reason,
    }),
  );

  return { trail, exhaustion, result: trail.result };
}

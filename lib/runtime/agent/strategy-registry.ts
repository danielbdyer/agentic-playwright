/**
 * Strategy Registry — GoF Strategy with registry lookup.
 *
 * Maps `ResolutionPrecedenceRung → ResolutionStrategy` so that:
 * - the resolution ladder iterates the registry in rung order;
 * - new rungs add a strategy entry without modifying the orchestrator;
 * - lookup is O(1) via `ReadonlyMap`;
 * - registration returns a new registry (immutable).
 */

import {
  resolutionPrecedenceLaw,
  type ResolutionPrecedenceRung,
} from '../../domain/precedence';
import type { ResolutionStrategy } from './strategy';

// ─── Public interface ────────────────────────────────────────────────────

export interface StrategyRegistry {
  /** O(1) lookup by rung. */
  readonly lookup: (rung: ResolutionPrecedenceRung) => ResolutionStrategy | undefined;

  /** Strategies in precedence order (explicit → needs-human). */
  readonly strategiesInOrder: () => readonly ResolutionStrategy[];

  /** All rungs that have a registered strategy. */
  readonly registeredRungs: () => readonly ResolutionPrecedenceRung[];

  /** Total function check: true when every rung in the precedence law has a strategy. */
  readonly isTotal: () => boolean;

  /** Return a new registry with `strategy` registered for each of its declared rungs. */
  readonly register: (strategy: ResolutionStrategy) => StrategyRegistry;
}

// ─── Construction ────────────────────────────────────────────────────────

/**
 * Build a registry from the canonical precedence law and an initial set of
 * strategies. Each strategy declares the rungs it covers via `strategy.rungs`.
 */
export function createStrategyRegistry(
  strategies: readonly ResolutionStrategy[] = [],
): StrategyRegistry {
  const rungMap: ReadonlyMap<ResolutionPrecedenceRung, ResolutionStrategy> =
    strategies.reduce(
      (acc, strategy) =>
        strategy.rungs.reduce(
          (inner, rung) => new Map([...inner, [rung, strategy]]),
          acc,
        ),
      new Map<ResolutionPrecedenceRung, ResolutionStrategy>(),
    );

  return buildRegistry(rungMap);
}

// ─── Internal ────────────────────────────────────────────────────────────

function buildRegistry(
  rungMap: ReadonlyMap<ResolutionPrecedenceRung, ResolutionStrategy>,
): StrategyRegistry {
  const lookup = (rung: ResolutionPrecedenceRung): ResolutionStrategy | undefined =>
    rungMap.get(rung);

  const strategiesInOrder = (): readonly ResolutionStrategy[] => {
    const seen = new Set<string>();
    return resolutionPrecedenceLaw.reduce<readonly ResolutionStrategy[]>(
      (acc, rung) => {
        const strategy = rungMap.get(rung);
        if (strategy && !seen.has(strategy.name)) {
          seen.add(strategy.name);
          return [...acc, strategy];
        }
        return acc;
      },
      [],
    );
  };

  const registeredRungs = (): readonly ResolutionPrecedenceRung[] =>
    resolutionPrecedenceLaw.filter((rung) => rungMap.has(rung));

  const isTotal = (): boolean =>
    resolutionPrecedenceLaw.every((rung) => rungMap.has(rung));

  const register = (strategy: ResolutionStrategy): StrategyRegistry => {
    const updated = strategy.rungs.reduce(
      (acc, rung) => new Map([...acc, [rung, strategy]]),
      new Map(rungMap),
    );
    return buildRegistry(updated);
  };

  return { lookup, strategiesInOrder, registeredRungs, isTotal, register };
}

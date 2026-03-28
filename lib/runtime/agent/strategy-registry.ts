import type { ResolutionPrecedenceRung } from '../../domain/precedence';
import { resolutionPrecedenceLaw } from '../../domain/precedence';
import type { ResolutionStrategy } from './strategy';

/**
 * Immutable registry that maps ResolutionPrecedenceRung → ResolutionStrategy.
 *
 * GoF Strategy pattern with registry lookup: strategies register themselves,
 * and the resolution ladder iterates the registry in rung order.
 * New rungs add a strategy entry without modifying the orchestrator.
 *
 * Invariants:
 *   - Registry is a total function over all valid rungs (every rung has a strategy)
 *   - Rung ordering is always preserved (iteration follows resolutionPrecedenceLaw)
 *   - Registration returns a new registry (immutability)
 *   - Lookup is O(1) via Map
 */
export interface StrategyRegistry {
  /** O(1) lookup of the strategy for a given rung. */
  readonly lookup: (rung: ResolutionPrecedenceRung) => ResolutionStrategy | undefined;
  /** All entries in precedence order. */
  readonly entries: () => ReadonlyArray<StrategyRegistryEntry>;
  /** The set of rungs that have registered strategies. */
  readonly registeredRungs: () => ReadonlyArray<ResolutionPrecedenceRung>;
  /** True when every rung in the precedence law has an entry. */
  readonly isTotal: () => boolean;
  /** Number of registered strategies. */
  readonly size: number;
}

export interface StrategyRegistryEntry {
  readonly rung: ResolutionPrecedenceRung;
  readonly strategy: ResolutionStrategy;
}

/**
 * Create a new StrategyRegistry by registering a strategy for the given rung.
 * Returns a fresh registry — the original is never mutated.
 */
export function registerStrategy(
  registry: StrategyRegistry,
  rung: ResolutionPrecedenceRung,
  strategy: ResolutionStrategy,
): StrategyRegistry {
  const updatedMap = new Map(
    registry.entries().map((entry) => [entry.rung, entry.strategy] as const),
  );
  updatedMap.set(rung, strategy);
  return createRegistryFromMap(updatedMap);
}

/**
 * Create a StrategyRegistry from an array of (rung, strategy) pairs.
 * Duplicate rungs: last writer wins.
 */
export function createStrategyRegistry(
  entries: ReadonlyArray<readonly [ResolutionPrecedenceRung, ResolutionStrategy]>,
): StrategyRegistry {
  const map = new Map<ResolutionPrecedenceRung, ResolutionStrategy>();
  for (const [rung, strategy] of entries) {
    map.set(rung, strategy);
  }
  return createRegistryFromMap(map);
}

/** Create an empty StrategyRegistry. */
export function emptyStrategyRegistry(): StrategyRegistry {
  return createRegistryFromMap(new Map());
}

/**
 * Internal constructor: builds a frozen StrategyRegistry from a Map.
 * The Map is defensively copied so callers cannot mutate internal state.
 */
function createRegistryFromMap(
  source: ReadonlyMap<ResolutionPrecedenceRung, ResolutionStrategy>,
): StrategyRegistry {
  const internal = new Map(source);
  return {
    lookup: (rung) => internal.get(rung),
    entries: () =>
      resolutionPrecedenceLaw
        .filter((rung) => internal.has(rung))
        .map((rung) => ({ rung, strategy: internal.get(rung)! })),
    registeredRungs: () =>
      resolutionPrecedenceLaw.filter((rung) => internal.has(rung)),
    isTotal: () =>
      resolutionPrecedenceLaw.every((rung) => internal.has(rung)),
    size: internal.size,
  };
}

/**
 * Iterate the registry in precedence order, yielding only rungs with strategies.
 * This is the primary consumption API: the resolution ladder calls this
 * instead of hard-coding the strategy list.
 */
export function strategiesInPrecedenceOrder(
  registry: StrategyRegistry,
): ReadonlyArray<ResolutionStrategy> {
  return registry.entries().map((entry) => entry.strategy);
}

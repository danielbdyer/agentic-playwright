/**
 * Concurrent Graph Node Building (W5.16)
 *
 * Demonstrates the Effect.all pattern for parallelizing independent
 * graph node collection builds. Independent node kinds (routes, screens,
 * surfaces, targets, snapshots) can be built concurrently via Effect.all,
 * while edge construction—which depends on completed nodes—stays sequential.
 *
 * Reduces graph build from O(Σ node_kinds) to O(max node_kind).
 */

import { Effect } from 'effect';

// ─── Types ───

export interface GraphNodeCollection<T = unknown> {
  readonly kind: string;
  readonly nodes: readonly T[];
}

export interface ConcurrentBuildResult<T = unknown> {
  readonly collections: Readonly<Record<string, GraphNodeCollection<T>>>;
  readonly buildOrder: readonly string[];
}

// ─── Pure Functions ───

/**
 * Build graph node collections concurrently using Effect.all.
 *
 * Each builder is an Effect that produces a GraphNodeCollection.
 * All builders run in parallel (or as concurrent as the runtime allows).
 * Returns a record keyed by collection kind.
 */
export function buildNodesConcurrently<T, E, R>(
  builders: Readonly<Record<string, Effect.Effect<GraphNodeCollection<T>, E, R>>>,
): Effect.Effect<ConcurrentBuildResult<T>, E, R> {
  return Effect.gen(function* () {
    const results = yield* Effect.all(builders, { concurrency: 'unbounded' });
    const entries = Object.entries(results) as ReadonlyArray<readonly [string, GraphNodeCollection<T>]>;
    const collections = Object.fromEntries(entries) as Record<string, GraphNodeCollection<T>>;
    const buildOrder = entries.map(([kind]) => kind);
    return { collections, buildOrder } as ConcurrentBuildResult<T>;
  });
}

/**
 * Build graph node collections sequentially (for comparison/testing).
 * Produces identical results to concurrent build but in deterministic order.
 */
export function buildNodesSequentially<T, E, R>(
  builders: Readonly<Record<string, Effect.Effect<GraphNodeCollection<T>, E, R>>>,
): Effect.Effect<ConcurrentBuildResult<T>, E, R> {
  return Effect.gen(function* () {
    const builderEntries = Object.entries(builders) as readonly (readonly [string, Effect.Effect<GraphNodeCollection<T>, E, R>])[];
    const step = (
      remaining: readonly (readonly [string, Effect.Effect<GraphNodeCollection<T>, E, R>])[],
      acc: readonly (readonly [string, GraphNodeCollection<T>])[],
    ): Effect.Effect<readonly (readonly [string, GraphNodeCollection<T>])[], E, R> =>
      Effect.gen(function* () {
        if (remaining.length === 0) return acc;
        const head = remaining[0]!;
        const rest = remaining.slice(1);
        const result = yield* head[1];
        return yield* step(rest, [...acc, [head[0], result] as const]);
      });
    const entries = yield* step(builderEntries, []);
    const collections = Object.fromEntries(entries) as Record<string, GraphNodeCollection<T>>;
    const buildOrder = entries.map(([kind]) => kind);
    return { collections, buildOrder } as ConcurrentBuildResult<T>;
  });
}

/**
 * Compute a deterministic fingerprint for a build result.
 * Sorts by kind to ensure order-independence.
 */
export function fingerprintBuildResult<T>(result: ConcurrentBuildResult<T>): string {
  const sorted = Object.entries(result.collections)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([kind, collection]) => `${kind}:${collection.nodes.length}`);
  return sorted.join('|');
}

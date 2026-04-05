/**
 * Structured Concurrency for Discovery Harvesting (W5.14)
 *
 * Provides bounded-concurrency screen harvesting using Effect.forEach,
 * with safe concurrent reads of shared state (SelectorCanon, knowledge catalog)
 * via Effect Ref, and a pure associative merge for post-harvest result combination.
 */

import { Effect, Ref } from 'effect';
import type { ScreenId } from '../../domain/kernel/identity';
import type { SelectorCanon } from '../../domain/target/interface-graph';
import { concatAll, type Monoid } from '../../domain/algebra/monoid';
import { sortedReadonlyArrayMonoid, structMonoid, sumMonoid } from '../../domain/algebra/envelope-mergers';
import { resolveEffectConcurrency } from '../runtime-support/concurrency';

// ─── Types ───

/** A single proposal discovered during screen harvesting. */
export interface HarvestProposal {
  readonly screen: ScreenId;
  readonly targetRef: string;
  readonly kind: 'new-element' | 'new-surface' | 'selector-update' | 'posture-update';
  readonly confidence: number;
  readonly detail: string;
}

/** Result of harvesting a single screen. */
export interface HarvestResult {
  readonly screen: ScreenId;
  readonly proposals: readonly HarvestProposal[];
  readonly elementsDiscovered: number;
  readonly surfacesDiscovered: number;
  readonly durationMs: number;
  readonly error: string | null;
}

/** Merged result from harvesting multiple screens. */
export interface MergedHarvestResult {
  readonly screens: readonly ScreenId[];
  readonly proposals: readonly HarvestProposal[];
  readonly totalElementsDiscovered: number;
  readonly totalSurfacesDiscovered: number;
  readonly totalDurationMs: number;
  readonly errorCount: number;
  readonly errors: readonly { readonly screen: ScreenId; readonly message: string }[];
}

/** Shared catalog state accessible via Effect Ref during concurrent harvesting. */
export interface HarvestSharedState {
  readonly selectorCanon: SelectorCanon;
  readonly knowledgeCatalog: Readonly<Record<string, unknown>>;
}

// ─── Merge (pure, associative) ───

export const mergedHarvestResultMonoid: Monoid<MergedHarvestResult> = structMonoid<MergedHarvestResult>({
  screens: sortedReadonlyArrayMonoid((screen) => screen as string),
  proposals: sortedReadonlyArrayMonoid((proposal) => `${proposal.screen}:${proposal.targetRef}:${proposal.kind}`),
  totalElementsDiscovered: sumMonoid,
  totalSurfacesDiscovered: sumMonoid,
  totalDurationMs: sumMonoid,
  errorCount: sumMonoid,
  errors: sortedReadonlyArrayMonoid((error) => `${error.screen}:${error.message}`),
});

/** Empty harvest result — identity element for merge. */
export const EMPTY_MERGED_HARVEST: MergedHarvestResult = mergedHarvestResultMonoid.empty;

/**
 * Merge two MergedHarvestResults. This operation is associative:
 *   merge(merge(a, b), c) === merge(a, merge(b, c))
 */
export function mergeTwoHarvestResults(
  a: MergedHarvestResult,
  b: MergedHarvestResult,
): MergedHarvestResult {
  return mergedHarvestResultMonoid.combine(a, b);
}

/**
 * Lift a single HarvestResult into a MergedHarvestResult.
 */
export function liftHarvestResult(result: HarvestResult): MergedHarvestResult {
  return {
    screens: [result.screen],
    proposals: [...result.proposals],
    totalElementsDiscovered: result.elementsDiscovered,
    totalSurfacesDiscovered: result.surfacesDiscovered,
    totalDurationMs: result.durationMs,
    errorCount: result.error !== null ? 1 : 0,
    errors: result.error !== null
      ? [{ screen: result.screen, message: result.error }]
      : [],
  };
}

/**
 * Merge an array of HarvestResults into a single MergedHarvestResult.
 *
 * Pure fold over the array using the associative merge operation.
 */
export function mergeHarvestResults(
  results: readonly HarvestResult[],
): MergedHarvestResult {
  return concatAll(mergedHarvestResultMonoid, results.map(liftHarvestResult));
}

// ─── Concurrent Harvesting ───

/**
 * Harvest multiple screens concurrently with bounded concurrency.
 *
 * Shared state (SelectorCanon, knowledge catalog) is accessed via Effect Ref
 * for safe concurrent reads. Each screen's harvest function receives a read-only
 * snapshot of shared state.
 *
 * @param screens - Screen IDs to harvest
 * @param harvestFn - Effect-returning function that harvests a single screen
 * @param concurrency - Maximum concurrent harvests (default: 4, or from env/CPU)
 */
export function harvestScreensConcurrently<E, R>(
  screens: readonly ScreenId[],
  harvestFn: (
    screen: ScreenId,
    sharedState: HarvestSharedState,
  ) => Effect.Effect<HarvestResult, E, R>,
  options?: {
    readonly concurrency?: number;
    readonly sharedState?: HarvestSharedState;
  },
): Effect.Effect<readonly HarvestResult[], E, R> {
  const concurrency = options?.concurrency ?? resolveEffectConcurrency({ ceiling: 4 });
  const defaultSharedState: HarvestSharedState = {
    selectorCanon: {
      kind: 'selector-canon',
      version: 1,
      generatedAt: new Date().toISOString(),
      fingerprint: '',
      entries: [],
      summary: {
        totalTargets: 0,
        totalProbes: 0,
        approvedKnowledgeProbeCount: 0,
        discoveryProbeCount: 0,
        degradedProbeCount: 0,
        healthyProbeCount: 0,
      },
    },
    knowledgeCatalog: {},
  };
  const initialState = options?.sharedState ?? defaultSharedState;

  return Effect.gen(function* () {
    const stateRef = yield* Ref.make(initialState);

    const results = yield* Effect.forEach(
      screens,
      (screen) =>
        Effect.gen(function* () {
          const currentState = yield* Ref.get(stateRef);
          return yield* harvestFn(screen, currentState);
        }),
      { concurrency },
    );

    return results;
  });
}

/**
 * Harvest screens concurrently and merge results into a single MergedHarvestResult.
 */
export function harvestAndMerge<E, R>(
  screens: readonly ScreenId[],
  harvestFn: (
    screen: ScreenId,
    sharedState: HarvestSharedState,
  ) => Effect.Effect<HarvestResult, E, R>,
  options?: {
    readonly concurrency?: number;
    readonly sharedState?: HarvestSharedState;
  },
): Effect.Effect<MergedHarvestResult, E, R> {
  return Effect.map(
    harvestScreensConcurrently(screens, harvestFn, options),
    mergeHarvestResults,
  );
}

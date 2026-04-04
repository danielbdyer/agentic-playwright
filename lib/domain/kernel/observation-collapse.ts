/**
 * Observation Collapse combinator — the named abstraction for the
 * extract → aggregate → signal pattern that recurs across the codebase.
 *
 * The pattern has three stages:
 *   1. Extract: pull relevant observations from a heterogeneous receipt stream
 *   2. Aggregate: fold observations into a domain-specific index (the monoid homomorphism)
 *   3. Signal: derive a signal from the aggregate (the monotone extraction)
 *
 * Composable: multiple collapse pipelines can run in parallel on the
 * same receipt stream, and their signals can be combined via the
 * tropical semiring (min for urgency, + for cost accumulation).
 *
 * @see docs/design-calculus.md § Abstraction 2: Observation Collapse
 */

/**
 * A single observation collapse pipeline.
 *
 * @typeParam R - Receipt type (input)
 * @typeParam O - Observation type (extracted)
 * @typeParam A - Aggregate type (folded)
 * @typeParam S - Signal type (derived)
 */
export interface ObservationCollapse<R, O, A, S> {
  /** Extract relevant observations from a receipt stream. */
  readonly extract: (receipts: ReadonlyArray<R>) => ReadonlyArray<O>;
  /** Fold observations into an aggregate index. */
  readonly aggregate: (observations: ReadonlyArray<O>, prior: A | null) => A;
  /** Derive a signal from the aggregate. */
  readonly signal: (aggregate: A) => S;
}

/**
 * Run a single observation collapse pipeline end-to-end.
 */
export function collapseObservations<R, O, A, S>(
  pipeline: ObservationCollapse<R, O, A, S>,
  receipts: ReadonlyArray<R>,
  prior: A | null,
): { readonly aggregate: A; readonly signal: S } {
  const observations = pipeline.extract(receipts);
  const aggregate = pipeline.aggregate(observations, prior);
  const signal = pipeline.signal(aggregate);
  return { aggregate, signal };
}

/**
 * Run multiple observation collapse pipelines in parallel on the same
 * receipt stream. Returns a record of results keyed by pipeline name.
 *
 * This is the product of observation collapses — the formal backing of
 * catamorphism fusion. Running N pipelines over the same receipts
 * produces N results in a single conceptual pass.
 */
export function collapseAll<R, Results extends Record<string, { readonly aggregate: unknown; readonly signal: unknown }>>(
  pipelines: { readonly [K in keyof Results]: ObservationCollapse<R, unknown, Results[K]['aggregate'], Results[K]['signal']> },
  receipts: ReadonlyArray<R>,
  priors: { readonly [K in keyof Results]?: Results[K]['aggregate'] | null },
): Results {
  const result = {} as Record<string, { aggregate: unknown; signal: unknown }>;
  for (const [key, pipeline] of Object.entries(pipelines)) {
    result[key] = collapseObservations(
      pipeline as ObservationCollapse<R, unknown, unknown, unknown>,
      receipts,
      (priors as Record<string, unknown>)[key] ?? null,
    );
  }
  return result as Results;
}

/**
 * Compose two observation collapse pipelines sequentially:
 * the first pipeline's signal becomes the second pipeline's input.
 */
export function chainCollapse<R, O1, A1, S1, O2, A2, S2>(
  first: ObservationCollapse<R, O1, A1, S1>,
  second: ObservationCollapse<S1, O2, A2, S2>,
): {
  readonly run: (receipts: ReadonlyArray<R>, prior1: A1 | null, prior2: A2 | null) => {
    readonly firstAggregate: A1;
    readonly secondAggregate: A2;
    readonly signal: S2;
  };
} {
  return {
    run: (receipts, prior1, prior2) => {
      const step1 = collapseObservations(first, receipts, prior1);
      const step2 = collapseObservations(second, [step1.signal], prior2);
      return {
        firstAggregate: step1.aggregate,
        secondAggregate: step2.aggregate,
        signal: step2.signal,
      };
    },
  };
}

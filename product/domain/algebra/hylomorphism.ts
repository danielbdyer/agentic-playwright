/**
 * Hylomorphism — the composition of an anamorphism (unfold) and a
 * catamorphism (fold), with deforestation of the intermediate structure.
 *
 * hylo(φ, ψ) = cata(φ) ∘ ana(ψ)
 *
 * Instead of generating a list and then folding it, the hylomorphism
 * folds each element as it is generated — no intermediate list.
 *
 * This is the formal backing of "streaming improvement loops": instead of
 * collecting all iteration results and then folding into a scorecard,
 * fold each iteration's result into the accumulator on the fly.
 *
 * @see docs/design-calculus.md § Duality 1: Fold / Unfold (hylomorphism)
 */

/**
 * The unfold step: given a seed, either produce an element and a new seed,
 * or terminate.
 *
 * @typeParam S - Seed type (the state that drives generation)
 * @typeParam T - Element type (what each step produces)
 */
export type UnfoldStep<S, T> =
  | { readonly done: false; readonly value: T; readonly next: S }
  | { readonly done: true };

/**
 * A hylomorphism definition — an unfold (anamorphism) composed with
 * a fold (catamorphism), with the intermediate list deforested.
 *
 * @typeParam S - Seed/state type for the unfold
 * @typeParam T - Intermediate element type (generated then consumed)
 * @typeParam A - Accumulator type for the fold
 */
export interface Hylomorphism<S, T, A> {
  /** Initial seed for the unfold. */
  readonly seed: S;
  /** Unfold step: produce one element or terminate. */
  readonly unfold: (state: S) => UnfoldStep<S, T>;
  /** Fold initial value. */
  readonly initial: A;
  /** Fold step: consume one element. */
  readonly step: (acc: A, item: T) => A;
}

/**
 * Run a hylomorphism — unfold and fold in a single pass with no
 * intermediate structure.
 *
 * This is `hylo(φ, ψ)(seed)`:
 *   - ψ generates elements from the seed (anamorphism)
 *   - φ consumes elements into the accumulator (catamorphism)
 *   - No intermediate list is allocated (deforestation)
 */
export function runHylo<S, T, A>(hylo: Hylomorphism<S, T, A>): A {
  const loop = (state: S, acc: A): A => {
    const result = hylo.unfold(state);
    if (result.done) return acc;
    return loop(result.next, hylo.step(acc, result.value));
  };
  return loop(hylo.seed, hylo.initial);
}

/**
 * Run a hylomorphism, collecting each intermediate accumulator state.
 * Useful for debugging and visualization.
 */
export function traceHylo<S, T, A>(hylo: Hylomorphism<S, T, A>): ReadonlyArray<A> {
  const loop = (state: S, acc: A, trace: ReadonlyArray<A>): ReadonlyArray<A> => {
    const result = hylo.unfold(state);
    if (result.done) return trace;
    const next = hylo.step(acc, result.value);
    return loop(result.next, next, [...trace, next]);
  };
  return [hylo.initial, ...loop(hylo.seed, hylo.initial, [])];
}

/**
 * Run an async hylomorphism — the same unfold/fold deforestation, but
 * where the unfold step is asynchronous. This is needed for loops
 * where each iteration performs I/O (Playwright execution, file system,
 * network, etc.).
 *
 * The fold step remains pure since accumulation is deterministic.
 * No intermediate array is allocated (deforestation preserved).
 *
 * Integrates with Effect via `Effect.promise(() => runHyloAsync(...))`.
 *
 * @see docs/design-calculus.md § Duality 1: Fold / Unfold (hylomorphism)
 */
export function runHyloAsync<S, T, A>(
  seed: S,
  initial: A,
  unfold: (state: S) => Promise<UnfoldStep<S, T>>,
  step: (acc: A, item: T) => A,
): Promise<A> {
  const loop = async (state: S, acc: A): Promise<A> => {
    const result = await unfold(state);
    if (result.done) return acc;
    return loop(result.next, step(acc, result.value));
  };
  return loop(seed, initial);
}

/**
 * Run an Effect-based hylomorphism — the unfold returns an Effect instead
 * of a Promise, preserving the Effect dependency context (R) and error
 * channel (E). The fold step remains pure.
 *
 * This is the primary integration point for streaming improvement loops
 * that need Effect services (FileSystem, Dashboard, VersionControl, etc.).
 *
 * @see docs/design-calculus.md § Duality 1: Fold / Unfold (hylomorphism)
 */
import { Effect } from 'effect';

export function runHyloEffect<S, T, A, E, R>(
  seed: S,
  initial: A,
  unfold: (state: S) => Effect.Effect<UnfoldStep<S, T>, E, R>,
  step: (acc: A, item: T) => A,
): Effect.Effect<A, E, R> {
  const loop = (state: S, acc: A): Effect.Effect<A, E, R> =>
    Effect.gen(function* () {
      const result = yield* unfold(state);
      if (result.done) return acc;
      return yield* loop(result.next, step(acc, result.value));
    });
  return loop(seed, initial);
}

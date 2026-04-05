/**
 * Free / Forgetful adjunction — the duality between exhaustion trails
 * (free monad, remembers everything) and final bindings (forgetful
 * functor, keeps only the result).
 *
 * Given a search process `F`, the free monad `Free F a` is the full
 * tree of attempts. The forgetful functor extracts just the result.
 * The adjunction guarantees:
 *
 *   resolve = forget ∘ freeResolve
 *
 * Meaning: the trail is lossless, and the final binding is uniquely
 * determined by the trail.
 *
 * @see docs/design-calculus.md § Duality 2: Free / Forgetful
 */

/**
 * One step in a search trail — a candidate tried and its outcome.
 *
 * @typeParam C - Candidate type
 * @typeParam O - Outcome type
 */
export interface TrailStep<C, O> {
  readonly candidate: C;
  readonly outcome: O;
}

/**
 * A search trail — the free monad's trace. Records every candidate
 * tried and every outcome observed, in order.
 *
 * @typeParam C - Candidate type
 * @typeParam O - Outcome type
 * @typeParam R - Result type (the winner, if found)
 */
export interface SearchTrail<C, O, R> {
  readonly steps: ReadonlyArray<TrailStep<C, O>>;
  readonly result: R | null;
}

/**
 * The forgetful functor: extract just the result from a trail.
 */
export function forget<C, O, R>(trail: SearchTrail<C, O, R>): R | null {
  return trail.result;
}

/**
 * Run a search, producing a trail (the free monad's trace).
 *
 * Given a list of candidates and a try function, walk each candidate
 * in order. If `tryCandidate` returns a result, the search terminates.
 * The full trail is always returned.
 *
 * This is the universal property of the free monad: the search
 * process is described independently of its interpretation.
 */
export function freeSearch<C, O, R>(
  candidates: ReadonlyArray<C>,
  tryCandidate: (candidate: C) => { readonly outcome: O; readonly result: R | null },
): SearchTrail<C, O, R> {
  const search = (
    remaining: ReadonlyArray<C>,
    acc: ReadonlyArray<TrailStep<C, O>>,
  ): SearchTrail<C, O, R> => {
    if (remaining.length === 0) {
      return { steps: acc, result: null };
    }
    const [candidate, ...rest] = remaining;
    const { outcome, result } = tryCandidate(candidate!);
    const step: TrailStep<C, O> = { candidate: candidate!, outcome };
    if (result !== null) {
      return { steps: [...acc, step], result };
    }
    return search(rest, [...acc, step]);
  };
  return search(candidates, []);
}

/**
 * Async variant of freeSearch — for search processes that need I/O
 * (e.g., resolution strategies that hit the DOM or filesystem).
 *
 * Same free monad semantics: the trail is lossless, and the result
 * is uniquely determined by the trail.
 */
export async function freeSearchAsync<C, O, R>(
  candidates: ReadonlyArray<C>,
  tryCandidate: (candidate: C) => Promise<{ readonly outcome: O; readonly result: R | null }>,
): Promise<SearchTrail<C, O, R>> {
  const search = async (
    remaining: ReadonlyArray<C>,
    acc: ReadonlyArray<TrailStep<C, O>>,
  ): Promise<SearchTrail<C, O, R>> => {
    if (remaining.length === 0) {
      return { steps: acc, result: null };
    }
    const [candidate, ...rest] = remaining;
    const { outcome, result } = await tryCandidate(candidate!);
    const step: TrailStep<C, O> = { candidate: candidate!, outcome };
    if (result !== null) {
      return { steps: [...acc, step], result };
    }
    return search(rest, [...acc, step]);
  };
  return search(candidates, []);
}

/**
 * Replay a trail with a different interpreter.
 *
 * This is the key property of the free monad: the trail is a
 * replayable program that can be interpreted by different consumers
 * (testing, analysis, visualization).
 */
export function replayTrail<C, O, R>(
  trail: SearchTrail<C, O, R>,
  interpret: (step: TrailStep<C, O>, index: number) => void,
): void {
  trail.steps.forEach(interpret);
}

/**
 * Compute coverage: what fraction of candidates were tried?
 */
export function trailCoverage<C, O, R>(
  trail: SearchTrail<C, O, R>,
  totalCandidates: number,
): number {
  return totalCandidates > 0 ? trail.steps.length / totalCandidates : 0;
}

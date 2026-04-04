/**
 * Product Fold — catamorphism fusion for composable folds.
 *
 * When multiple folds traverse the same structure, they can be fused
 * into a single fold with a product carrier:
 *
 *   cata(φ₁) △ cata(φ₂) = cata(φ₁ △ φ₂)
 *
 * This module provides the infrastructure for defining folds as values
 * and composing them via the product (fan-out) operation.
 *
 * @see docs/design-calculus.md § Collapse 4: The Three Catamorphisms Are One Product Fold
 */

/**
 * A fold (catamorphism) over a list, defined as a value.
 *
 * @typeParam T - Element type (the F-algebra's carrier input)
 * @typeParam A - Accumulator type (the carrier)
 */
export interface Fold<T, A> {
  /** Initial accumulator (the algebra's zero). */
  readonly initial: A;
  /** Combining function (the algebra's step). */
  readonly step: (acc: A, item: T) => A;
}

/**
 * Run a fold over a list. This is `cata(φ)` applied to a free monoid (list).
 */
export function runFold<T, A>(fold: Fold<T, A>, items: ReadonlyArray<T>): A {
  return items.reduce(fold.step, fold.initial);
}

/**
 * Product of two folds — the fan-out `φ₁ △ φ₂`.
 * Runs both folds in a single traversal.
 */
export function productFold<T, A, B>(
  foldA: Fold<T, A>,
  foldB: Fold<T, B>,
): Fold<T, readonly [A, B]> {
  return {
    initial: [foldA.initial, foldB.initial] as const,
    step: (acc, item) => [
      foldA.step(acc[0], item),
      foldB.step(acc[1], item),
    ] as const,
  };
}

/**
 * Product of three folds — `φ₁ △ φ₂ △ φ₃`.
 * The primary use case: metrics × evidence × proposals in one pass.
 */
export function productFold3<T, A, B, C>(
  foldA: Fold<T, A>,
  foldB: Fold<T, B>,
  foldC: Fold<T, C>,
): Fold<T, readonly [A, B, C]> {
  return {
    initial: [foldA.initial, foldB.initial, foldC.initial] as const,
    step: (acc, item) => [
      foldA.step(acc[0], item),
      foldB.step(acc[1], item),
      foldC.step(acc[2], item),
    ] as const,
  };
}

/**
 * Map over a fold's result — post-composition.
 * `mapFold(φ, f)` is `f ∘ cata(φ)`.
 */
export function mapFold<T, A, B>(fold: Fold<T, A>, f: (a: A) => B): Fold<T, B> {
  return {
    initial: f(fold.initial),
    step: (acc, item) => f(fold.step(fold.initial, item)),
  };
}

/**
 * Compose a fold with a pre-processing step — pre-composition.
 * `contramapFold(φ, g)` is `cata(φ) ∘ map(g)`.
 */
export function contramapFold<T, U, A>(fold: Fold<U, A>, g: (t: T) => U): Fold<T, A> {
  return {
    initial: fold.initial,
    step: (acc, item) => fold.step(acc, g(item)),
  };
}

/**
 * Filter items before folding — a conditional catamorphism.
 */
export function filterFold<T, A>(fold: Fold<T, A>, predicate: (t: T) => boolean): Fold<T, A> {
  return {
    initial: fold.initial,
    step: (acc, item) => predicate(item) ? fold.step(acc, item) : acc,
  };
}

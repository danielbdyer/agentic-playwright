/**
 * Galois Connection — a pair of monotone maps between two partially
 * ordered sets satisfying the adjunction law.
 *
 * Given posets (A, ≤_A) and (B, ≤_B), a Galois connection is a pair
 * (α, γ) where:
 *   α : A → B  (left adjoint / abstraction)
 *   γ : B → A  (right adjoint / concretization)
 *
 * satisfying: α(a) ≤_B b  ⟺  a ≤_A γ(b)
 *
 * The primary instance in this codebase is the rung-confidence connection:
 *   α : Rung → Confidence      (minimum confidence a rung guarantees)
 *   γ : Confidence → Set<Rung>  (rungs that produce at least that confidence)
 *
 * The Galois connection guarantees:
 *   1. Both maps are monotone (order-preserving)
 *   2. α ∘ γ ≥ id  (abstracting a concrete value yields at least itself)
 *   3. γ ∘ α ≤ id  (concretizing an abstract value yields at most itself)
 *   4. α is the best approximation from below; γ from above
 *
 * @see docs/design-calculus.md § Collapse 2: Rung Provenance and Confidence Scale
 */

/**
 * A Galois connection between two ordered types.
 *
 * @typeParam A - The "concrete" domain (e.g., resolution rungs)
 * @typeParam B - The "abstract" domain (e.g., confidence levels)
 */
export interface GaloisConnection<A, B> {
  /** Left adjoint: concrete → abstract (abstraction / lower adjoint). */
  readonly alpha: (a: A) => B;
  /** Right adjoint: abstract → concrete set (concretization / upper adjoint). */
  readonly gamma: (b: B) => ReadonlySet<A>;
  /** Order on A. Returns true if a1 ≤ a2. */
  readonly orderA: (a1: A, a2: A) => boolean;
  /** Order on B. Returns true if b1 ≤ b2. */
  readonly orderB: (b1: B, b2: B) => boolean;
}

/**
 * Verify the Galois adjunction law: α(a) ≤ b ⟺ a ∈ γ(b).
 *
 * Tests this for all provided witness pairs (a, b).
 * Returns true if the law holds for all witnesses.
 */
export function verifyAdjunction<A, B>(
  gc: GaloisConnection<A, B>,
  witnesses: ReadonlyArray<readonly [A, B]>,
): boolean {
  return witnesses.every(([a, b]) => {
    const leftToRight = gc.orderB(gc.alpha(a), b) === gc.gamma(b).has(a);
    return leftToRight;
  });
}

/**
 * Verify that α is monotone: a1 ≤ a2 → α(a1) ≤ α(a2).
 */
export function verifyAlphaMonotone<A, B>(
  gc: GaloisConnection<A, B>,
  pairs: ReadonlyArray<readonly [A, A]>,
): boolean {
  return pairs.every(([a1, a2]) =>
    !gc.orderA(a1, a2) || gc.orderB(gc.alpha(a1), gc.alpha(a2)),
  );
}

/**
 * Verify the closure law: α(γ(b)) ≥ b for all b.
 * This means abstracting a concrete approximation is at least as strong.
 */
export function verifyClosureLaw<A, B>(
  gc: GaloisConnection<A, B>,
  values: ReadonlyArray<B>,
  _allA: ReadonlyArray<A>,
): boolean {
  return values.every((b) => {
    const concrete = gc.gamma(b);
    // α applied to the "best" element of γ(b) should be ≥ b
    // For set-valued γ, check that some element of γ(b) maps to ≥ b
    return concrete.size === 0 || [...concrete].some((a) => gc.orderB(b, gc.alpha(a)));
  });
}

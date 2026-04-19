/**
 * Governed Suspension — the named abstraction for the pattern where
 * a computation checks governance and either continues, suspends for
 * external input, or terminates with an explanation.
 *
 * Every human-in-the-loop interaction follows this shape:
 *   1. Check governance state of the current artifact/step/proposal
 *   2. If approved: continue computation with the approved value
 *   3. If review-required: suspend, yielding a request for input
 *   4. If blocked: terminate with explanation
 *
 * The combinator extracts the governance check + branching logic so
 * call sites express only the domain-specific parts (what to check,
 * what to request, what to explain).
 *
 * @see docs/design-calculus.md § Abstraction 4: Governed Suspension
 */

// ─── Verdict type ───

/**
 * The three-way governance verdict.
 *
 * @typeParam T - The approved/post-check value type
 * @typeParam I - The input type needed to resume from suspension
 */
export type GovernanceVerdict<T, I> =
  | { readonly _tag: 'Approved'; readonly value: T }
  | { readonly _tag: 'Suspended'; readonly needs: I; readonly reason: string }
  | { readonly _tag: 'Blocked'; readonly reason: string };

// ─── Constructors ───

export function approved<T>(value: T): GovernanceVerdict<T, never> {
  return { _tag: 'Approved', value };
}

export function suspended<I>(needs: I, reason: string): GovernanceVerdict<never, I> {
  return { _tag: 'Suspended', needs, reason };
}

export function blocked(reason: string): GovernanceVerdict<never, never> {
  return { _tag: 'Blocked', reason };
}

// ─── Fold ──���

/**
 * Exhaustive fold over a governance verdict.
 */
export function foldVerdict<T, I, R>(
  verdict: GovernanceVerdict<T, I>,
  cases: {
    readonly onApproved: (value: T) => R;
    readonly onSuspended: (needs: I, reason: string) => R;
    readonly onBlocked: (reason: string) => R;
  },
): R {
  switch (verdict._tag) {
    case 'Approved': return cases.onApproved(verdict.value);
    case 'Suspended': return cases.onSuspended(verdict.needs, verdict.reason);
    case 'Blocked': return cases.onBlocked(verdict.reason);
  }
}

// ─── Combinators ───

/**
 * Map the approved value while preserving suspension/blocked states.
 */
export function mapVerdict<T, I, U>(
  verdict: GovernanceVerdict<T, I>,
  f: (value: T) => U,
): GovernanceVerdict<U, I> {
  return verdict._tag === 'Approved'
    ? approved(f(verdict.value))
    : verdict;
}

/**
 * Chain: if approved, apply a function that may itself produce a verdict.
 * This is the monadic bind for the governance verdict.
 */
export function chainVerdict<T, I, U>(
  verdict: GovernanceVerdict<T, I>,
  f: (value: T) => GovernanceVerdict<U, I>,
): GovernanceVerdict<U, I> {
  return verdict._tag === 'Approved'
    ? f(verdict.value)
    : verdict;
}

/**
 * A gate in a verdict chain — a function that takes the current
 * approved value and returns either a new approved value or a
 * suspension/block that short-circuits the chain.
 *
 * Gates are the first-class "data" form of chained governance
 * checks. Code that previously looked like:
 *
 *     const gate1 = initial;
 *     const gate2 = chainVerdict(gate1, (v) => check1(v));
 *     const gate3 = chainVerdict(gate2, (v) => check2(v));
 *     return chainVerdict(gate3, (v) => check3(v));
 *
 * becomes:
 *
 *     return runGateChain(initial, [
 *       (v) => check1(v),
 *       (v) => check2(v),
 *       (v) => check3(v),
 *     ]);
 *
 * The gate list is ordered: the first gate runs first, each
 * approved result feeds the next gate, and the first
 * suspension/blocked verdict short-circuits the rest of the chain.
 * This is the same algebra as `runPipelinePhases` /
 * `runRecoveryChain` / `walkStrategyChainAsync` — sequential steps
 * with threaded state and early termination — but specialized to
 * the verdict monad instead of the free-forgetful iterator.
 */
export type VerdictGate<A, I> = (value: A) => GovernanceVerdict<A, I>;

/**
 * Run a list of verdict gates sequentially, short-circuiting on
 * the first suspension or blocked verdict. The type parameter `A`
 * stays the same across every gate — each gate refines the
 * approved value or rejects it.
 *
 * Pure function. Equivalent to folding `chainVerdict` over the
 * list, but makes the "gates as data" shape visible at the call
 * site. The law tests verify:
 *
 *   - empty gate list returns `approved(initial)` unchanged
 *   - if all gates approve, the final approved value is returned
 *   - a suspended gate short-circuits the chain (later gates are
 *     NOT invoked — verified via side-effect counting)
 *   - a blocked gate short-circuits the chain
 *   - identity gate list is a no-op
 */
export function runGateChain<A, I>(
  initial: A,
  gates: readonly VerdictGate<A, I>[],
): GovernanceVerdict<A, I> {
  return gates.reduce<GovernanceVerdict<A, I>>(
    (verdict, gate) => chainVerdict(verdict, gate),
    approved(initial),
  );
}

/**
 * Variant of `runGateChain` that starts from an existing verdict
 * instead of a raw value. Useful when the initial value has
 * already been through a previous chain. Short-circuits identically.
 */
export function runGateChainFrom<A, I>(
  initial: GovernanceVerdict<A, I>,
  gates: readonly VerdictGate<A, I>[],
): GovernanceVerdict<A, I> {
  return gates.reduce<GovernanceVerdict<A, I>>(
    (verdict, gate) => chainVerdict(verdict, gate),
    initial,
  );
}

/**
 * Convert a Governance string to a verdict, using the provided value
 * for the approved case and a reason generator for the others.
 */
export function fromGovernance<T>(
  governance: 'approved' | 'review-required' | 'blocked',
  value: T,
  suspensionContext?: { readonly needs: unknown; readonly reason: string },
): GovernanceVerdict<T, unknown> {
  switch (governance) {
    case 'approved': return approved(value);
    case 'review-required': return suspended(
      suspensionContext?.needs ?? { kind: 'review-required' },
      suspensionContext?.reason ?? 'Governance requires review before proceeding',
    );
    case 'blocked': return blocked('Governance has blocked this artifact');
  }
}

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

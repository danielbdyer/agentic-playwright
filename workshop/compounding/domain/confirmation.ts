/**
 * ConfirmationOutcome — the tagged outcome of evaluating a
 * Hypothesis against a cycle's evidence.
 *
 * Per docs/v2-compounding-engine-plan.md §3.3, the three outcomes:
 *
 *   - `confirmed`    — evidence backs the prediction this cycle.
 *   - `refuted`      — evidence contradicts the prediction.
 *   - `inconclusive` — insufficient evidence to decide (empty
 *                      window, below sample-size floor, etc.).
 *
 * Closed union; `foldConfirmationOutcome` is exhaustive.
 */

export type ConfirmationOutcome = 'confirmed' | 'refuted' | 'inconclusive';

/** Exhaustive ConfirmationOutcome fold. Adding a variant is a
 *  typecheck error until every call site adds the case. */
export function foldConfirmationOutcome<R>(
  outcome: ConfirmationOutcome,
  cases: {
    readonly confirmed: () => R;
    readonly refuted: () => R;
    readonly inconclusive: () => R;
  },
): R {
  switch (outcome) {
    case 'confirmed':    return cases.confirmed();
    case 'refuted':      return cases.refuted();
    case 'inconclusive': return cases.inconclusive();
  }
}

/**
 * Prediction — the closed union of claims a Hypothesis can make.
 *
 * Per docs/v2-compounding-engine-plan.md §3.1, a Hypothesis is a
 * machine-checkable bet about how the workshop's receipt stream
 * should move. Each Prediction kind is an evaluator input; the
 * evaluator (landing at Z5) reads a slice of receipts for the
 * hypothesis's cohort and returns a ConfirmationOutcome.
 *
 * Closed union discipline: adding a variant requires a case in
 * `foldPrediction` — a typecheck error until every consumer adds
 * it. No Effect imports; pure types + fold.
 *
 * Four kinds seeded for the Z1 domain:
 *
 *   - `confirmation-rate`     — "this cohort's receipts confirm at
 *                                least X over N cycles"
 *   - `receipt-family-shift`  — "receipts move from error-family F1
 *                                to F2 (or to matched/null)"
 *   - `coverage-growth`       — "probe coverage for (verb, facetKind)
 *                                rises from X to Y"
 *   - `regression-freedom`    — "these named receipts never regress"
 */

/** Predicted sustained confirmation rate over a rolling window. */
export interface ConfirmationRatePrediction {
  readonly kind: 'confirmation-rate';
  /** 0 ≤ atLeast ≤ 1. The confirmation fraction the cohort must
   *  meet or exceed across `overCycles`. */
  readonly atLeast: number;
  /** Integer ≥ 1. How many cycles the rate must sustain over. */
  readonly overCycles: number;
}

/** Predicted movement between receipt error-families. `from` is the
 *  family the cohort starts in; `to` is the family the cohort ends
 *  in (use `'matched'` for recovery-to-success predictions). */
export interface ReceiptFamilyShiftPrediction {
  readonly kind: 'receipt-family-shift';
  readonly from: string;
  readonly to: string;
}

/** Predicted coverage growth: the fraction of in-scope (verb,
 *  facetKind) tuples that have at least one passing probe receipt,
 *  moving from `fromRatio` to `toRatio`. */
export interface CoverageGrowthPrediction {
  readonly kind: 'coverage-growth';
  readonly verb: string;
  readonly facetKind: string;
  readonly fromRatio: number;
  readonly toRatio: number;
}

/** Predicted stability: the named receipt ids must stay passing.
 *  Used to encode ratchet invariants in hypothesis form. */
export interface RegressionFreedomPrediction {
  readonly kind: 'regression-freedom';
  readonly receiptIds: readonly string[];
}

/** The closed Prediction union. */
export type Prediction =
  | ConfirmationRatePrediction
  | ReceiptFamilyShiftPrediction
  | CoverageGrowthPrediction
  | RegressionFreedomPrediction;

/** Exhaustive Prediction fold. Adding a kind is a typecheck error
 *  until every call site adds the case. */
export function foldPrediction<R>(
  prediction: Prediction,
  cases: {
    readonly confirmationRate: (p: ConfirmationRatePrediction) => R;
    readonly receiptFamilyShift: (p: ReceiptFamilyShiftPrediction) => R;
    readonly coverageGrowth: (p: CoverageGrowthPrediction) => R;
    readonly regressionFreedom: (p: RegressionFreedomPrediction) => R;
  },
): R {
  switch (prediction.kind) {
    case 'confirmation-rate':    return cases.confirmationRate(prediction);
    case 'receipt-family-shift': return cases.receiptFamilyShift(prediction);
    case 'coverage-growth':      return cases.coverageGrowth(prediction);
    case 'regression-freedom':   return cases.regressionFreedom(prediction);
  }
}

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
 * Five kinds:
 *
 *   - `confirmation-rate`     — "this cohort's receipts confirm at
 *                                least X over N cycles"
 *   - `receipt-family-shift`  — "receipts move from error-family F1
 *                                to F2 (or to matched/null)"
 *   - `coverage-growth`       — "probe coverage for (verb, facetKind)
 *                                rises from X to Y"
 *   - `regression-freedom`    — "these named receipts never regress"
 *   - `intervention-fidelity` — "emitted InterventionHandoffs carry
 *                                a valid missingContext payload at
 *                                least X% of the time over N cycles"
 *                                (Z11a: mechanical — missingContext
 *                                is non-null + shape-valid. Z11d
 *                                upgrade: semantic — the handoff
 *                                names the right ambiguity.)
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

/** Predicted intervention fidelity: of the CompilationReceipts
 *  that emitted handoffs, at least `atLeast` carried a valid
 *  missingContext payload, sustained over `overCycles` cycles.
 *
 *  The denominator is *emitted handoffs*, not total receipts — a
 *  cycle with zero emitted handoffs (e.g., because no case in this
 *  cohort's corpus failed to resolve) is inconclusive, not
 *  confirmed or refuted.
 *
 *  Z11a judgment floor: validity is mechanical — the handoff has a
 *  non-null, shape-valid `missingContext` field. Z11d upgrades the
 *  judgment to semantic: the handoff names the actual missing
 *  catalog entry. The receipt shape stays stable across the
 *  upgrade; only the judgment gets richer. */
export interface InterventionFidelityPrediction {
  readonly kind: 'intervention-fidelity';
  /** 0 ≤ atLeast ≤ 1. */
  readonly atLeast: number;
  /** Integer ≥ 1. */
  readonly overCycles: number;
}

/** The closed Prediction union. */
export type Prediction =
  | ConfirmationRatePrediction
  | ReceiptFamilyShiftPrediction
  | CoverageGrowthPrediction
  | RegressionFreedomPrediction
  | InterventionFidelityPrediction;

/** Exhaustive Prediction fold. Adding a kind is a typecheck error
 *  until every call site adds the case. */
export function foldPrediction<R>(
  prediction: Prediction,
  cases: {
    readonly confirmationRate: (p: ConfirmationRatePrediction) => R;
    readonly receiptFamilyShift: (p: ReceiptFamilyShiftPrediction) => R;
    readonly coverageGrowth: (p: CoverageGrowthPrediction) => R;
    readonly regressionFreedom: (p: RegressionFreedomPrediction) => R;
    readonly interventionFidelity: (p: InterventionFidelityPrediction) => R;
  },
): R {
  switch (prediction.kind) {
    case 'confirmation-rate':     return cases.confirmationRate(prediction);
    case 'receipt-family-shift':  return cases.receiptFamilyShift(prediction);
    case 'coverage-growth':       return cases.coverageGrowth(prediction);
    case 'regression-freedom':    return cases.regressionFreedom(prediction);
    case 'intervention-fidelity': return cases.interventionFidelity(prediction);
  }
}

/**
 * evaluateHypothesis — Effect wrapper around pure derivations.
 *
 * Per docs/v2-compounding-engine-plan.md §4.3, the evaluator is
 * essentially pure but wrapped in Effect.sync so it composes under
 * Effect.all inside computeScoreboard. Inputs:
 *
 *   - the hypothesis under test
 *   - the cycle's probe + scenario receipts
 *
 * Output: an HypothesisReceipt ready for the ReceiptStore's
 * appendHypothesisReceipt channel.
 */

import { Effect } from 'effect';
import type { CompoundingError } from '../domain/compounding-error';
import type { Hypothesis } from '../domain/hypothesis';
import type { HypothesisReceipt } from '../domain/hypothesis-receipt';
import { filterEvidenceForHypothesis } from './filter-evidence';
import { confirmationFromPrediction } from './confirmation-judgments';
import {
  buildHypothesisReceipt,
  type BuildHypothesisReceiptOptions,
} from './build-hypothesis-receipt';
import type { ProbeReceiptLike, ScenarioReceiptLike } from './ports';

export function evaluateHypothesis(
  hypothesis: Hypothesis,
  probeReceipts: readonly ProbeReceiptLike[],
  scenarioReceipts: readonly ScenarioReceiptLike[],
  options: BuildHypothesisReceiptOptions,
): Effect.Effect<HypothesisReceipt, CompoundingError, never> {
  return Effect.sync(() => {
    const evidence = filterEvidenceForHypothesis(hypothesis, probeReceipts, scenarioReceipts);
    const judgment = confirmationFromPrediction(hypothesis.prediction, evidence);
    return buildHypothesisReceipt(hypothesis, judgment, options);
  });
}

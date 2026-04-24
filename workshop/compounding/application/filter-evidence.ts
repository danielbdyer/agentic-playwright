/**
 * filterEvidenceForHypothesis — pure derivation.
 *
 * Per docs/v2-compounding-engine-plan.md §4.2 + §9.5 (ZC15), the
 * per-cycle receipt stream is filtered to only the receipts that
 * are explicitly attributed to the hypothesis under evaluation.
 *
 * Two filter axes:
 *   1. payload.hypothesisId === hypothesis.id (explicit tagging)
 *   2. cohort match (only for hypotheses whose cohort.kind is
 *      probe-surface; scenario-trajectory hypotheses always use
 *      explicit tagging).
 *
 * For the initial Z5a implementation, we use axis 1 only — explicit
 * tagging is the load-bearing attribution channel. Cohort-implicit
 * attribution is deferred (plan §11 Q3 equivalent).
 *
 * Pure — no Effect imports.
 */

import type { Hypothesis } from '../domain/hypothesis';
import type { CompilationReceiptLike, ProbeReceiptLike, ScenarioReceiptLike } from './ports';

export interface HypothesisEvidence {
  readonly probeReceipts: readonly ProbeReceiptLike[];
  readonly scenarioReceipts: readonly ScenarioReceiptLike[];
  /** Z11a.6 — CompilationReceipts attributed to this hypothesis.
   *  Filled by the customer-compilation cohort's evaluation pass.
   *  Older evidence-filter callers that pass only probe + scenario
   *  receive an empty array here, preserving backward-compat for
   *  tests that pin compilation evidence at zero. */
  readonly compilationReceipts: readonly CompilationReceiptLike[];
}

export function filterEvidenceForHypothesis(
  hypothesis: Hypothesis,
  probeReceipts: readonly ProbeReceiptLike[],
  scenarioReceipts: readonly ScenarioReceiptLike[],
  compilationReceipts: readonly CompilationReceiptLike[] = [],
): HypothesisEvidence {
  const id = hypothesis.id;
  return {
    probeReceipts: probeReceipts.filter((r) => r.payload.hypothesisId === id),
    scenarioReceipts: scenarioReceipts.filter((r) => r.payload.hypothesisId === id),
    compilationReceipts: compilationReceipts.filter((r) => r.payload.hypothesisId === id),
  };
}

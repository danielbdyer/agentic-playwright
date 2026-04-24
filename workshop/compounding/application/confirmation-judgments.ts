/**
 * confirmationFromPrediction — the four Prediction-kind evaluators.
 *
 * Per docs/v2-compounding-engine-plan.md §4.3 + §9.5 (ZC16–ZC19),
 * each Prediction kind has a deterministic evaluator that turns a
 * pair (prediction, evidence) into a Judgment:
 *
 *   {
 *     outcome:           'confirmed' | 'refuted' | 'inconclusive';
 *     confirmedCount:    number;
 *     refutedCount:      number;
 *     inconclusiveCount: number;
 *     cycleRate:         number;   // confirmed / (confirmed + refuted)
 *     evidenceReceiptIds: string[]; // artifact fingerprints
 *   }
 *
 * The evaluators are pure; they fold the evidence list with the
 * prediction's threshold + shape. `foldPrediction` dispatches.
 *
 * No Effect imports.
 */

import { foldPrediction, type Prediction } from '../domain/prediction';
import type { ConfirmationOutcome } from '../domain/confirmation';
import type { HypothesisEvidence } from './filter-evidence';

export interface Judgment {
  readonly outcome: ConfirmationOutcome;
  readonly confirmedCount: number;
  readonly refutedCount: number;
  readonly inconclusiveCount: number;
  readonly cycleRate: number;
  readonly evidenceReceiptIds: readonly string[];
}

const EMPTY: Judgment = {
  outcome: 'inconclusive',
  confirmedCount: 0,
  refutedCount: 0,
  inconclusiveCount: 0,
  cycleRate: 0,
  evidenceReceiptIds: [],
};

export function confirmationFromPrediction(
  prediction: Prediction,
  evidence: HypothesisEvidence,
): Judgment {
  return foldPrediction(prediction, {
    confirmationRate: (p) => evaluateConfirmationRate(p, evidence),
    receiptFamilyShift: (p) => evaluateReceiptFamilyShift(p, evidence),
    coverageGrowth: (p) => evaluateCoverageGrowth(p, evidence),
    regressionFreedom: (p) => evaluateRegressionFreedom(p, evidence),
    // Z11a.6 — real evaluator over CompilationReceipts replaces the
    // Z11a.1 inconclusive stub. Denominator-zero (no handoffs emitted)
    // yields inconclusive; otherwise validHandoffs / emittedHandoffs
    // is compared against atLeast.
    interventionFidelity: (p) => evaluateInterventionFidelity(p, evidence),
  });
}

function evaluateConfirmationRate(
  prediction: Extract<Prediction, { kind: 'confirmation-rate' }>,
  evidence: HypothesisEvidence,
): Judgment {
  const probeIds = evidence.probeReceipts.map((r) => r.fingerprints.artifact);
  const scenarioIds = evidence.scenarioReceipts.map((r) => r.fingerprints.artifact);
  const compilationIds = evidence.compilationReceipts.map((r) => r.fingerprints.artifact);
  const evidenceIds = [...probeIds, ...scenarioIds, ...compilationIds];

  const probeConfirms = evidence.probeReceipts.filter(
    (r) => r.payload.outcome.completedAsExpected,
  ).length;
  const probeRefutes = evidence.probeReceipts.length - probeConfirms;
  const scenarioConfirms = evidence.scenarioReceipts.filter(
    (r) => r.payload.verdict === 'trajectory-holds',
  ).length;
  const scenarioRefutes = evidence.scenarioReceipts.length - scenarioConfirms;

  // Z11a.6 — CompilationReceipts contribute to confirmation-rate
  // judgments when the hypothesis's cohort is customer-compilation
  // with a 'resolvable' corpus. A compilation receipt counts as
  // confirmed when resolvedStepCount / totalStepCount >= atLeast;
  // refuted otherwise. Step-level counts are not exposed as
  // individual judgments — one judgment per receipt (= per ADO case)
  // keeps the trajectory numerator interpretable.
  const compilationConfirms = evidence.compilationReceipts.filter((r) => {
    const total = r.payload.totalStepCount;
    if (total === 0) return false;
    return r.payload.resolvedStepCount / total >= prediction.atLeast;
  }).length;
  const compilationRefutes = evidence.compilationReceipts.length - compilationConfirms;

  const confirmedCount = probeConfirms + scenarioConfirms + compilationConfirms;
  const refutedCount = probeRefutes + scenarioRefutes + compilationRefutes;
  const denom = confirmedCount + refutedCount;

  if (denom === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  const cycleRate = confirmedCount / denom;
  const outcome: ConfirmationOutcome = cycleRate >= prediction.atLeast ? 'confirmed' : 'refuted';

  return {
    outcome,
    confirmedCount,
    refutedCount,
    inconclusiveCount: 0,
    cycleRate,
    evidenceReceiptIds: evidenceIds,
  };
}

function evaluateInterventionFidelity(
  prediction: Extract<Prediction, { kind: 'intervention-fidelity' }>,
  evidence: HypothesisEvidence,
): Judgment {
  // Z11a.6 real evaluator (replaces the Z11a.1 inconclusive stub).
  //
  // Over the compilation receipts attributed to this hypothesis,
  // compute:
  //   numerator   = sum(handoffsWithValidMissingContext)
  //   denominator = sum(handoffsEmitted)
  //
  // Denominator zero (no handoffs emitted in cycle) → inconclusive,
  // matching the denominator-zero semantics of confirmation-rate
  // (§Z11a.1). This is important: a cycle with no handoffs carries
  // no intervention-fidelity signal and must not contribute to the
  // trajectory as a refuted cycle.
  //
  // Cycle rate = numerator / denominator. Outcome is confirmed iff
  // cycleRate >= atLeast; refuted otherwise.
  //
  // The receipts referenced are the compilation receipts; probe +
  // scenario receipts are not consulted under this prediction kind
  // because they don't carry handoff counts.
  const evidenceIds = evidence.compilationReceipts.map((r) => r.fingerprints.artifact);

  if (evidence.compilationReceipts.length === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  let handoffsEmitted = 0;
  let handoffsValid = 0;
  for (const r of evidence.compilationReceipts) {
    handoffsEmitted += r.payload.handoffsEmitted;
    handoffsValid += r.payload.handoffsWithValidMissingContext;
  }

  if (handoffsEmitted === 0) {
    // Zero-handoff cycle: inconclusive by §Z11a.1.
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  const cycleRate = handoffsValid / handoffsEmitted;
  const outcome: ConfirmationOutcome = cycleRate >= prediction.atLeast ? 'confirmed' : 'refuted';

  return {
    outcome,
    confirmedCount: handoffsValid,
    refutedCount: handoffsEmitted - handoffsValid,
    inconclusiveCount: 0,
    cycleRate,
    evidenceReceiptIds: evidenceIds,
  };
}

function evaluateReceiptFamilyShift(
  prediction: Extract<Prediction, { kind: 'receipt-family-shift' }>,
  evidence: HypothesisEvidence,
): Judgment {
  const evidenceIds = evidence.probeReceipts.map((r) => r.fingerprints.artifact);

  const probes = evidence.probeReceipts;
  if (probes.length === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  // `from` is an error-family value that the expected side used to
  // carry; `to` is the error-family the observed side now carries.
  // A transition is a receipt whose expected.errorFamily (or
  // classification, if 'matched') matches `from` and whose observed
  // matches `to`.
  let confirmedCount = 0;
  let refutedCount = 0;
  for (const r of probes) {
    const expectedTag = r.payload.outcome.expected.errorFamily ?? r.payload.outcome.expected.classification;
    const observedTag = r.payload.outcome.observed.errorFamily ?? r.payload.outcome.observed.classification;
    if (expectedTag === prediction.from) {
      if (observedTag === prediction.to) {
        confirmedCount += 1;
      } else {
        refutedCount += 1;
      }
    }
  }

  const denom = confirmedCount + refutedCount;
  if (denom === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }
  const cycleRate = confirmedCount / denom;
  // Any confirmed transition is a confirmation for this cycle; a
  // cycle with only refutations is a refutation.
  const outcome: ConfirmationOutcome = confirmedCount > 0 ? 'confirmed' : 'refuted';
  return {
    outcome,
    confirmedCount,
    refutedCount,
    inconclusiveCount: 0,
    cycleRate,
    evidenceReceiptIds: evidenceIds,
  };
}

function evaluateCoverageGrowth(
  prediction: Extract<Prediction, { kind: 'coverage-growth' }>,
  evidence: HypothesisEvidence,
): Judgment {
  const matchingProbes = evidence.probeReceipts.filter(
    (r) => r.payload.cohort.verb === prediction.verb && r.payload.cohort.facetKind === prediction.facetKind,
  );
  const evidenceIds = matchingProbes.map((r) => r.fingerprints.artifact);

  if (matchingProbes.length === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  const confirmedCount = matchingProbes.filter((r) => r.payload.outcome.completedAsExpected).length;
  const refutedCount = matchingProbes.length - confirmedCount;
  const cycleRate = matchingProbes.length === 0 ? 0 : confirmedCount / matchingProbes.length;

  // "coverage-growth" interprets cycleRate as the current coverage
  // ratio and checks it has moved toward toRatio. When toRatio >
  // fromRatio we require cycleRate >= toRatio for confirmation;
  // when toRatio < fromRatio (unusual) we flip the comparison.
  const threshold = prediction.toRatio;
  const ascending = prediction.toRatio >= prediction.fromRatio;
  const outcome: ConfirmationOutcome = ascending
    ? cycleRate >= threshold
      ? 'confirmed'
      : 'refuted'
    : cycleRate <= threshold
      ? 'confirmed'
      : 'refuted';

  return {
    outcome,
    confirmedCount,
    refutedCount,
    inconclusiveCount: 0,
    cycleRate,
    evidenceReceiptIds: evidenceIds,
  };
}

function evaluateRegressionFreedom(
  prediction: Extract<Prediction, { kind: 'regression-freedom' }>,
  evidence: HypothesisEvidence,
): Judgment {
  const targetSet = new Set(prediction.receiptIds);
  const matchingScenarios = evidence.scenarioReceipts.filter((r) =>
    targetSet.has(r.fingerprints.artifact) || targetSet.has(r.payload.scenarioId),
  );
  const matchingProbes = evidence.probeReceipts.filter((r) =>
    targetSet.has(r.fingerprints.artifact) || targetSet.has(r.payload.probeId),
  );

  const scenarioIds = matchingScenarios.map((r) => r.fingerprints.artifact);
  const probeIds = matchingProbes.map((r) => r.fingerprints.artifact);
  const evidenceIds = [...probeIds, ...scenarioIds];

  if (matchingScenarios.length === 0 && matchingProbes.length === 0) {
    return { ...EMPTY, evidenceReceiptIds: evidenceIds };
  }

  const scenarioPasses = matchingScenarios.filter((r) => r.payload.verdict === 'trajectory-holds').length;
  const scenarioFails = matchingScenarios.length - scenarioPasses;
  const probePasses = matchingProbes.filter((r) => r.payload.outcome.completedAsExpected).length;
  const probeFails = matchingProbes.length - probePasses;

  const confirmedCount = scenarioPasses + probePasses;
  const refutedCount = scenarioFails + probeFails;
  const denom = confirmedCount + refutedCount;
  const cycleRate = denom === 0 ? 0 : confirmedCount / denom;
  const outcome: ConfirmationOutcome = refutedCount === 0 ? 'confirmed' : 'refuted';

  return {
    outcome,
    confirmedCount,
    refutedCount,
    inconclusiveCount: 0,
    cycleRate,
    evidenceReceiptIds: evidenceIds,
  };
}

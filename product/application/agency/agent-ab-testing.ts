/**
 * Agent provider A/B testing infrastructure.
 *
 * Pure, deterministic functions for splitting traffic between two agent
 * providers, recording per-variant results, and summarizing quality deltas.
 *
 * All interfaces use readonly fields; all functions are pure.
 */

// ─── Interfaces ───

export interface ABTestConfig {
  readonly testId: string;
  readonly controlProvider: string;
  readonly treatmentProvider: string;
  readonly trafficSplit: number; // 0–1, fraction routed to treatment
  readonly seed: number;
}

export interface ABTestResult {
  readonly testId: string;
  readonly variant: 'control' | 'treatment';
  readonly providerId: string;
  readonly proposalCount: number;
  readonly successCount: number;
  readonly averageConfidence: number;
  readonly duration: number;
}

export interface ABTestSummary {
  readonly testId: string;
  readonly controlResults: readonly ABTestResult[];
  readonly treatmentResults: readonly ABTestResult[];
  readonly confidenceDelta: number;
  readonly proposalQualityDelta: number;
  readonly isSignificant: boolean;
}

// ─── Helpers ───

/**
 * Simple integer hash combining stepIndex and seed into a deterministic
 * value in [0, 1).  Uses the same Mulberry32 one-shot approach used
 * elsewhere in the test-support layer.
 */
function hashToUnit(stepIndex: number, seed: number): number {
  let h = ((stepIndex ^ seed) + 0x6d2b79f5) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 1 | h);
  h = (h + Math.imul(h ^ (h >>> 7), 61 | h)) ^ h;
  return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
}

function mean(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

function averageConfidenceOf(results: readonly ABTestResult[]): number {
  return mean(results.map((r) => r.averageConfidence));
}

function proposalQualityOf(results: readonly ABTestResult[]): number {
  const totalProposals = results.reduce((a, r) => a + r.proposalCount, 0);
  const totalSuccesses = results.reduce((a, r) => a + r.successCount, 0);
  return totalProposals === 0 ? 0 : totalSuccesses / totalProposals;
}

// ─── Public Functions ───

/**
 * Deterministic variant assignment: hash(stepIndex, seed) < trafficSplit
 * routes to treatment, otherwise control.
 */
export function assignVariant(
  stepIndex: number,
  config: ABTestConfig,
): 'control' | 'treatment' {
  return hashToUnit(stepIndex, config.seed) < config.trafficSplit
    ? 'treatment'
    : 'control';
}

/**
 * Build an ABTestResult from raw proposal data.
 * Duration is computed from the proposals array length as a placeholder;
 * callers with wall-clock data should override after construction.
 */
export function recordResult(
  variant: 'control' | 'treatment',
  providerId: string,
  proposals: readonly { readonly confidence: number; readonly accepted: boolean }[],
): ABTestResult {
  const proposalCount = proposals.length;
  const successCount = proposals.filter((p) => p.accepted).length;
  const averageConfidence = mean(proposals.map((p) => p.confidence));
  return {
    testId: '',
    variant,
    providerId,
    proposalCount,
    successCount,
    averageConfidence,
    duration: 0,
  };
}

/**
 * Simplified significance check.  Uses a threshold on the absolute
 * difference scaled by sqrt(sampleSize).  Returns false when sampleSize
 * is zero to avoid division-by-zero artefacts.
 */
export function isSignificantDifference(
  controlMean: number,
  treatmentMean: number,
  sampleSize: number,
  threshold: number = 1.96,
): boolean {
  if (sampleSize === 0) return false;
  const delta = Math.abs(treatmentMean - controlMean);
  return delta * Math.sqrt(sampleSize) > threshold;
}

/**
 * Summarize an A/B test from its per-variant result arrays.
 */
export function summarizeABTest(
  controlResults: readonly ABTestResult[],
  treatmentResults: readonly ABTestResult[],
): ABTestSummary {
  const controlMean = averageConfidenceOf(controlResults);
  const treatmentMean = averageConfidenceOf(treatmentResults);
  const confidenceDelta = treatmentMean - controlMean;

  const controlQuality = proposalQualityOf(controlResults);
  const treatmentQuality = proposalQualityOf(treatmentResults);
  const proposalQualityDelta = treatmentQuality - controlQuality;

  const sampleSize = Math.min(controlResults.length, treatmentResults.length);
  const testId =
    controlResults.length > 0
      ? controlResults[0]!.testId
      : treatmentResults.length > 0
        ? treatmentResults[0]!.testId
        : '';

  return {
    testId,
    controlResults,
    treatmentResults,
    confidenceDelta,
    proposalQualityDelta,
    isSignificant: isSignificantDifference(controlMean, treatmentMean, sampleSize),
  };
}

/**
 * Sensible defaults for local experimentation.
 */
export function defaultABTestConfig(): ABTestConfig {
  return {
    testId: 'default-ab-test',
    controlProvider: 'heuristic',
    treatmentProvider: 'llm',
    trafficSplit: 0.5,
    seed: 42,
  };
}

/**
 * Merge two summaries (must share the same testId — caller invariant).
 * Concatenates result arrays and recomputes deltas/significance.
 */
export function mergeABTestSummaries(
  a: ABTestSummary,
  b: ABTestSummary,
): ABTestSummary {
  const controlResults = [...a.controlResults, ...b.controlResults];
  const treatmentResults = [...a.treatmentResults, ...b.treatmentResults];
  return summarizeABTest(controlResults, treatmentResults);
}

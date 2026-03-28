import type { ResolutionPrecedenceRung } from './precedence';
import type { RungMarginalValue, RungStressStepResult } from './types/execution';

/**
 * Classify marginal value verdict from resolution metrics.
 *
 * - essential:  resolutionRate > 0.5 AND uniqueResolutions > 0
 * - valuable:   resolutionRate > 0.2 OR avgConfidence > 0.8
 * - marginal:   resolutionRate > 0
 * - redundant:  resolutionRate === 0
 */
function classifyVerdict(
  resolutionRate: number,
  avgConfidence: number,
  uniqueResolutions: number,
): RungMarginalValue['verdict'] {
  return resolutionRate > 0.5 && uniqueResolutions > 0
    ? 'essential'
    : resolutionRate > 0.2 || avgConfidence > 0.8
      ? 'valuable'
      : resolutionRate > 0
        ? 'marginal'
        : 'redundant';
}

/**
 * Compute marginal value of a resolution rung from step-level stress test results.
 *
 * Pure function — no side effects, no mutation.
 */
export function computeMarginalValue(
  rung: ResolutionPrecedenceRung,
  stepResults: readonly RungStressStepResult[],
): RungMarginalValue {
  const total = stepResults.length;

  const resolvedCount = stepResults.filter((r) => r.resolvedWithForce).length;
  const degradedCount = stepResults.filter((r) => r.degradedFromBaseline).length;
  const uniqueResolutions = stepResults.filter(
    (r) => r.resolvedWithForce && !r.resolvedWithBaseline,
  ).length;

  const resolutionRate = total > 0 ? resolvedCount / total : 0;
  const degradationRate = total > 0 ? degradedCount / total : 0;
  const avgConfidence =
    total > 0
      ? stepResults.reduce((sum, r) => sum + r.rungConfidence, 0) / total
      : 0;

  const verdict = classifyVerdict(resolutionRate, avgConfidence, uniqueResolutions);

  return {
    rung,
    resolutionRate,
    degradationRate,
    avgConfidence,
    uniqueResolutions,
    verdict,
  };
}

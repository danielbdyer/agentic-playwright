/**
 * Knob Search — maps pipeline failure modes to tunable parameters and
 * generates candidate configurations for the self-improving loop.
 *
 * This is the "backward pass" of the training analogy: the fitness report
 * classifies failures (the gradient signal), and this module maps each
 * failure class to the specific parameters to adjust and generates
 * candidate values to try.
 *
 * The design is substrate-agnostic: the failure-to-parameter mapping is
 * derived from the structural relationship between failure classes and
 * pipeline mechanics, not from any particular evaluation corpus.
 */

import type { PipelineConfig, PipelineFailureClass } from '../../domain/types';
import { mergePipelineConfig } from '../../domain/types';

// ─── Failure-to-Parameter Mapping ───

export type ConfigPath = keyof PipelineConfig;

export interface FailureParameterMapping {
  readonly failureClass: PipelineFailureClass;
  readonly implicatedParameters: readonly ConfigPath[];
  readonly direction: 'lower' | 'higher' | 'explore';
  readonly rationale: string;
}

const FAILURE_PARAMETER_MAP: ReadonlyMap<PipelineFailureClass, FailureParameterMapping> = new Map([
  ['translation-threshold-miss', {
    failureClass: 'translation-threshold-miss',
    implicatedParameters: ['translationThreshold'],
    direction: 'lower',
    rationale: 'Near-miss candidates scored below threshold. Lower threshold to admit them.',
  }],
  ['translation-normalization-gap', {
    failureClass: 'translation-normalization-gap',
    implicatedParameters: ['translationThreshold', 'intentThresholds'],
    direction: 'explore',
    rationale: 'Tokenization missed phrasing patterns. Threshold or intent thresholds may need adjustment.',
  }],
  ['alias-coverage-gap', {
    failureClass: 'alias-coverage-gap',
    implicatedParameters: ['intentThresholds'],
    direction: 'lower',
    rationale: 'No alias existed for a predictable pattern. Lower intent thresholds to allow more heuristic matches.',
  }],
  ['resolution-rung-skip', {
    failureClass: 'resolution-rung-skip',
    implicatedParameters: ['confidenceScaling', 'proposalConfidenceValues'],
    direction: 'explore',
    rationale: 'A higher-precedence rung could have resolved but did not fire.',
  }],
  ['scoring-weight-mismatch', {
    failureClass: 'scoring-weight-mismatch',
    implicatedParameters: ['bottleneckWeights'],
    direction: 'explore',
    rationale: 'Bottleneck signal weights did not correlate with actual improvement.',
  }],
  ['recovery-strategy-miss', {
    failureClass: 'recovery-strategy-miss',
    implicatedParameters: ['domScoringWeights', 'candidateLimits'],
    direction: 'explore',
    rationale: 'Recovery strategies failed. DOM scoring or candidate limits may need adjustment.',
  }],
  ['convergence-stall', {
    failureClass: 'convergence-stall',
    implicatedParameters: ['proposalRankingWeights', 'convergenceThreshold'],
    direction: 'explore',
    rationale: 'Proposals generated but no improvement. Ranking weights or convergence threshold may need adjustment.',
  }],
  ['trust-policy-over-block', {
    failureClass: 'trust-policy-over-block',
    implicatedParameters: ['proposalConfidenceValues'],
    direction: 'higher',
    rationale: 'All proposals blocked by trust policy. Raise proposal confidence values.',
  }],
]);

export function mappingForFailureClass(fc: PipelineFailureClass): FailureParameterMapping {
  const mapping = FAILURE_PARAMETER_MAP.get(fc);
  if (!mapping) {
    return {
      failureClass: fc,
      implicatedParameters: [],
      direction: 'explore',
      rationale: `No known parameter mapping for failure class ${fc}`,
    };
  }
  return mapping;
}

// ─── Candidate Generation ───

export interface CandidateConfig {
  readonly label: string;
  readonly config: PipelineConfig;
  readonly delta: Partial<PipelineConfig>;
  readonly rationale: string;
}

/**
 * Generate candidate scalar perturbations for a numeric config value.
 * Returns values at ±5%, ±10%, ±20% of the baseline.
 */
function scalarCandidates(
  baseValue: number,
  direction: 'lower' | 'higher' | 'explore',
): readonly number[] {
  const perturbations = direction === 'lower'
    ? [-0.05, -0.10, -0.20]
    : direction === 'higher'
      ? [0.05, 0.10, 0.20]
      : [-0.10, -0.05, 0.05, 0.10];
  return perturbations.map((p) => Number((baseValue * (1 + p)).toFixed(6)));
}

/**
 * Generate candidate weight vector perturbations that preserve the sum.
 * For a 4-weight vector, shifts weight from the lowest-weighted dimension
 * to the highest-weighted dimension in 0.05 increments.
 */
function weightVectorCandidates(
  weights: Record<string, number>,
): readonly Record<string, number>[] {
  const entries = Object.entries(weights).sort(([, a], [, b]) => a - b);
  const sum = entries.reduce((s, [, v]) => s + v, 0);
  const delta = 0.05;

  // Shift 0.05 from each dimension to each other dimension
  const indices = entries.map((_, i) => i);
  return indices.flatMap((i) =>
    indices
      .filter((j) => i !== j && entries[i]![1] - delta >= 0.05)
      .flatMap((j) => {
        const shifted = entries.map(([key, value], k) => {
          const newValue = k === i ? value - delta : k === j ? value + delta : value;
          return [key, Number(newValue.toFixed(4))] as const;
        });
        const newSum = shifted.reduce((s, [, v]) => s + v, 0);
        return Math.abs(newSum - sum) < 0.001 ? [Object.fromEntries(shifted)] : [];
      }),
  );
}

export function generateCandidates(
  baseline: PipelineConfig,
  mapping: FailureParameterMapping,
): readonly CandidateConfig[] {
  const candidates: readonly CandidateConfig[] = mapping.implicatedParameters.flatMap((param) => {
    const baseValue = baseline[param];

    if (typeof baseValue === 'number') {
      return scalarCandidates(baseValue, mapping.direction).map((value) => {
        const delta = { [param]: value } as Partial<PipelineConfig>;
        return {
          label: `${param}=${value}`,
          config: mergePipelineConfig(baseline, delta),
          delta,
          rationale: `${mapping.rationale} Trying ${param}=${value} (was ${baseValue}).`,
        };
      });
    } else if (typeof baseValue === 'object' && baseValue !== null) {
      return weightVectorCandidates(baseValue as unknown as Record<string, number>)
        .slice(0, 6) // limit to 6 candidates per vector
        .map((weights) => {
          const delta = { [param]: weights } as unknown as Partial<PipelineConfig>;
          return {
            label: `${param}=${JSON.stringify(weights)}`,
            config: mergePipelineConfig(baseline, delta),
            delta,
            rationale: `${mapping.rationale} Redistributing ${param} weights.`,
          };
        });
    }
    return [];
  });

  return candidates;
}

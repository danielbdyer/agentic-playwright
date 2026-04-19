/**
 * Pipeline config weight-sum preservation laws.
 *
 * Weight vectors (BottleneckWeights, RankingWeights, DomScoringWeights) must
 * sum to ~1.0. mergePipelineConfig must preserve this property.
 * calibrateWeightsFromCorrelations must preserve this property.
 */

import { expect, test } from '@playwright/test';
import {
  DEFAULT_PIPELINE_CONFIG,
  mergePipelineConfig,
  validatePipelineConfig,
} from '../../product/domain/attention/pipeline-config';
import { calibrateWeightsFromCorrelations } from '../../workshop/learning/learning-bottlenecks';
import type { BottleneckWeightCorrelation } from '../../workshop/metrics/types';

// ─── Helpers ───

function weightSum(weights: Record<string, number>): number {
  return Object.values(weights).reduce((sum, v) => sum + v, 0);
}

const TOLERANCE = 0.01;

// ─── Law 1: Default weight vectors sum to 1.0 ───

test('bottleneck weights sum to 1.0', () => {
  const sum = weightSum(DEFAULT_PIPELINE_CONFIG.bottleneckWeights as unknown as Record<string, number>);
  expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
});

test('proposal ranking weights sum to 1.0', () => {
  const sum = weightSum(DEFAULT_PIPELINE_CONFIG.proposalRankingWeights as unknown as Record<string, number>);
  expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
});

test('DOM scoring weights sum to 1.0', () => {
  const sum = weightSum(DEFAULT_PIPELINE_CONFIG.domScoringWeights as unknown as Record<string, number>);
  expect(Math.abs(sum - 1.0)).toBeLessThan(TOLERANCE);
});

// ─── Law 2: validatePipelineConfig accepts defaults ───

test('default config passes validation', () => {
  const errors = validatePipelineConfig(DEFAULT_PIPELINE_CONFIG);
  expect(errors).toEqual([]);
});

// ─── Law 3: mergePipelineConfig preserves weight sums ───

test('merge with empty overrides preserves all weight sums', () => {
  const merged = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, {});
  expect(Math.abs(weightSum(merged.bottleneckWeights as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
  expect(Math.abs(weightSum(merged.proposalRankingWeights as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
  expect(Math.abs(weightSum(merged.domScoringWeights as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
});

test('merge with partial bottleneck override preserves other weight sums', () => {
  const merged = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, {
    bottleneckWeights: { repairDensity: 0.5, translationRate: 0.2, unresolvedRate: 0.2, inverseFragmentShare: 0.1 },
  });
  expect(Math.abs(weightSum(merged.bottleneckWeights as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
  expect(Math.abs(weightSum(merged.proposalRankingWeights as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
});

// ─── Law 4: calibrateWeightsFromCorrelations preserves weight sum ───

test('calibrated weights preserve sum = 1.0 with positive correlations', () => {
  const correlations: readonly BottleneckWeightCorrelation[] = [
    { signal: 'repair-density', weight: 0.3, correlationWithImprovement: 0.5 },
    { signal: 'translation-rate', weight: 0.25, correlationWithImprovement: -0.2 },
    { signal: 'unresolved-rate', weight: 0.25, correlationWithImprovement: 0.1 },
    { signal: 'inverse-fragment-share', weight: 0.2, correlationWithImprovement: 0.0 },
  ];
  const calibrated = calibrateWeightsFromCorrelations(
    DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    correlations,
  );
  expect(Math.abs(weightSum(calibrated as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
});

test('calibrated weights preserve sum = 1.0 with all-negative correlations', () => {
  const correlations: readonly BottleneckWeightCorrelation[] = [
    { signal: 'repair-density', weight: 0.3, correlationWithImprovement: -0.8 },
    { signal: 'translation-rate', weight: 0.25, correlationWithImprovement: -0.5 },
    { signal: 'unresolved-rate', weight: 0.25, correlationWithImprovement: -0.3 },
    { signal: 'inverse-fragment-share', weight: 0.2, correlationWithImprovement: -0.9 },
  ];
  const calibrated = calibrateWeightsFromCorrelations(
    DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    correlations,
  );
  expect(Math.abs(weightSum(calibrated as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
});

test('calibrated weights floor at minimum per-weight value', () => {
  const correlations: readonly BottleneckWeightCorrelation[] = [
    { signal: 'repair-density', weight: 0.3, correlationWithImprovement: -10 },
    { signal: 'translation-rate', weight: 0.25, correlationWithImprovement: -10 },
    { signal: 'unresolved-rate', weight: 0.25, correlationWithImprovement: -10 },
    { signal: 'inverse-fragment-share', weight: 0.2, correlationWithImprovement: -10 },
  ];
  const calibrated = calibrateWeightsFromCorrelations(
    DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    correlations,
  );
  // All weights should be above the floor (0.05)
  expect(calibrated.repairDensity).toBeGreaterThanOrEqual(0.05);
  expect(calibrated.translationRate).toBeGreaterThanOrEqual(0.05);
  expect(calibrated.unresolvedRate).toBeGreaterThanOrEqual(0.05);
  expect(calibrated.inverseFragmentShare).toBeGreaterThanOrEqual(0.05);
  expect(Math.abs(weightSum(calibrated as unknown as Record<string, number>) - 1.0)).toBeLessThan(TOLERANCE);
});

test('calibration with empty correlations returns base weights unchanged', () => {
  const calibrated = calibrateWeightsFromCorrelations(
    DEFAULT_PIPELINE_CONFIG.bottleneckWeights,
    [],
  );
  expect(calibrated as unknown as Record<string, number>).toEqual(DEFAULT_PIPELINE_CONFIG.bottleneckWeights as unknown as Record<string, number>);
});

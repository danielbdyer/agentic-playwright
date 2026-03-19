/**
 * Pipeline Configuration — centralizes all tunable parameters of the resolution pipeline.
 *
 * These parameters are the "weights" of the self-improving speedrun loop. Each
 * parameter maps to a specific failure class in the fitness report, enabling
 * targeted adjustment when the pipeline underperforms.
 *
 * See docs/recursive-self-improvement.md for the training analogy and parameter space.
 */

// ─── Weight Sub-Types ───

export interface BottleneckWeights {
  readonly repairDensity: number;
  readonly translationRate: number;
  readonly unresolvedRate: number;
  readonly inverseFragmentShare: number;
}

export interface RankingWeights {
  readonly scenarioImpact: number;
  readonly bottleneckReduction: number;
  readonly trustPolicy: number;
  readonly evidence: number;
}

export interface MemoryCapacityConfig {
  readonly maxActiveRefs: number;
  readonly stalenessTtl: number;
  readonly maxRecentAssertions: number;
  readonly screenConfidenceFloor: number;
  readonly maxLineageEntries: number;
}

export interface DomScoringWeights {
  readonly visibility: number;
  readonly roleName: number;
  readonly locatorQuality: number;
  readonly widgetCompatibility: number;
}

export interface CandidateLimits {
  readonly maxCandidates: number;
  readonly maxProbes: number;
}

export interface ConfidenceScaling {
  readonly compilerDerived: number;
  readonly agentVerified: number;
  readonly agentProposed: number;
}

export interface IntentThresholds {
  readonly element: number;
  readonly screen: number;
}

export interface ProposalConfidenceValues {
  readonly translation: number;
  readonly dom: number;
  readonly domShortlist: number;
}

// ─── Pipeline Config ───

export interface PipelineConfig {
  readonly translationThreshold: number;
  readonly bottleneckWeights: BottleneckWeights;
  readonly proposalRankingWeights: RankingWeights;
  readonly memoryCapacity: MemoryCapacityConfig;
  readonly domScoringWeights: DomScoringWeights;
  readonly candidateLimits: CandidateLimits;
  readonly confidenceScaling: ConfidenceScaling;
  readonly intentThresholds: IntentThresholds;
  readonly precedenceBase: number;
  readonly proposalConfidenceValues: ProposalConfidenceValues;
  readonly convergenceThreshold: number;
}

// ─── Default Configuration (current production values) ───

export const DEFAULT_PIPELINE_CONFIG: PipelineConfig = {
  translationThreshold: 0.34,
  bottleneckWeights: {
    repairDensity: 0.30,
    translationRate: 0.25,
    unresolvedRate: 0.25,
    inverseFragmentShare: 0.20,
  },
  proposalRankingWeights: {
    scenarioImpact: 0.30,
    bottleneckReduction: 0.30,
    trustPolicy: 0.20,
    evidence: 0.20,
  },
  memoryCapacity: {
    maxActiveRefs: 8,
    stalenessTtl: 5,
    maxRecentAssertions: 8,
    screenConfidenceFloor: 0.35,
    maxLineageEntries: 32,
  },
  domScoringWeights: {
    visibility: 0.35,
    roleName: 0.25,
    locatorQuality: 0.20,
    widgetCompatibility: 0.20,
  },
  candidateLimits: {
    maxCandidates: 3,
    maxProbes: 12,
  },
  confidenceScaling: {
    compilerDerived: 1.0,
    agentVerified: 0.8,
    agentProposed: 0.65,
  },
  intentThresholds: {
    element: 6,
    screen: 4,
  },
  precedenceBase: 100,
  proposalConfidenceValues: {
    translation: 0.85,
    dom: 0.9,
    domShortlist: 0.5,
  },
  convergenceThreshold: 0.01,
};

// ─── Config validation ───

function validateWeightSum(name: string, weights: object, tolerance = 0.01): readonly string[] {
  const sum = Object.values(weights as Record<string, number>).reduce((s, v) => s + v, 0);
  return Math.abs(sum - 1.0) > tolerance
    ? [`${name} weights sum to ${sum.toFixed(4)}, expected ~1.0`]
    : [];
}

export function validatePipelineConfig(config: PipelineConfig): readonly string[] {
  return [
    ...validateWeightSum('bottleneckWeights', config.bottleneckWeights),
    ...validateWeightSum('proposalRankingWeights', config.proposalRankingWeights),
    ...validateWeightSum('domScoringWeights', config.domScoringWeights),
    ...(config.translationThreshold <= 0 || config.translationThreshold >= 1
      ? [`translationThreshold must be in (0, 1), got ${config.translationThreshold}`]
      : []),
    ...(config.convergenceThreshold < 0
      ? [`convergenceThreshold must be non-negative, got ${config.convergenceThreshold}`]
      : []),
    ...(config.precedenceBase <= 0
      ? [`precedenceBase must be positive, got ${config.precedenceBase}`]
      : []),
  ];
}

// ─── Config merging utility ───

export function mergePipelineConfig(
  base: PipelineConfig,
  overrides: Partial<PipelineConfig>,
): PipelineConfig {
  return {
    translationThreshold: overrides.translationThreshold ?? base.translationThreshold,
    bottleneckWeights: overrides.bottleneckWeights
      ? { ...base.bottleneckWeights, ...overrides.bottleneckWeights }
      : base.bottleneckWeights,
    proposalRankingWeights: overrides.proposalRankingWeights
      ? { ...base.proposalRankingWeights, ...overrides.proposalRankingWeights }
      : base.proposalRankingWeights,
    memoryCapacity: overrides.memoryCapacity
      ? { ...base.memoryCapacity, ...overrides.memoryCapacity }
      : base.memoryCapacity,
    domScoringWeights: overrides.domScoringWeights
      ? { ...base.domScoringWeights, ...overrides.domScoringWeights }
      : base.domScoringWeights,
    candidateLimits: overrides.candidateLimits
      ? { ...base.candidateLimits, ...overrides.candidateLimits }
      : base.candidateLimits,
    confidenceScaling: overrides.confidenceScaling
      ? { ...base.confidenceScaling, ...overrides.confidenceScaling }
      : base.confidenceScaling,
    intentThresholds: overrides.intentThresholds
      ? { ...base.intentThresholds, ...overrides.intentThresholds }
      : base.intentThresholds,
    precedenceBase: overrides.precedenceBase ?? base.precedenceBase,
    proposalConfidenceValues: overrides.proposalConfidenceValues
      ? { ...base.proposalConfidenceValues, ...overrides.proposalConfidenceValues }
      : base.proposalConfidenceValues,
    convergenceThreshold: overrides.convergenceThreshold ?? base.convergenceThreshold,
  };
}

/**
 * Pipeline Fitness Report and Scorecard types.
 *
 * The fitness report is the "gradient" of the self-improving speedrun loop:
 * it classifies why the pipeline succeeded or failed at each step, aggregated
 * into improvement signals that map to specific pipeline code locations.
 *
 * The scorecard is the "loss curve": a monotonically improving high-water-mark
 * of pipeline fidelity measured from clean-slate runs.
 */

import type { ResolutionPrecedenceRung } from '../resolution/precedence';

// ─── Pipeline Failure Classification ───

export type PipelineFailureClass =
  | 'translation-threshold-miss'      // correct match scored below threshold
  | 'translation-normalization-gap'   // tokenization missed a phrasing pattern
  | 'alias-coverage-gap'             // no alias existed but pattern was predictable
  | 'resolution-rung-skip'           // a rung could have won but didn't fire
  | 'scoring-weight-mismatch'        // bottleneck signal weight didn't match actual impact
  | 'recovery-strategy-miss'         // recovery tried wrong strategy first
  | 'convergence-stall'              // proposals generated but didn't improve hit rate
  | 'trust-policy-over-block';       // policy blocked a proposal that would have helped

export type PipelineImprovementTarget =
  | { readonly kind: 'translation'; readonly detail: string }
  | { readonly kind: 'scoring'; readonly detail: string }
  | { readonly kind: 'resolution'; readonly detail: string }
  | { readonly kind: 'recovery'; readonly detail: string }
  | { readonly kind: 'trust-policy'; readonly detail: string };

export interface PipelineFailureMode {
  readonly class: PipelineFailureClass;
  readonly count: number;
  readonly affectedSteps: number;
  readonly exampleIntents: readonly string[];
  readonly improvementTarget: PipelineImprovementTarget;
}

// ─── Resolution Rung Metrics ───

export interface RungRate {
  readonly rung: ResolutionPrecedenceRung;
  readonly wins: number;
  readonly rate: number;
}

// ─── Scoring Effectiveness ───

export interface BottleneckWeightCorrelation {
  readonly signal: string;
  readonly weight: number;
  readonly correlationWithImprovement: number;
}

export interface ScoringEffectiveness {
  readonly bottleneckWeightCorrelations: readonly BottleneckWeightCorrelation[];
  readonly proposalRankingAccuracy: number;
}

// ─── Pipeline Fitness Report ───

export interface PipelineFitnessMetrics {
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly translationRecall: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
  readonly resolutionByRung: readonly RungRate[];
  readonly degradedLocatorRate: number;
  readonly recoverySuccessRate: number;
  /** Execution health from intelligence modules — present when learning signals are available. */
  readonly executionHealth?: {
    readonly compositeScore: number;
    readonly dimensions: readonly { readonly name: string; readonly value: number; readonly status: string }[];
  } | undefined;
}

export interface PipelineFitnessReport {
  readonly kind: 'pipeline-fitness-report';
  readonly version: 1;
  readonly pipelineVersion: string;
  readonly runAt: string;
  readonly baseline: true;
  readonly metrics: PipelineFitnessMetrics;
  readonly failureModes: readonly PipelineFailureMode[];
  readonly scoringEffectiveness: ScoringEffectiveness;
}

// ─── Pipeline Scorecard (committed to git) ───

export interface ScorecardHighWaterMark {
  readonly setAt: string;
  readonly pipelineVersion: string;
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
  readonly resolutionByRung: readonly RungRate[];
  /** Execution health score at the time of high-water mark. */
  readonly executionHealthScore?: number | undefined;
}

export interface ScorecardHistoryEntry {
  readonly runAt: string;
  readonly pipelineVersion: string;
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly improved: boolean;
}

// ─── Pareto Frontier ───

export interface ParetoObjectives {
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
}

export interface ParetoFrontierEntry {
  readonly pipelineVersion: string;
  readonly addedAt: string;
  readonly objectives: ParetoObjectives;
}

/**
 * Pareto dominance: a dominates b iff a is >= b on ALL objectives and strictly > on at least one.
 * convergenceVelocity is inverted (lower = better).
 */
export function paretoDominates(a: ParetoObjectives, b: ParetoObjectives): boolean {
  const pairs: readonly [number, number][] = [
    [a.knowledgeHitRate, b.knowledgeHitRate],
    [a.translationPrecision, b.translationPrecision],
    [-a.convergenceVelocity, -b.convergenceVelocity], // invert: fewer iterations = better
    [a.proposalYield, b.proposalYield],
  ];
  const allGte = pairs.every(([av, bv]) => av >= bv);
  const someGt = pairs.some(([av, bv]) => av > bv);
  return allGte && someGt;
}

/**
 * Check if a new entry would be accepted by the Pareto frontier.
 * Accepted iff no existing frontier entry Pareto-dominates the candidate.
 */
export function isAcceptedByParetoFrontier(
  frontier: readonly ParetoFrontierEntry[],
  candidate: ParetoObjectives,
): boolean {
  return !frontier.some((entry) => paretoDominates(entry.objectives, candidate));
}

/**
 * Add a new entry to the Pareto frontier, pruning dominated entries.
 */
export function addToParetoFrontier(
  frontier: readonly ParetoFrontierEntry[],
  entry: ParetoFrontierEntry,
): readonly ParetoFrontierEntry[] {
  // Remove entries dominated by the new one
  const surviving = frontier.filter((existing) => !paretoDominates(entry.objectives, existing.objectives));
  return [...surviving, entry];
}

export function objectivesFromMetrics(metrics: PipelineFitnessMetrics): ParetoObjectives {
  return {
    knowledgeHitRate: metrics.knowledgeHitRate,
    translationPrecision: metrics.translationPrecision,
    convergenceVelocity: metrics.convergenceVelocity,
    proposalYield: metrics.proposalYield,
  };
}

// ─── Pipeline Scorecard (committed to git) ───

export interface PipelineScorecard {
  readonly kind: 'pipeline-scorecard';
  readonly version: 1;
  readonly highWaterMark: ScorecardHighWaterMark;
  readonly history: readonly ScorecardHistoryEntry[];
  readonly paretoFrontier?: readonly ParetoFrontierEntry[];
}

// ─── Generalization Metrics (held-out validation) ───

/** Metrics comparing training and validation performance to detect overfitting.
 *  The generalization gap is the difference between training and held-out hit rates.
 *  A small gap (< 0.15) indicates genuine improvement; a large gap indicates memorization. */
export interface GeneralizationMetrics {
  readonly kind: 'generalization-metrics';
  readonly version: 1;
  readonly trainingMetrics: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly convergenceVelocity: number;
    readonly proposalYield: number;
    readonly degradedLocatorRate: number;
  };
  readonly validationMetrics: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly degradedLocatorRate: number;
  };
  readonly gaps: {
    readonly hitRateGap: number;
    readonly precisionGap: number;
    readonly degradationGap: number;
  };
  readonly passes: {
    readonly noOverfitting: boolean;
    readonly validationSignificant: boolean;
    readonly robustness: boolean;
  };
  readonly verdict: 'pass' | 'warn' | 'fail';
}

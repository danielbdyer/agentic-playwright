/**
 * W4.15: Proposal quality metrics in agent→alias feedback loop
 *
 * Pure domain module for tracking and classifying alias proposal quality
 * based on accumulated runtime outcomes. Enables the system to detect
 * misdirecting aliases and quarantine toxic proposals before they
 * degrade resolution quality.
 */

// ─── Domain types ───

export interface AliasOutcome {
  readonly aliasId: string;
  readonly screenId: string;
  readonly elementId: string;
  readonly proposedBy: string;
  readonly suggestedAt: string;
  readonly usedInRuns: number;
  readonly misdirectionCount: number;
  readonly successCount: number;
}

export interface ProposalQualityMetrics {
  readonly totalAliases: number;
  readonly healthyCount: number;
  readonly suspectCount: number;
  readonly toxicCount: number;
  readonly misdirectionRate: number;
  readonly averageSuccessRate: number;
}

export interface QualityThresholds {
  readonly suspectMisdirectionRate: number;
  readonly toxicMisdirectionRate: number;
  readonly minimumRuns: number;
}

// ─── Threshold defaults ───

export function defaultQualityThresholds(): QualityThresholds {
  return {
    suspectMisdirectionRate: 0.2,
    toxicMisdirectionRate: 0.5,
    minimumRuns: 3,
  };
}

// ─── Rate computations ───

/**
 * Compute misdirection rate: misdirectionCount / usedInRuns.
 * Returns 0 when there are no runs.
 */
export function computeMisdirectionRate(outcome: AliasOutcome): number {
  return outcome.usedInRuns > 0
    ? outcome.misdirectionCount / outcome.usedInRuns
    : 0;
}

/**
 * Compute success rate: successCount / usedInRuns.
 * Returns 0 when there are no runs.
 */
export function computeSuccessRate(outcome: AliasOutcome): number {
  return outcome.usedInRuns > 0
    ? outcome.successCount / outcome.usedInRuns
    : 0;
}

// ─── Classification ───

export type AliasClassification = 'healthy' | 'suspect' | 'toxic' | 'insufficient-data';

/**
 * Classify an alias outcome based on its misdirection rate and run count.
 *
 * Pure classification: outcome + thresholds in, classification out.
 */
export function classifyAlias(
  outcome: AliasOutcome,
  thresholds?: QualityThresholds,
): AliasClassification {
  const t = thresholds ?? defaultQualityThresholds();

  if (outcome.usedInRuns < t.minimumRuns) {
    return 'insufficient-data';
  }

  const rate = computeMisdirectionRate(outcome);

  return rate >= t.toxicMisdirectionRate
    ? 'toxic'
    : rate >= t.suspectMisdirectionRate
      ? 'suspect'
      : 'healthy';
}

// ─── Aggregation ───

/**
 * Fold a collection of alias outcomes into aggregate quality metrics.
 *
 * Pure function: outcomes in, metrics out.
 */
export function aggregateQualityMetrics(
  outcomes: readonly AliasOutcome[],
): ProposalQualityMetrics {
  if (outcomes.length === 0) {
    return {
      totalAliases: 0,
      healthyCount: 0,
      suspectCount: 0,
      toxicCount: 0,
      misdirectionRate: 0,
      averageSuccessRate: 0,
    };
  }

  const classifications = outcomes.map((o) => classifyAlias(o));

  const healthyCount = classifications.filter((c) => c === 'healthy').length;
  const suspectCount = classifications.filter((c) => c === 'suspect').length;
  const toxicCount = classifications.filter((c) => c === 'toxic').length;

  const totalRuns = outcomes.reduce((sum, o) => sum + o.usedInRuns, 0);
  const totalMisdirections = outcomes.reduce((sum, o) => sum + o.misdirectionCount, 0);
  const totalSuccesses = outcomes.reduce((sum, o) => sum + o.successCount, 0);

  return {
    totalAliases: outcomes.length,
    healthyCount,
    suspectCount,
    toxicCount,
    misdirectionRate: totalRuns > 0 ? totalMisdirections / totalRuns : 0,
    averageSuccessRate: totalRuns > 0 ? totalSuccesses / totalRuns : 0,
  };
}

// ─── Filtering ───

/**
 * Find all toxic aliases, sorted by misdirection rate descending.
 *
 * Pure filter + sort: outcomes in, toxic subset out.
 */
export function findToxicAliases(
  outcomes: readonly AliasOutcome[],
  thresholds?: QualityThresholds,
): readonly AliasOutcome[] {
  return outcomes
    .filter((o) => classifyAlias(o, thresholds) === 'toxic')
    .sort((a, b) => computeMisdirectionRate(b) - computeMisdirectionRate(a));
}

// ─── Quarantine ───

/**
 * Determine whether an alias should be quarantined.
 * True if and only if the alias is classified as toxic.
 */
export function shouldQuarantine(
  outcome: AliasOutcome,
  thresholds?: QualityThresholds,
): boolean {
  return classifyAlias(outcome, thresholds) === 'toxic';
}

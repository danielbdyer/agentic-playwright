/**
 * W4.15: Proposal quality metrics in agent→alias feedback loop
 *
 * Pure domain module for tracking and classifying alias proposal quality
 * based on accumulated runtime outcomes. Enables the system to detect
 * misdirecting aliases and quarantine toxic proposals before they
 * degrade resolution quality.
 */

import { type Fold, productFold6, runFold } from '../algebra/product-fold';

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
 * Pure function: outcomes in, metrics out. Uses `productFold6`
 * to fuse six independent reducers (three classification counters
 * + three sum reducers) into a single pass over the input — the
 * canonical use-case for the product-fold catamorphism: same
 * structure, multiple folds, one traversal.
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

  // Six independent reducers fused via productFold6:
  //   1. healthy classifications
  //   2. suspect classifications
  //   3. toxic classifications
  //   4. total runs (sum)
  //   5. total misdirections (sum)
  //   6. total successes (sum)
  const classifyKindFold = (
    kind: AliasClassification,
  ): Fold<AliasOutcome, number> => ({
    initial: 0,
    step: (acc, item) => acc + (classifyAlias(item) === kind ? 1 : 0),
  });
  const sumFold = (
    extract: (o: AliasOutcome) => number,
  ): Fold<AliasOutcome, number> => ({
    initial: 0,
    step: (acc, item) => acc + extract(item),
  });
  const fused = productFold6(
    classifyKindFold('healthy'),
    classifyKindFold('suspect'),
    classifyKindFold('toxic'),
    sumFold((o) => o.usedInRuns),
    sumFold((o) => o.misdirectionCount),
    sumFold((o) => o.successCount),
  );
  const [healthyCount, suspectCount, toxicCount, totalRuns, totalMisdirections, totalSuccesses] =
    runFold(fused, outcomes);

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

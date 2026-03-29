/**
 * SummaryView — pure domain model for the post-convergence summary view.
 *
 * After the convergence finale (regardless of reason), the visualization
 * transitions to a persistent summary view. This module computes all
 * data needed for the summary from the SceneState and ConvergenceMetrics.
 *
 * The summary includes:
 *   - Iteration timeline with per-iteration hit rates and convergence arrows
 *   - Final scorecard (9 metrics)
 *   - Resolution distribution (stacked bar)
 *   - Remaining gaps list
 *   - Before/after comparison data
 *
 * Pure domain logic — no React, no Three.js.
 *
 * @see docs/first-day-flywheel-visualization.md Part IX: Summary View
 */

import type { SceneState, SceneMetrics } from './scene-state-accumulator';
import type { ConvergenceReason, ConvergenceMetrics } from './convergence-finale';

// ─── Iteration Timeline ───

/** One bar in the iteration timeline. */
export interface IterationTimelineEntry {
  readonly iteration: number;
  readonly knowledgeHitRate: number;
  readonly passRate: number;
  readonly proposalsActivated: number;
  readonly convergenceVelocity: 'up' | 'flat' | 'down';
  readonly tint: 'green' | 'amber' | 'red';
}

/**
 * Compute iteration timeline entries from a series of iteration snapshots.
 *
 * @param snapshots Per-iteration metrics (ordered by iteration number)
 * @returns Timeline entries with velocity arrows and color tints
 */
export function computeIterationTimeline(
  snapshots: readonly IterationSnapshot[],
): readonly IterationTimelineEntry[] {
  return snapshots.map((snapshot, i) => {
    const prev = i > 0 ? snapshots[i - 1]! : null;
    const hitRateDelta = prev
      ? snapshot.knowledgeHitRate - prev.knowledgeHitRate
      : snapshot.knowledgeHitRate;

    const velocity: 'up' | 'flat' | 'down' =
      hitRateDelta > 0.02 ? 'up' :
      hitRateDelta < -0.02 ? 'down' : 'flat';

    const tint: 'green' | 'amber' | 'red' =
      snapshot.knowledgeHitRate >= 0.8 ? 'green' :
      snapshot.knowledgeHitRate >= 0.5 ? 'amber' : 'red';

    return {
      iteration: snapshot.iteration,
      knowledgeHitRate: snapshot.knowledgeHitRate,
      passRate: snapshot.passRate,
      proposalsActivated: snapshot.proposalsActivated,
      convergenceVelocity: velocity,
      tint,
    };
  });
}

/** Per-iteration metrics snapshot. */
export interface IterationSnapshot {
  readonly iteration: number;
  readonly knowledgeHitRate: number;
  readonly passRate: number;
  readonly proposalsActivated: number;
}

// ─── Final Scorecard ───

/** The 9 metrics shown in the final scorecard. */
export interface FinalScorecard {
  readonly knowledgeHitRate: number;
  readonly passRate: number;
  readonly bindCoverage: number;
  readonly totalProposals: number;
  readonly activatedProposals: number;
  readonly blockedProposals: number;
  readonly totalIterations: number;
  readonly totalDuration: string; // Formatted
  readonly humanDecisions: number;
}

/**
 * Compute the final scorecard from scene state and convergence metrics.
 */
export function computeFinalScorecard(
  metrics: ConvergenceMetrics,
  totalDurationMs: number,
  humanDecisions: number,
): FinalScorecard {
  const totalProposals = metrics.proposalsActivated + metrics.proposalsPending;
  const resolved = metrics.scenariosPassed + (metrics.totalScenarios - metrics.scenariosPassed);
  const bindCoverage = resolved > 0 ? metrics.scenariosPassed / resolved : 0;

  return {
    knowledgeHitRate: metrics.knowledgeHitRate,
    passRate: metrics.passRate,
    bindCoverage,
    totalProposals,
    activatedProposals: metrics.proposalsActivated,
    blockedProposals: totalProposals - metrics.proposalsActivated,
    totalIterations: metrics.iteration,
    totalDuration: formatScorecardDuration(totalDurationMs),
    humanDecisions,
  };
}

// ─── Resolution Distribution ───

/** Categories for the stacked bar chart. */
export interface ResolutionDistribution {
  readonly explicit: number;      // Direct scenario fields
  readonly knowledge: number;     // Knowledge-based resolution
  readonly translation: number;   // Translation/fallback
  readonly deferred: number;      // Unresolved / deferred
  readonly total: number;
}

/**
 * Compute resolution distribution from scene metrics.
 */
export function computeResolutionDistribution(metrics: SceneMetrics): ResolutionDistribution {
  const total = metrics.stepsResolved + metrics.stepsDeferred + metrics.stepsUnresolved;
  return {
    explicit: Math.round(metrics.stepsResolved * 0.4), // Estimate explicit ~40%
    knowledge: Math.round(metrics.stepsResolved * 0.4), // Estimate knowledge ~40%
    translation: Math.round(metrics.stepsResolved * 0.2), // Estimate translation ~20%
    deferred: metrics.stepsDeferred + metrics.stepsUnresolved,
    total: total > 0 ? total : 1,
  };
}

// ─── Remaining Gaps ───

/** A gap identified in the summary. */
export interface RemainingGap {
  readonly kind: 'needs-human' | 'blocked-proposal' | 'low-coverage';
  readonly description: string;
  readonly count: number;
}

/**
 * Compute remaining gaps from scene state.
 */
export function computeRemainingGaps(
  metrics: SceneMetrics,
  blockedProposals: number,
  lowCoverageScreens: number,
): readonly RemainingGap[] {
  const gaps: RemainingGap[] = [];

  if (metrics.stepsUnresolved > 0) {
    gaps[gaps.length] = {
      kind: 'needs-human',
      description: `${metrics.stepsUnresolved} steps needs-human across scenarios`,
      count: metrics.stepsUnresolved,
    };
  }

  if (blockedProposals > 0) {
    gaps[gaps.length] = {
      kind: 'blocked-proposal',
      description: `${blockedProposals} proposals blocked by trust policy`,
      count: blockedProposals,
    };
  }

  if (lowCoverageScreens > 0) {
    gaps[gaps.length] = {
      kind: 'low-coverage',
      description: `${lowCoverageScreens} screens with < 70% element coverage`,
      count: lowCoverageScreens,
    };
  }

  return gaps;
}

// ─── Before/After Comparison ───

/** Snapshot for the before/after comparison. */
export interface ObservatorySnapshot {
  readonly nodeCount: number;
  readonly approvedCount: number;
  readonly learningCount: number;
  readonly blockedCount: number;
  readonly avgConfidence: number;
  readonly screenCount: number;
}

/**
 * Compute an observatory snapshot from scene state knowledge nodes.
 */
export function computeObservatorySnapshot(
  knowledgeNodes: ReadonlyMap<string, { readonly status: string; readonly confidence: number; readonly screen: string | null }>,
): ObservatorySnapshot {
  const screens = new Set<string>();
  let approvedCount = 0;
  let learningCount = 0;
  let blockedCount = 0;
  let totalConfidence = 0;

  for (const [, node] of knowledgeNodes) {
    if (node.screen) screens.add(node.screen);
    totalConfidence += node.confidence;

    switch (node.status) {
      case 'approved':
        approvedCount++;
        break;
      case 'blocked':
        blockedCount++;
        break;
      default:
        learningCount++;
    }
  }

  return {
    nodeCount: knowledgeNodes.size,
    approvedCount,
    learningCount,
    blockedCount,
    avgConfidence: knowledgeNodes.size > 0 ? totalConfidence / knowledgeNodes.size : 0,
    screenCount: screens.size,
  };
}

/** Before/after comparison data. */
export interface BeforeAfterComparison {
  readonly before: ObservatorySnapshot;
  readonly after: ObservatorySnapshot;
  readonly nodeGrowth: number;      // after.nodeCount - before.nodeCount
  readonly confidenceGrowth: number; // after.avgConfidence - before.avgConfidence
  readonly screenGrowth: number;     // after.screenCount - before.screenCount
}

/**
 * Compute the before/after comparison from two observatory snapshots.
 */
export function computeBeforeAfterComparison(
  before: ObservatorySnapshot,
  after: ObservatorySnapshot,
): BeforeAfterComparison {
  return {
    before,
    after,
    nodeGrowth: after.nodeCount - before.nodeCount,
    confidenceGrowth: after.avgConfidence - before.avgConfidence,
    screenGrowth: after.screenCount - before.screenCount,
  };
}

// ─── Complete Summary ───

/** All data needed to render the summary view. */
export interface SummaryViewData {
  readonly convergenceReason: ConvergenceReason;
  readonly timeline: readonly IterationTimelineEntry[];
  readonly scorecard: FinalScorecard;
  readonly resolutionDistribution: ResolutionDistribution;
  readonly remainingGaps: readonly RemainingGap[];
  readonly comparison: BeforeAfterComparison | null;
}

/**
 * Assemble the complete summary view data.
 *
 * This is the single function the rendering layer calls to get
 * everything needed for the summary view.
 */
export function assembleSummaryView(params: {
  readonly convergenceReason: ConvergenceReason;
  readonly convergenceMetrics: ConvergenceMetrics;
  readonly iterationSnapshots: readonly IterationSnapshot[];
  readonly sceneMetrics: SceneMetrics;
  readonly totalDurationMs: number;
  readonly humanDecisions: number;
  readonly blockedProposals: number;
  readonly lowCoverageScreens: number;
  readonly beforeSnapshot: ObservatorySnapshot | null;
  readonly afterSnapshot: ObservatorySnapshot | null;
}): SummaryViewData {
  return {
    convergenceReason: params.convergenceReason,
    timeline: computeIterationTimeline(params.iterationSnapshots),
    scorecard: computeFinalScorecard(
      params.convergenceMetrics,
      params.totalDurationMs,
      params.humanDecisions,
    ),
    resolutionDistribution: computeResolutionDistribution(params.sceneMetrics),
    remainingGaps: computeRemainingGaps(
      params.sceneMetrics,
      params.blockedProposals,
      params.lowCoverageScreens,
    ),
    comparison: params.beforeSnapshot && params.afterSnapshot
      ? computeBeforeAfterComparison(params.beforeSnapshot, params.afterSnapshot)
      : null,
  };
}

// ─── Helpers ───

function formatScorecardDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

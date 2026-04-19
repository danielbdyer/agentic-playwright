import { expect, test } from '@playwright/test';
import {
  computeIterationTimeline,
  computeFinalScorecard,
  computeResolutionDistribution,
  computeRemainingGaps,
  computeObservatorySnapshot,
  computeBeforeAfterComparison,
  assembleSummaryView,
  type IterationSnapshot,
} from '../product/domain/projection/summary-view';
import type { SceneMetrics } from '../product/domain/projection/scene-state-accumulator';
import type { ConvergenceMetrics } from '../product/domain/projection/convergence-finale';

const SNAPSHOTS: readonly IterationSnapshot[] = [
  { iteration: 1, knowledgeHitRate: 0.3, passRate: 0.2, proposalsActivated: 5 },
  { iteration: 2, knowledgeHitRate: 0.5, passRate: 0.4, proposalsActivated: 12 },
  { iteration: 3, knowledgeHitRate: 0.7, passRate: 0.6, proposalsActivated: 20 },
  { iteration: 4, knowledgeHitRate: 0.85, passRate: 0.8, proposalsActivated: 30 },
];

const METRICS: ConvergenceMetrics = {
  iteration: 4, knowledgeHitRate: 0.85, passRate: 0.8,
  scenariosPassed: 40, totalScenarios: 50,
  proposalsPending: 3, proposalsActivated: 30, remainingGaps: 5,
};

const SCENE_METRICS: SceneMetrics = {
  knowledgeHitRate: 0.85, passRate: 0.8,
  proposalsActivated: 30, proposalsPending: 3, proposalsBlocked: 2,
  stepsResolved: 180, stepsDeferred: 15, stepsUnresolved: 5,
  scenariosPassed: 40, scenariosFailed: 10, scenariosExecuted: 50,
};

test.describe('SummaryView laws', () => {

  test('Law 1: computeIterationTimeline produces entry per snapshot', () => {
    const timeline = computeIterationTimeline(SNAPSHOTS);
    expect(timeline).toHaveLength(SNAPSHOTS.length);
  });

  test('Law 2: convergence velocity is up for improving hit rate', () => {
    const timeline = computeIterationTimeline(SNAPSHOTS);
    expect(timeline[1]!.convergenceVelocity).toBe('up'); // 0.3 → 0.5 = +0.2
    expect(timeline[2]!.convergenceVelocity).toBe('up'); // 0.5 → 0.7 = +0.2
  });

  test('Law 3: tint is green for ≥0.8, amber for ≥0.5, red for <0.5', () => {
    const timeline = computeIterationTimeline(SNAPSHOTS);
    expect(timeline[0]!.tint).toBe('red');    // 0.3
    expect(timeline[1]!.tint).toBe('amber');  // 0.5
    expect(timeline[3]!.tint).toBe('green');  // 0.85
  });

  test('Law 4: computeFinalScorecard captures all 9 fields', () => {
    const scorecard = computeFinalScorecard(METRICS, 120000, 3);
    expect(scorecard.knowledgeHitRate).toBe(0.85);
    expect(scorecard.passRate).toBe(0.8);
    expect(scorecard.totalIterations).toBe(4);
    expect(scorecard.humanDecisions).toBe(3);
    expect(scorecard.totalDuration).toBe('2:00');
    expect(scorecard.activatedProposals).toBe(30);
  });

  test('Law 5: computeResolutionDistribution sums to total steps', () => {
    const dist = computeResolutionDistribution(SCENE_METRICS);
    expect(dist.explicit + dist.knowledge + dist.translation + dist.deferred).toBe(dist.total);
  });

  test('Law 6: computeRemainingGaps includes unresolved steps', () => {
    const gaps = computeRemainingGaps(SCENE_METRICS, 2, 1);
    const unresolvedGap = gaps.find((g) => g.kind === 'needs-human');
    expect(unresolvedGap).toBeDefined();
    expect(unresolvedGap!.count).toBe(5);
  });

  test('Law 7: computeRemainingGaps includes blocked proposals', () => {
    const gaps = computeRemainingGaps(SCENE_METRICS, 2, 0);
    expect(gaps.some((g) => g.kind === 'blocked-proposal')).toBe(true);
  });

  test('Law 8: computeRemainingGaps returns empty for zero problems', () => {
    const clean: SceneMetrics = { ...SCENE_METRICS, stepsUnresolved: 0 };
    const gaps = computeRemainingGaps(clean, 0, 0);
    expect(gaps).toHaveLength(0);
  });

  test('Law 9: computeObservatorySnapshot counts nodes correctly', () => {
    const nodes = new Map([
      ['login:btn', { status: 'approved', confidence: 0.9, screen: 'login' }],
      ['login:input', { status: 'learning', confidence: 0.5, screen: 'login' }],
      ['search:field', { status: 'blocked', confidence: 0.1, screen: 'search' }],
    ]);
    const snapshot = computeObservatorySnapshot(nodes);
    expect(snapshot.nodeCount).toBe(3);
    expect(snapshot.approvedCount).toBe(1);
    expect(snapshot.learningCount).toBe(1);
    expect(snapshot.blockedCount).toBe(1);
    expect(snapshot.screenCount).toBe(2);
    expect(snapshot.avgConfidence).toBeCloseTo(0.5, 1);
  });

  test('Law 10: computeBeforeAfterComparison computes growth deltas', () => {
    const before = { nodeCount: 3, approvedCount: 0, learningCount: 3, blockedCount: 0, avgConfidence: 0.3, screenCount: 1 };
    const after = { nodeCount: 50, approvedCount: 40, learningCount: 8, blockedCount: 2, avgConfidence: 0.85, screenCount: 5 };
    const comparison = computeBeforeAfterComparison(before, after);
    expect(comparison.nodeGrowth).toBe(47);
    expect(comparison.screenGrowth).toBe(4);
    expect(comparison.confidenceGrowth).toBeCloseTo(0.55, 2);
  });

  test('Law 11: assembleSummaryView composes all sub-computations', () => {
    const before = { nodeCount: 3, approvedCount: 0, learningCount: 3, blockedCount: 0, avgConfidence: 0.3, screenCount: 1 };
    const after = { nodeCount: 50, approvedCount: 40, learningCount: 8, blockedCount: 2, avgConfidence: 0.85, screenCount: 5 };

    const summary = assembleSummaryView({
      convergenceReason: 'threshold-met',
      convergenceMetrics: METRICS,
      iterationSnapshots: SNAPSHOTS,
      sceneMetrics: SCENE_METRICS,
      totalDurationMs: 120000,
      humanDecisions: 3,
      blockedProposals: 2,
      lowCoverageScreens: 1,
      beforeSnapshot: before,
      afterSnapshot: after,
    });

    expect(summary.convergenceReason).toBe('threshold-met');
    expect(summary.timeline).toHaveLength(4);
    expect(summary.scorecard.knowledgeHitRate).toBe(0.85);
    expect(summary.resolutionDistribution.total).toBeGreaterThan(0);
    expect(summary.remainingGaps.length).toBeGreaterThan(0);
    expect(summary.comparison).not.toBeNull();
    expect(summary.comparison!.nodeGrowth).toBe(47);
  });

  test('Law 12: assembleSummaryView handles null before/after', () => {
    const summary = assembleSummaryView({
      convergenceReason: 'budget-exhausted',
      convergenceMetrics: METRICS,
      iterationSnapshots: SNAPSHOTS,
      sceneMetrics: SCENE_METRICS,
      totalDurationMs: 60000,
      humanDecisions: 0,
      blockedProposals: 0,
      lowCoverageScreens: 0,
      beforeSnapshot: null,
      afterSnapshot: null,
    });
    expect(summary.comparison).toBeNull();
  });
});

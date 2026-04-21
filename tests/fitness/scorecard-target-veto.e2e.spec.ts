/**
 * End-to-end: critical-floor veto in `compareToScorecard`.
 *
 * `tests/fitness/targets.laws.spec.ts` proves `hasCriticalFloorViolation`
 * is mathematically correct in isolation. This test proves the veto
 * actually fires inside `compareToScorecard` when a synthesized fitness
 * report regresses below a critical floor — the Phase 3.2 wiring point.
 *
 * Scenario: a "good" baseline report beats the mark on first comparison
 * (no existing scorecard). A subsequent "regressed" report whose
 * effectiveHitRate drops below the 0.4 critical floor is VETOED even if
 * other objectives look fine.
 *
 * This test will fail if:
 *   - Phase 3.2 veto is disconnected from `compareToScorecard`
 *   - `ALIGNMENT_TARGETS` loses the critical-floor entry
 *   - The veto path silently swallows exceptions
 */

import { expect, test } from '@playwright/test';
import {
  compareToScorecard,
  updateScorecard,
} from '../../workshop/orchestration/fitness';
import type {
  PipelineFitnessMetrics,
  PipelineFitnessReport,
  PipelineScorecard,
} from '../../product/domain/fitness/types';

function baseMetrics(overrides: Partial<PipelineFitnessMetrics> = {}): PipelineFitnessMetrics {
  return {
    effectiveHitRate: 0.75,
    knowledgeHitRate: 0.7,
    translationPrecision: 0.85,
    translationRecall: 0.8,
    convergenceVelocity: 3,
    proposalYield: 0.9,
    resolutionByRung: [],
    degradedLocatorRate: 0.05,
    recoverySuccessRate: 0.95,
    ambiguityRate: 0.1,
    suspensionRate: 0.05,
    agentFallbackRate: 0.1,
    liveDomFallbackRate: 0.05,
    routeMismatchRate: 0.05,
    ...overrides,
  };
}

function report(metrics: PipelineFitnessMetrics, runAt: string): PipelineFitnessReport {
  return {
    kind: 'pipeline-fitness-report',
    version: 1,
    pipelineVersion: 'e2e-veto-test',
    runAt,
    baseline: true,
    metrics,
    failureModes: [],
    scoringEffectiveness: {
      bottleneckWeightCorrelations: [],
      proposalRankingAccuracy: 0.9,
    },
  };
}

test('first-run comparison accepts baseline unconditionally', () => {
  const firstReport = report(baseMetrics(), '2026-04-07T00:00:00.000Z');
  const comparison = compareToScorecard(firstReport, null);
  expect(comparison.improved).toBe(true);
  expect(comparison.summary).toContain('First run');
});

test('healthy improvement above critical floor is accepted', () => {
  const existing: PipelineScorecard = {
    kind: 'pipeline-scorecard',
    version: 1,
    highWaterMark: {
      setAt: '2026-04-06T00:00:00.000Z',
      pipelineVersion: 'v1',
      effectiveHitRate: 0.6,
      knowledgeHitRate: 0.6,
      translationPrecision: 0.8,
      convergenceVelocity: 4,
      proposalYield: 0.85,
      resolutionByRung: [],
    },
    history: [],
  };
  // Improved: effectiveHitRate went from 0.6 → 0.75
  const improvedReport = report(
    baseMetrics({ effectiveHitRate: 0.75 }),
    '2026-04-07T00:00:00.000Z',
  );
  const comparison = compareToScorecard(improvedReport, existing);
  expect(comparison.improved).toBe(true);
  expect(comparison.summary).toContain('Beat the mark');
});

test('critical-floor violation VETOES acceptance even with Pareto gain', () => {
  // Establish an existing scorecard with a Pareto frontier.
  const existing: PipelineScorecard = {
    kind: 'pipeline-scorecard',
    version: 1,
    highWaterMark: {
      setAt: '2026-04-06T00:00:00.000Z',
      pipelineVersion: 'v1',
      effectiveHitRate: 0.5,
      knowledgeHitRate: 0.5,
      translationPrecision: 0.7,
      convergenceVelocity: 5,
      proposalYield: 0.7,
      resolutionByRung: [],
    },
    history: [],
    paretoFrontier: [{
      pipelineVersion: 'v1',
      addedAt: '2026-04-06T00:00:00.000Z',
      objectives: {
        effectiveHitRate: 0.5,
        knowledgeHitRate: 0.5,
        translationPrecision: 0.7,
        convergenceVelocity: 5,
        proposalYield: 0.7,
      },
    }],
  };

  // A candidate that IMPROVES translationPrecision and proposalYield
  // (Pareto-positive) but REGRESSES effectiveHitRate below the 0.4
  // critical floor. The Pareto-only gate would accept this; the veto
  // must reject it.
  const regressedReport = report(
    baseMetrics({
      effectiveHitRate: 0.3, // BELOW critical floor 0.4
      knowledgeHitRate: 0.3,
      translationPrecision: 0.95, // gain
      proposalYield: 0.95, // gain
      convergenceVelocity: 3, // fewer iterations = Pareto gain
    }),
    '2026-04-07T00:00:00.000Z',
  );

  const comparison = compareToScorecard(regressedReport, existing);
  expect(comparison.improved).toBe(false);
  expect(comparison.summary.toLowerCase()).toContain('vetoed');
  expect(comparison.summary).toContain('critical-floor');
});

test('target-veto blocks scorecard high-water-mark advancement', () => {
  // Same shape as above, but we exercise the full updateScorecard path.
  const existing: PipelineScorecard = {
    kind: 'pipeline-scorecard',
    version: 1,
    highWaterMark: {
      setAt: '2026-04-06T00:00:00.000Z',
      pipelineVersion: 'v1',
      effectiveHitRate: 0.6,
      knowledgeHitRate: 0.6,
      translationPrecision: 0.8,
      convergenceVelocity: 4,
      proposalYield: 0.85,
      resolutionByRung: [],
    },
    history: [],
  };

  const vetoedReport = report(
    baseMetrics({ effectiveHitRate: 0.2, knowledgeHitRate: 0.2 }),
    '2026-04-07T00:00:00.000Z',
  );
  const comparison = compareToScorecard(vetoedReport, existing);
  expect(comparison.improved).toBe(false);

  const updated = updateScorecard(vetoedReport, existing, comparison);
  // The high-water-mark MUST be preserved from `existing` — the vetoed
  // report is not allowed to advance it.
  expect(updated.highWaterMark.effectiveHitRate).toBe(0.6);
  expect(updated.highWaterMark.pipelineVersion).toBe('v1');
  // But the history record should still land, flagged as not-improved.
  expect(updated.history.length).toBe(1);
  expect(updated.history[0]!.improved).toBe(false);
});

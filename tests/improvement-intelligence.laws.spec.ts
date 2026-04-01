import { test, expect } from '@playwright/test';
import {
  buildImprovementIntelligence,
  extractTopPriorities,
  computeImprovementTrends,
} from '../lib/application/improvement-intelligence';
import type { PipelineFitnessReport } from '../lib/domain/types';

function makeFitnessReport(overrides?: Partial<{
  failureModes: PipelineFitnessReport['failureModes'];
  metrics: Partial<PipelineFitnessReport['metrics']>;
}>): PipelineFitnessReport {
  return {
    kind: 'pipeline-fitness-report',
    version: 1,
    pipelineVersion: '1.0.0',
    runAt: '2026-01-01T00:00:00Z',
    baseline: true,
    metrics: {
      knowledgeHitRate: 0.8,
      translationPrecision: 0.9,
      translationRecall: 0.7,
      convergenceVelocity: 2,
      proposalYield: 0.6,
      resolutionByRung: [],
      degradedLocatorRate: 0.1,
      recoverySuccessRate: 0.85,
      ...overrides?.metrics,
    },
    failureModes: overrides?.failureModes ?? [],
    scoringEffectiveness: {
      bottleneckWeightCorrelations: [],
      proposalRankingAccuracy: 0.7,
    },
  };
}

function makeFailureMode(cls: string, count: number, intents: string[]): PipelineFitnessReport['failureModes'][number] {
  return {
    class: cls as never,
    count,
    affectedSteps: count,
    exampleIntents: intents,
    improvementTarget: { kind: 'translation', detail: 'test' },
  };
}

test('Law 1: buildImprovementIntelligence produces valid report', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport(),
    runRecords: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('improvement-intelligence-report');
  expect(report.version).toBe(1);
});

test('Law 2: overallHealthScore is in [0, 1]', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport(),
    runRecords: [],
  });
  expect(report.overallHealthScore).toBeGreaterThanOrEqual(0);
  expect(report.overallHealthScore).toBeLessThanOrEqual(1);
});

test('Law 3: correlationRate is in [0, 1]', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
        makeFailureMode('recovery-strategy-miss', 3, ['Click Submit']),
      ],
    }),
    runRecords: [],
  });
  expect(report.correlationRate).toBeGreaterThanOrEqual(0);
  expect(report.correlationRate).toBeLessThanOrEqual(1);
});

test('Law 4: priorities are ranked by combinedScore descending', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 10, ['Fill A.Field']),
        makeFailureMode('alias-coverage-gap', 2, ['Click B.Button']),
      ],
    }),
    runRecords: [],
  });
  for (let i = 1; i < report.priorities.length; i++) {
    expect(report.priorities[i]!.combinedScore).toBeLessThanOrEqual(
      report.priorities[i - 1]!.combinedScore,
    );
  }
});

test('Law 5: priorities have sequential rank numbers starting at 1', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill A.Field']),
        makeFailureMode('alias-coverage-gap', 3, ['Click B.Button']),
      ],
    }),
    runRecords: [],
  });
  for (let i = 0; i < report.priorities.length; i++) {
    expect(report.priorities[i]!.rank).toBe(i + 1);
  }
});

test('Law 6: extractTopPriorities limits to N items', () => {
  const report = buildImprovementIntelligence({
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill A.Field']),
        makeFailureMode('alias-coverage-gap', 3, ['Click B.Button']),
        makeFailureMode('recovery-strategy-miss', 2, ['Click C.Button']),
      ],
    }),
    runRecords: [],
  });
  const top2 = extractTopPriorities(report, 2);
  expect(top2.length).toBeLessThanOrEqual(2);
});

test('Law 7: computeImprovementTrends returns 5 dimensions', () => {
  const reports = [
    makeFitnessReport({ metrics: { knowledgeHitRate: 0.5 } }),
    makeFitnessReport({ metrics: { knowledgeHitRate: 0.7 } }),
    makeFitnessReport({ metrics: { knowledgeHitRate: 0.9 } }),
  ];
  const trends = computeImprovementTrends(reports);
  expect(trends.length).toBe(5);
  expect(trends.map((t) => t.dimension)).toContain('knowledgeHitRate');
});

test('Law 8: computeImprovementTrends detects improving trend', () => {
  const reports = [
    makeFitnessReport({ metrics: { knowledgeHitRate: 0.3 } }),
    makeFitnessReport({ metrics: { knowledgeHitRate: 0.9 } }),
  ];
  const trends = computeImprovementTrends(reports);
  const hitRate = trends.find((t) => t.dimension === 'knowledgeHitRate');
  expect(hitRate!.direction).toBe('improving');
});

test('Law 9: computeImprovementTrends detects degrading trend', () => {
  const reports = [
    makeFitnessReport({ metrics: { degradedLocatorRate: 0.05 } }),
    makeFitnessReport({ metrics: { degradedLocatorRate: 0.5 } }),
  ];
  const trends = computeImprovementTrends(reports);
  const degradation = trends.find((t) => t.dimension === 'degradedLocatorRate');
  expect(degradation!.direction).toBe('degrading');
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [] as never[],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildImprovementIntelligence(input);
  const r2 = buildImprovementIntelligence(input);
  expect(r1.overallHealthScore).toBe(r2.overallHealthScore);
  expect(r1.correlationRate).toBe(r2.correlationRate);
  expect(r1.priorities.length).toBe(r2.priorities.length);
  expect(r1.trends.length).toBe(r2.trends.length);
});

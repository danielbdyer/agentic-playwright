import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { expect, test } from '@playwright/test';
import { projectBenchmarkScorecard } from '../lib/application/benchmark';
import { buildImprovementRun, improvementLedgerPath } from '../lib/application/improvement';
import { benchmarkDogfoodRunPath, benchmarkImprovementProjectionPath } from '../lib/application/paths';
import { runWithLocalServices } from '../lib/composition/local-services';
import { createAdoId } from '../lib/domain/identity';
import { DEFAULT_PIPELINE_CONFIG, type PipelineFitnessReport } from '../lib/domain/types';
import { validateBenchmarkImprovementProjection, validateDogfoodRun } from '../lib/domain/validation/execution';
import { createTestWorkspace } from './support/workspace';

function sampleFitnessReport(): PipelineFitnessReport {
  return {
    kind: 'pipeline-fitness-report',
    version: 1,
    pipelineVersion: 'abc123',
    runAt: '2026-03-19T12:00:00.000Z',
    baseline: true,
    metrics: {
      knowledgeHitRate: 0.75,
      translationPrecision: 0.8,
      translationRecall: 0.6,
      convergenceVelocity: 2,
      proposalYield: 0.9,
      resolutionByRung: [
        { rung: 'approved-screen-knowledge', wins: 3, rate: 0.75 },
        { rung: 'structured-translation', wins: 1, rate: 0.25 },
      ],
      degradedLocatorRate: 0.1,
      recoverySuccessRate: 1,
    },
    failureModes: [
      {
        class: 'translation-threshold-miss',
        count: 2,
        affectedSteps: 2,
        exampleIntents: ['search by policy number'],
        improvementTarget: {
          kind: 'translation',
          detail: 'Adjust overlap score threshold or improve scoring formula',
        },
      },
    ],
    scoringEffectiveness: {
      bottleneckWeightCorrelations: [
        {
          signal: 'translation-fallback-dominant',
          weight: 0.25,
          correlationWithImprovement: 0.1,
        },
      ],
      proposalRankingAccuracy: 0.9,
    },
  };
}

test('benchmark scorecard projects related recursive-improvement lineage into compatibility artifacts', async () => {
  const workspace = createTestWorkspace('benchmark-improvement');
  try {
    const adoId = createAdoId('10001');
    const improvementRun = buildImprovementRun({
      paths: workspace.paths,
      pipelineVersion: 'abc123',
      baselineConfig: DEFAULT_PIPELINE_CONFIG,
      configDelta: { translationThreshold: 0.42 },
      substrateContext: {
        substrate: 'synthetic',
        seed: 'benchmark-improvement',
        scenarioCount: 1,
        screenCount: 1,
        phrasingTemplateVersion: 'v1',
      },
      fitnessReport: sampleFitnessReport(),
      scorecardComparison: {
        improved: true,
        knowledgeHitRateDelta: 0.1,
        translationPrecisionDelta: 0.05,
        convergenceVelocityDelta: -1,
      },
      scorecardSummary: 'Accepted by governed scorecard gate.',
      ledger: {
        kind: 'dogfood-ledger',
        version: 1,
        maxIterations: 2,
        completedIterations: 2,
        converged: true,
        convergenceReason: 'threshold-met',
        iterations: [
          {
            iteration: 1,
            scenarioIds: [adoId],
            proposalsActivated: 1,
            proposalsBlocked: 0,
            knowledgeHitRate: 0.5,
            unresolvedStepCount: 2,
            totalStepCount: 4,
            instructionCount: 4,
          },
          {
            iteration: 2,
            scenarioIds: [adoId],
            proposalsActivated: 1,
            proposalsBlocked: 0,
            knowledgeHitRate: 0.75,
            unresolvedStepCount: 1,
            totalStepCount: 4,
            instructionCount: 3,
          },
        ],
        totalProposalsActivated: 2,
        totalInstructionCount: 7,
        knowledgeHitRateDelta: 0.25,
      },
      parentExperimentId: null,
      tags: ['benchmark'],
    });

    const ledgerFile = improvementLedgerPath(workspace.paths);
    mkdirSync(path.dirname(ledgerFile), { recursive: true });
    writeFileSync(
      ledgerFile,
      `${JSON.stringify({ kind: 'improvement-ledger', version: 1, runs: [improvementRun] }, null, 2)}\n`,
      'utf8',
    );

    const result = await runWithLocalServices(
      projectBenchmarkScorecard({
        paths: workspace.paths,
        benchmarkName: 'flagship-policy-journey',
        includeExecution: false,
      }),
      workspace.rootDir,
    );
    const benchmarkImprovementPath = benchmarkImprovementProjectionPath(
      workspace.paths,
      'flagship-policy-journey',
      result.benchmarkImprovementProjection.runId,
    );
    const dogfoodPath = benchmarkDogfoodRunPath(workspace.paths, 'flagship-policy-journey', result.dogfoodRun.runId);
    const benchmarkImprovementArtifact = JSON.parse(readFileSync(benchmarkImprovementPath, 'utf8').replace(/^\uFEFF/, ''));
    const dogfoodRunArtifact = JSON.parse(readFileSync(dogfoodPath, 'utf8').replace(/^\uFEFF/, ''));
    const scorecardMarkdown = readFileSync(result.scorecardMarkdownPath, 'utf8').replace(/^\uFEFF/, '');

    expect(validateBenchmarkImprovementProjection(result.benchmarkImprovementProjection)).toEqual(result.benchmarkImprovementProjection);
    expect(validateDogfoodRun(result.dogfoodRun)).toEqual(result.dogfoodRun);
    expect(validateBenchmarkImprovementProjection(benchmarkImprovementArtifact).kind).toBe('benchmark-improvement-projection');
    expect(validateDogfoodRun(dogfoodRunArtifact).kind).toBe('dogfood-run');
    expect(result.benchmarkImprovementProjection.kind).toBe('benchmark-improvement-projection');
    expect(result.benchmarkImprovementProjection.improvement?.latestRunId).toBe(improvementRun.improvementRunId);
    expect(result.dogfoodRun.improvement?.latestRunId).toBe(improvementRun.improvementRunId);
    expect(result.dogfoodRun.improvement?.latestVerdict).toBe('accepted');
    expect(benchmarkImprovementArtifact.kind).toBe('benchmark-improvement-projection');
    expect(benchmarkImprovementArtifact.improvement?.latestRunId).toBe(improvementRun.improvementRunId);
    expect(dogfoodRunArtifact.improvement?.latestRunId).toBe(improvementRun.improvementRunId);
    expect(dogfoodRunArtifact.improvement?.relatedRunIds).toContain(improvementRun.improvementRunId);
    expect(scorecardMarkdown).toContain('## Recursive Improvement');
    expect(scorecardMarkdown).toContain('## Benchmark Improvement Projection');
    expect(scorecardMarkdown).toContain(`- Latest run: ${improvementRun.improvementRunId}`);
    expect(scorecardMarkdown).toContain('- Latest verdict: accepted');
  } finally {
    workspace.cleanup();
  }
});

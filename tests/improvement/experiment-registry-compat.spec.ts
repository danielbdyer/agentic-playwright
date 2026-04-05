import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { expect, test } from '@playwright/test';
import { loadExperimentRegistry } from '../../lib/application/improvement/experiment-registry';
import { buildImprovementRun, improvementLedgerPath } from '../../lib/application/improvement/improvement';
import { createProjectPaths } from '../../lib/application/paths';
import { runWithLocalServices } from '../../lib/composition/local-services';
import { DEFAULT_PIPELINE_CONFIG } from '../../lib/domain/attention/pipeline-config';
import { PipelineFitnessReport } from '../../lib/domain/fitness/types';

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

test('experiment registry loads recursive-improvement history from the improvement ledger', async () => {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'tesseract-experiment-registry-'));
  const suiteRoot = path.join(rootDir, 'dogfood');
  mkdirSync(suiteRoot, { recursive: true });

  try {
    const paths = createProjectPaths(rootDir, suiteRoot);
    const run = buildImprovementRun({
      paths,
      pipelineVersion: 'abc123',
      baselineConfig: DEFAULT_PIPELINE_CONFIG,
      configDelta: { translationThreshold: 0.42 },
      substrateContext: {
        substrate: 'synthetic',
        seed: 'compat-seed',
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
            scenarioIds: ['10001'],
            proposalsGenerated: 1,
            proposalsActivated: 1,
            proposalsBlocked: 0,
            knowledgeHitRate: 0.5,
            unresolvedStepCount: 2,
            totalStepCount: 4,
            instructionCount: 4,
          },
          {
            iteration: 2,
            scenarioIds: ['10001'],
            proposalsGenerated: 1,
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
      tags: ['speedrun'],
    });

    const improvementLedgerFile = improvementLedgerPath(paths);
    mkdirSync(path.dirname(improvementLedgerFile), { recursive: true });
    writeFileSync(
      improvementLedgerFile,
      `${JSON.stringify({ kind: 'improvement-ledger', version: 1, runs: [run] }, null, 2)}\n`,
      'utf8',
    );

    const registry = await runWithLocalServices(loadExperimentRegistry(paths), rootDir);

    expect(registry.experiments).toHaveLength(1);
    expect(registry.experiments[0]?.improvementRunId).toBe(run.improvementRunId);
    expect(registry.experiments[0]?.improvementRun?.acceptanceDecisions[0]?.verdict).toBe('accepted');
  } finally {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

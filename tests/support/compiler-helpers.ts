import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import { expect } from '@playwright/test';
import { buildImprovementRun, improvementLedgerPath } from '../../lib/application/improvement/improvement';
import type { ProjectionCacheMissIncremental, ProjectionIncremental } from '../../lib/application/projections/runner';
import { createElementId, createScreenId, createSurfaceId } from '../../lib/domain/kernel/identity';
import type { createAdoId } from '../../lib/domain/kernel/identity';
import { DEFAULT_PIPELINE_CONFIG } from '../../lib/domain/attention/pipeline-config';
import { PipelineFitnessReport } from '../../lib/domain/fitness/types';
import type { createTestWorkspace } from './workspace';

export const policySearchScreenId = createScreenId('policy-search');
export const policyNumberInputId = createElementId('policyNumberInput');
export const searchButtonId = createElementId('searchButton');
export const resultsTableId = createElementId('resultsTable');
export const resultsGridId = createSurfaceId('results-grid');
export const searchFormId = createSurfaceId('search-form');

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function projectPath(value: string): string {
  return value.replace(/\\/g, '/');
}

export function incrementalKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort((left, right) => left.localeCompare(right));
}

export function expectCacheMiss(incremental: ProjectionIncremental): ProjectionCacheMissIncremental {
  expect(incremental.status).toBe('cache-miss');
  if (incremental.status !== 'cache-miss') {
    throw new Error(`Expected cache-miss incremental result, received ${incremental.status}`);
  }
  return incremental;
}

export function sampleImprovementRunForScenario(
  workspace: ReturnType<typeof createTestWorkspace>,
  adoId: ReturnType<typeof createAdoId>,
) {
  const fitnessReport: PipelineFitnessReport = {
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

  return buildImprovementRun({
    paths: workspace.paths,
    pipelineVersion: 'abc123',
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta: {},
    substrateContext: {
      substrate: 'synthetic',
      seed: 'graph-seed',
      scenarioCount: 1,
      screenCount: 1,
      phrasingTemplateVersion: 'v1',
    },
    fitnessReport,
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
          scenarioIds: [adoId],
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
}

export function writeImprovementLedgerFixture(
  workspace: ReturnType<typeof createTestWorkspace>,
  run: ReturnType<typeof buildImprovementRun>,
) {
  const improvementLedgerFile = improvementLedgerPath(workspace.paths);
  mkdirSync(path.dirname(improvementLedgerFile), { recursive: true });
  writeFileSync(
    improvementLedgerFile,
    `${JSON.stringify({ kind: 'improvement-ledger', version: 1, runs: [run] }, null, 2)}\n`,
    'utf8',
  );
}

import { expect, test } from '@playwright/test';
import { buildImprovementRun, toExperimentRecord } from '../../lib/application/improvement/improvement';
import { createProjectPaths } from '../../lib/application/paths';
import { DEFAULT_PIPELINE_CONFIG } from '../../lib/domain/attention/pipeline-config';
import { PipelineFitnessReport } from '../../lib/domain/fitness/types';
import {
  DogfoodLedgerProjection,
  acceptedImprovementRuns,
  appendImprovementRun,
  emptyImprovementLedger,
} from '../../lib/domain/improvement/types';

function sampleLedger(): DogfoodLedgerProjection {
  return {
    kind: 'dogfood-ledger',
    version: 1,
    maxIterations: 3,
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
  };
}

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
        exampleIntents: ['search by policy number', 'confirm results table'],
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

test('buildImprovementRun emits one coherent recursive-improvement aggregate', () => {
  const run = buildImprovementRun({
    paths: createProjectPaths('C:/tmp/agentic-playwright', 'C:/tmp/agentic-playwright/dogfood'),
    pipelineVersion: 'abc123',
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta: { translationThreshold: 0.42 },
    substrateContext: {
      substrate: 'synthetic',
      seed: 'speedrun-seed',
      scenarioCount: 1,
      screenCount: 1,
      phrasingTemplateVersion: 'v1',
    },
    fitnessReport: sampleFitnessReport(),
    scorecardComparison: {
      improved: true,
      effectiveHitRateDelta: 0.1,
      knowledgeHitRateDelta: 0.1,
      translationPrecisionDelta: 0.05,
      convergenceVelocityDelta: -1,
    },
    scorecardSummary: 'Accepted by governed scorecard gate.',
    ledger: sampleLedger(),
    parentExperimentId: null,
    tags: ['speedrun'],
  });

  expect(run.participants.map((participant) => participant.kind)).toEqual(['benchmark-runner', 'optimizer']);
  expect(run.interventions).toHaveLength(1);
  expect(run.interventions[0]?.ids?.improvementRunId).toBe(run.improvementRunId);
  expect(run.iterations.at(-1)?.signalIds).toEqual(run.signals.map((signal) => signal.signalId));
  expect(run.acceptanceDecisions[0]?.candidateInterventionIds).toEqual(
    run.candidateInterventions.map((candidate) => candidate.candidateId),
  );
  expect(run.lineage.some((entry) => entry.kind === 'checkpoint')).toBe(true);

  const experimentRecord = toExperimentRecord(run);
  expect(experimentRecord.improvementRunId).toBe(run.improvementRunId);
  expect(experimentRecord.improvementRun).toEqual(run);
});

test('improvement ledger stays append-only and filters accepted runs', () => {
  const run = buildImprovementRun({
    paths: createProjectPaths('C:/tmp/agentic-playwright', 'C:/tmp/agentic-playwright/dogfood'),
    pipelineVersion: 'abc123',
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta: {},
    substrateContext: {
      substrate: 'synthetic',
      seed: 'speedrun-seed',
      scenarioCount: 1,
      screenCount: 1,
      phrasingTemplateVersion: 'v1',
    },
    fitnessReport: sampleFitnessReport(),
    scorecardComparison: {
      improved: true,
      effectiveHitRateDelta: 0.1,
      knowledgeHitRateDelta: 0.1,
      translationPrecisionDelta: 0.05,
      convergenceVelocityDelta: -1,
    },
    scorecardSummary: 'Accepted by governed scorecard gate.',
    ledger: sampleLedger(),
    parentExperimentId: null,
  });

  const empty = emptyImprovementLedger();
  const appended = appendImprovementRun(empty, run);

  expect(empty.runs).toHaveLength(0);
  expect(appended.runs).toHaveLength(1);
  expect(acceptedImprovementRuns(appended).map((entry) => entry.improvementRunId)).toEqual([run.improvementRunId]);
});

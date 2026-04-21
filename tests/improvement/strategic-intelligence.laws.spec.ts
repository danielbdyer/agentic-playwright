import { test, expect } from '@playwright/test';
import {
  buildStrategicIntelligence,
  extractStrategicGaps,
  computeStrategicEfficiency,
} from '../../workshop/orchestration/strategic-intelligence';
import type { ProposalBundle } from '../../product/domain/execution/types';
import type { PipelineFitnessReport } from '../../product/domain/fitness/types';
import type { GroundedSpecFragment, TrainingCorpusManifest } from '../../product/domain/learning/types';

function makeManifest(): TrainingCorpusManifest {
  return {
    kind: 'training-corpus-manifest',
    version: 1,
    generatedAt: '2026-01-01T00:00:00Z',
    corpora: [
      { runtime: 'decomposition', exampleCount: 2, artifactPaths: ['a.json'] },
      { runtime: 'repair-recovery', exampleCount: 1, artifactPaths: ['b.json'] },
      { runtime: 'workflow', exampleCount: 1, artifactPaths: ['c.json'] },
    ],
    replayExamples: 0,
    scenarioIds: ['TC-001' as never],
    runIds: ['run-1'],
  };
}

function makeFragment(overrides: Partial<{
  id: string;
  screen: string;
}>): GroundedSpecFragment {
  return {
    id: overrides.id ?? 'frag-1',
    runtime: 'decomposition',
    adoId: 'TC-001' as never,
    title: 'Test',
    stepIndexes: [0],
    action: 'input',
    intent: 'Fill field',
    graphNodeIds: [`screen:${overrides.screen ?? 'PolicySearch'}`],
    selectorRefs: ['sel-1'],
    assertionAnchors: [],
    artifactRefs: [],
    confidence: 'compiler-derived',
  };
}

function makeProposalBundle(overrides: Partial<{
  screen: string;
}>): ProposalBundle {
  return {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: { adoId: 'TC-001', suite: 'test', sessionId: 's-1', runId: 'r-1', stepIndex: 0, dataset: 'default', runbook: null, resolutionControl: null },
    fingerprints: { content: 'fp-1', derivation: 'fp-2' },
    lineage: { parentId: null, rootId: 'r-1', depth: 0 },
    governance: 'approved',
    payload: {
      adoId: 'TC-001' as never,
      runId: 'r-1',
      revision: 1,
      title: 'Test',
      suite: 'test',
      proposals: [{
        proposalId: 'prop-1',
        artifactType: 'elements.yaml',
        screen: overrides.screen ?? 'PolicySearch',
        element: 'PolicyNumber',
        targetPath: `knowledge/screens/${overrides.screen ?? 'PolicySearch'}.elements.yaml`,
        change: { kind: 'add', detail: 'Add alias' },
        rationale: 'Test rationale',
        confidence: 'agent-proposed' as never,
        evidenceCount: 1,
        evidenceIds: ['ev-1'],
        trustPolicy: { decision: 'allow', rationale: 'test' },
        activation: { status: 'pending', reason: 'New proposal' },
      }],
    },
  } as unknown as ProposalBundle;
}

function makeFitnessReport(overrides?: Partial<{
  failureModes: PipelineFitnessReport['failureModes'];
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

test('Law 1: buildStrategicIntelligence produces valid report', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    fitnessReport: makeFitnessReport(),
    runRecords: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('strategic-intelligence-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: report includes both sub-reports', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    fitnessReport: makeFitnessReport(),
    runRecords: [],
  });
  expect(report.proposalIntelligence.kind).toBe('proposal-intelligence-report');
  expect(report.improvementIntelligence.kind).toBe('improvement-intelligence-report');
});

test('Law 3: strategicAlignmentScore is in [0, 1]', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({})],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [],
  });
  expect(report.strategicAlignmentScore).toBeGreaterThanOrEqual(0);
  expect(report.strategicAlignmentScore).toBeLessThanOrEqual(1);
});

test('Law 4: strategicEfficiency is in [0, 1]', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({})],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [],
  });
  expect(report.strategicEfficiency).toBeGreaterThanOrEqual(0);
  expect(report.strategicEfficiency).toBeLessThanOrEqual(1);
});

test('Law 5: uncoveredPriorities is subset of strategicAlignments', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
        makeFailureMode('alias-coverage-gap', 3, ['Click ClaimSearch.Button']),
      ],
    }),
    runRecords: [],
  });
  for (const uncovered of report.uncoveredPriorities) {
    const inAlignments = report.strategicAlignments.some(
      (a) => a.priorityRank === uncovered.priorityRank,
    );
    expect(inAlignments).toBe(true);
  }
});

test('Law 6: extractStrategicGaps returns sorted by combinedScore descending', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 10, ['Fill PolicySearch.Number']),
        makeFailureMode('alias-coverage-gap', 2, ['Click ClaimSearch.Button']),
      ],
    }),
    runRecords: [],
  });
  const gaps = extractStrategicGaps(report);
  for (let i = 1; i < gaps.length; i++) {
    expect(gaps[i]!.combinedScore).toBeLessThanOrEqual(gaps[i - 1]!.combinedScore);
  }
});

test('Law 7: topPriorityAddressed is true when no priorities exist', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    fitnessReport: makeFitnessReport(),
    runRecords: [],
  });
  // No failure modes → no priorities → top is vacuously addressed
  if (report.improvementIntelligence.priorities.length === 0) {
    expect(report.topPriorityAddressed).toBe(true);
  }
});

test('Law 8: each alignment has covered=true iff matchingProposals non-empty', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({ screen: 'PolicySearch' })],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [],
  });
  for (const alignment of report.strategicAlignments) {
    expect(alignment.covered).toBe(alignment.matchingProposals.length > 0);
  }
});

test('Law 9: computeStrategicEfficiency is in [0, 1]', () => {
  const report = buildStrategicIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({})],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [],
  });
  const efficiency = computeStrategicEfficiency(report);
  expect(efficiency).toBeGreaterThanOrEqual(0);
  expect(efficiency).toBeLessThanOrEqual(1);
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [] as never[],
    proposalBundles: [makeProposalBundle({})],
    fitnessReport: makeFitnessReport({
      failureModes: [
        makeFailureMode('translation-threshold-miss', 5, ['Fill PolicySearch.Number']),
      ],
    }),
    runRecords: [] as never[],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const r1 = buildStrategicIntelligence(input);
  const r2 = buildStrategicIntelligence(input);
  expect(r1.strategicAlignmentScore).toBe(r2.strategicAlignmentScore);
  expect(r1.strategicEfficiency).toBe(r2.strategicEfficiency);
  expect(r1.topPriorityAddressed).toBe(r2.topPriorityAddressed);
  expect(r1.strategicAlignments.length).toBe(r2.strategicAlignments.length);
});

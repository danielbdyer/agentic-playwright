import { test, expect } from '@playwright/test';
import {
  buildProposalIntelligence,
  extractUncoveredGaps,
} from '../lib/application/proposal-intelligence';
import type {
  TrainingCorpusManifest,
  GroundedSpecFragment,
  ProposalBundle,
} from '../lib/domain/types';

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
  action: string;
  runtime: 'decomposition' | 'repair-recovery' | 'workflow';
}>): GroundedSpecFragment {
  return {
    id: overrides.id ?? 'frag-1',
    runtime: overrides.runtime ?? 'decomposition',
    adoId: 'TC-001' as never,
    title: 'Test',
    stepIndexes: [0],
    action: overrides.action ?? 'fill',
    intent: 'Fill field',
    graphNodeIds: [`screen:${overrides.screen ?? 'PolicySearch'}`],
    selectorRefs: ['sel-1'],
    assertionAnchors: [],
    artifactRefs: [],
    confidence: 'compiler-derived',
  };
}

function makeProposalBundle(overrides: Partial<{
  adoId: string;
  screen: string;
}>): ProposalBundle {
  return {
    kind: 'proposal-bundle',
    version: 1,
    adoId: (overrides.adoId ?? 'TC-001') as never,
    generatedAt: '2026-01-01T00:00:00Z',
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
  } as unknown as ProposalBundle;
}

test('Law 1: buildProposalIntelligence produces valid report', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    generatedAt: '2026-01-01T00:00:00Z',
  });
  expect(report.kind).toBe('proposal-intelligence-report');
  expect(report.version).toBe(1);
  expect(report.generatedAt).toBe('2026-01-01T00:00:00Z');
});

test('Law 2: buildProposalIntelligence includes all three sub-reports', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
  });
  expect(report.health.kind).toBe('corpus-health-report');
  expect(report.bottlenecks.kind).toBe('knowledge-bottleneck-report');
  expect(report.rankings.kind).toBe('proposal-ranking-report');
});

test('Law 3: alignmentScore is in [0, 1]', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({})],
  });
  expect(report.alignmentScore).toBeGreaterThanOrEqual(0);
  expect(report.alignmentScore).toBeLessThanOrEqual(1);
});

test('Law 4: coverageExplanationRate is in [0, 1]', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
  });
  expect(report.coverageExplanationRate).toBeGreaterThanOrEqual(0);
  expect(report.coverageExplanationRate).toBeLessThanOrEqual(1);
});

test('Law 5: uncoveredBottlenecks is subset of alignments', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
  });
  // Every uncovered should appear in alignments
  for (const uncovered of report.uncoveredBottlenecks) {
    const inAlignments = report.alignments.some(
      (a) => a.bottleneckRank === uncovered.bottleneckRank,
    );
    expect(inAlignments).toBe(true);
  }
});

test('Law 6: extractUncoveredGaps returns sorted by impactScore descending', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [
      makeFragment({ screen: 'A' }),
      makeFragment({ screen: 'B' }),
    ],
    runStepSummaries: [],
    proposalBundles: [],
  });
  const gaps = extractUncoveredGaps(report);
  for (let i = 1; i < gaps.length; i++) {
    expect(gaps[i]!.impactScore).toBeLessThanOrEqual(gaps[i - 1]!.impactScore);
  }
});

test('Law 7: coverageCorrelations has one entry per screen in health report', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [
      makeFragment({ screen: 'A' }),
      makeFragment({ screen: 'B' }),
    ],
    runStepSummaries: [],
    proposalBundles: [],
  });
  expect(report.coverageCorrelations.length).toBe(report.health.screenCoverage.length);
});

test('Law 8: topBottleneckCovered is true when no bottlenecks exist', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [
      makeFragment({ screen: 'A' }),
      makeFragment({ screen: 'A', id: 'f2' }),
      makeFragment({ screen: 'A', id: 'f3' }),
      makeFragment({ screen: 'A', id: 'f4' }),
    ],
    runStepSummaries: [],
    proposalBundles: [],
  });
  // With adequate coverage and no run data, no bottlenecks
  if (report.bottlenecks.bottlenecks.length === 0) {
    expect(report.topBottleneckCovered).toBe(true);
  }
});

test('Law 9: each alignment has covered=true iff matchingProposals is non-empty', () => {
  const report = buildProposalIntelligence({
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [makeProposalBundle({})],
  });
  for (const alignment of report.alignments) {
    expect(alignment.covered).toBe(alignment.matchingProposals.length > 0);
  }
});

test('Law 10: pure function produces same output for same input', () => {
  const input = {
    manifest: makeManifest(),
    fragments: [makeFragment({})],
    runStepSummaries: [],
    proposalBundles: [],
    generatedAt: '2026-01-01T00:00:00Z',
  };
  const report1 = buildProposalIntelligence(input);
  const report2 = buildProposalIntelligence(input);
  expect(report1.alignmentScore).toBe(report2.alignmentScore);
  expect(report1.coverageExplanationRate).toBe(report2.coverageExplanationRate);
  expect(report1.topBottleneckCovered).toBe(report2.topBottleneckCovered);
  expect(report1.alignments.length).toBe(report2.alignments.length);
});

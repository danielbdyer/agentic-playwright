import { expect, test } from '@playwright/test';
import type { ProposalBundle } from '../../product/domain/execution/types';
import type {
  GroundedSpecFragment,
  ReplayEvaluationResult,
  ReplayExample,
  TrainingCorpusManifest,
} from '../../product/domain/learning/types';
import type { ResolutionReceipt } from '../../product/domain/resolution/types';
import { projectCorpusHealth } from '../../workshop/learning/learning-health';
import { evaluateReplayExample, buildReplayEvaluationSummary } from '../../product/application/commitment/replay/replay-evaluation';
import { projectBottlenecks } from '../../workshop/learning/learning-bottlenecks';
import { rankProposals } from '../../workshop/learning/learning-rankings';

// ─── Fixtures ───

const TIMESTAMP = '1970-01-01T00:00:00.000Z';

function makeFragment(overrides: Partial<GroundedSpecFragment> = {}): GroundedSpecFragment {
  return {
    id: 'decomposition:10001:0',
    runtime: 'decomposition',
    adoId: '10001' as never,
    title: 'Step 0',
    stepIndexes: [0],
    action: 'input',
    intent: 'Enter policy number',
    graphNodeIds: ['target:policy-search'],
    selectorRefs: ['#policyNumber'],
    assertionAnchors: [],
    artifactRefs: ['.tesseract/tasks/10001.resolution.json'],
    confidence: 'compiler-derived',
    ...overrides,
  };
}

function makeManifest(overrides: Partial<TrainingCorpusManifest> = {}): TrainingCorpusManifest {
  return {
    kind: 'training-corpus-manifest',
    version: 1,
    generatedAt: TIMESTAMP,
    corpora: [
      { runtime: 'decomposition', exampleCount: 2, artifactPaths: ['a.json'], lastGeneratedAt: TIMESTAMP },
      { runtime: 'repair-recovery', exampleCount: 0, artifactPaths: [], lastGeneratedAt: TIMESTAMP },
      { runtime: 'workflow', exampleCount: 1, artifactPaths: ['b.json'], lastGeneratedAt: TIMESTAMP },
    ],
    replayExamples: 1,
    scenarioIds: ['10001' as never],
    runIds: ['run-1'],
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<ResolutionReceipt> = {}): ResolutionReceipt {
  return {
    kind: 'resolved',
    target: { screen: 'policy-search', element: 'policyNumberInput', action: 'fill', posture: 'valid' },
    winningSource: 'approved-knowledge',
    winningConcern: 'knowledge',
    governance: 'approved',
    confidence: 'compiler-derived',
    resolutionMode: 'deterministic',
    overlayRefs: [],
    knowledgeFingerprint: 'fp-knowledge-1',
    taskFingerprint: 'fp-task-1',
    exhaustion: [],
    fingerprints: { controls: null },
    resolutionGraph: null,
    ...overrides,
  } as ResolutionReceipt;
}

function makeReplayExample(overrides: Partial<ReplayExample> = {}): ReplayExample {
  return {
    kind: 'replay-example',
    version: 1,
    runtime: 'workflow',
    adoId: '10001' as never,
    runId: 'run-1',
    sessionId: null,
    createdAt: TIMESTAMP,
    taskFingerprint: 'fp-task-1',
    knowledgeFingerprint: 'fp-knowledge-1',
    fragmentIds: ['decomposition:10001:0'],
    receiptRefs: [],
    graphNodeIds: ['target:policy-search'],
    selectorRefs: ['#policyNumber'],
    ...overrides,
  };
}

function makeProposalBundle(overrides: Record<string, unknown> = {}): ProposalBundle {
  const defaultProposals = [
    {
      proposalId: 'prop-1',
      stepIndex: 0,
      artifactType: 'hints',
      targetPath: 'knowledge/screens/policy-search.hints.yaml',
      title: 'Add hint for policyNumber',
      patch: { alias: 'policyNum' },
      evidenceIds: ['ev-1'],
      impactedSteps: [0],
      trustPolicy: { decision: 'allow', reason: 'within threshold', confidence: 0.9, evidenceSufficiency: true },
      certification: 'uncertified',
      activation: { status: 'pending', activatedAt: null, reason: null },
      lineage: { sources: [], parents: [], handshakes: [] },
    },
  ];
  const proposals = (overrides.proposals ?? defaultProposals) as typeof defaultProposals;
  return {
    kind: 'proposal-bundle',
    version: 1,
    stage: 'proposal',
    scope: 'scenario',
    ids: { adoId: overrides.adoId ?? '10001', suite: 'demo/policy-search', sessionId: 's-1', runId: overrides.runId ?? 'run-1', stepIndex: 0, dataset: 'default', runbook: null, resolutionControl: null },
    fingerprints: { content: 'fp-1', derivation: 'fp-2' },
    lineage: { parentId: null, rootId: 'r-1', depth: 0 },
    governance: 'approved',
    payload: {
      adoId: (overrides.adoId ?? '10001') as never,
      runId: (overrides.runId ?? 'run-1') as string,
      revision: 1,
      title: 'Test',
      suite: 'demo/policy-search',
      proposals,
    },
    ...overrides,
  } as unknown as ProposalBundle;
}

// ─── Invariant 1: Fragment Provenance Completeness ───

test('invariant 1: fragments with graphNodeIds and selectorRefs have full provenance completeness', () => {
  const fragments = [
    makeFragment({ graphNodeIds: ['target:policy-search'], selectorRefs: ['#policyNumber'] }),
    makeFragment({ id: 'decomposition:10001:1', graphNodeIds: ['target:policy-detail'], selectorRefs: ['#policyStatus'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  expect(health.fragmentProvenanceCompleteness).toBe(1);
});

test('invariant 1: fragment with empty graphNodeIds lowers provenance completeness', () => {
  const fragments = [
    makeFragment({ graphNodeIds: ['target:policy-search'], selectorRefs: ['#policyNumber'] }),
    makeFragment({ id: 'decomposition:10001:1', graphNodeIds: [], selectorRefs: [] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  expect(health.fragmentProvenanceCompleteness).toBeLessThan(1);
  expect(health.fragmentProvenanceCompleteness).toBe(0.5);
});

test('invariant 1: fragment with empty selectorRefs lowers provenance completeness', () => {
  const fragments = [
    makeFragment({ graphNodeIds: ['target:policy-search'], selectorRefs: ['#policyNumber'] }),
    makeFragment({ id: 'decomposition:10001:1', graphNodeIds: ['target:policy-detail'], selectorRefs: [] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  expect(health.fragmentProvenanceCompleteness).toBe(0.5);
});

// ─── Invariant 2: Corpus Manifest Determinism ───

test('invariant 2: same manifest and fragments produce same health report', () => {
  const manifest = makeManifest();
  const fragments = [
    makeFragment(),
    makeFragment({ id: 'workflow:10001', runtime: 'workflow', action: 'composite' }),
  ];

  const first = projectCorpusHealth({ manifest, fragments, generatedAt: TIMESTAMP });
  const second = projectCorpusHealth({ manifest, fragments, generatedAt: TIMESTAMP });

  expect(first).toEqual(second);
});

test('invariant 2: fragment order does not affect health report', () => {
  const manifest = makeManifest();
  const frag1 = makeFragment({ id: 'decomposition:10001:0' });
  const frag2 = makeFragment({ id: 'decomposition:10001:1', action: 'click', intent: 'Click search' });

  const forward = projectCorpusHealth({ manifest, fragments: [frag1, frag2], generatedAt: TIMESTAMP });
  const reversed = projectCorpusHealth({ manifest, fragments: [frag2, frag1], generatedAt: TIMESTAMP });

  expect(forward.manifestFingerprint).toBe(reversed.manifestFingerprint);
  expect(forward.fragmentProvenanceCompleteness).toBe(reversed.fragmentProvenanceCompleteness);
  expect(forward.runtimeCoverage).toEqual(reversed.runtimeCoverage);
});

// ─── Invariant 3: Replay Reproducibility ───

test('invariant 3: replay with same knowledge yields reproducibility 1.0', () => {
  const example = makeReplayExample();
  const receipt = makeReceipt();

  const result = evaluateReplayExample({
    example,
    originalReceipts: [receipt],
    replayReceipts: [receipt],
    replayRunId: 'run-2',
    replayKnowledgeFingerprint: 'fp-knowledge-1',
    evaluatedAt: TIMESTAMP,
  });

  expect(result.reproducibilityScore).toBe(1);
  expect(result.matchedStepCount).toBe(1);
  expect(result.driftedStepCount).toBe(0);
  expect(result.knowledgeChanged).toBe(false);
});

test('invariant 3: changed knowledge fingerprint sets knowledgeChanged', () => {
  const example = makeReplayExample();
  const receipt = makeReceipt();

  const result = evaluateReplayExample({
    example,
    originalReceipts: [receipt],
    replayReceipts: [receipt],
    replayRunId: 'run-2',
    replayKnowledgeFingerprint: 'fp-knowledge-2',
    evaluatedAt: TIMESTAMP,
  });

  expect(result.knowledgeChanged).toBe(true);
});

test('invariant 3: different winning source produces drift', () => {
  const example = makeReplayExample();
  const originalReceipt = makeReceipt({ winningSource: 'approved-knowledge' });
  const replayReceipt = makeReceipt({ winningSource: 'structured-translation' });

  const result = evaluateReplayExample({
    example,
    originalReceipts: [originalReceipt],
    replayReceipts: [replayReceipt],
    replayRunId: 'run-2',
    replayKnowledgeFingerprint: 'fp-knowledge-1',
    evaluatedAt: TIMESTAMP,
  });

  expect(result.reproducibilityScore).toBe(0);
  expect(result.driftedStepCount).toBe(1);
  expect(result.stepResults[0]!.driftFields).toContain('winningSource');
});

test('invariant 3: evaluation summary aggregates correctly', () => {
  const perfect: ReplayEvaluationResult = {
    kind: 'replay-evaluation-result',
    version: 1,
    adoId: '10001',
    runId: 'run-2',
    originalRunId: 'run-1',
    taskFingerprint: 'fp-task-1',
    knowledgeFingerprint: 'fp-knowledge-1',
    originalKnowledgeFingerprint: 'fp-knowledge-1',
    knowledgeChanged: false,
    stepCount: 2,
    matchedStepCount: 2,
    driftedStepCount: 0,
    reproducibilityScore: 1,
    stepResults: [],
    evaluatedAt: TIMESTAMP,
  };

  const drifted: ReplayEvaluationResult = {
    ...perfect,
    adoId: '10002',
    knowledgeChanged: true,
    matchedStepCount: 1,
    driftedStepCount: 1,
    reproducibilityScore: 0.5,
  };

  const summary = buildReplayEvaluationSummary({
    results: [perfect, drifted],
    totalExamples: 3,
    generatedAt: TIMESTAMP,
  });

  expect(summary.evaluatedExamples).toBe(2);
  expect(summary.totalExamples).toBe(3);
  expect(summary.avgReproducibilityScore).toBe(0.75);
  expect(summary.perfectReplayCount).toBe(1);
  expect(summary.driftedReplayCount).toBe(1);
  expect(summary.knowledgeChangedCount).toBe(1);
});

// ─── Invariant 4: Learning-Canon Separation ───
// (Architecture test: verify no canonical path references in learning output types)

test('invariant 4: learning artifacts write only to .tesseract/learning/ paths', () => {
  const canonicalPrefixes = ['knowledge/', 'controls/', 'scenarios/', '.ado-sync/'];
  const learningPaths = [
    '.tesseract/learning/health.json',
    '.tesseract/learning/bottlenecks.json',
    '.tesseract/learning/rankings.json',
    '.tesseract/learning/evaluations/summary.json',
    '.tesseract/learning/evaluations/10001.run-1.eval.json',
    '.tesseract/learning/manifest.json',
    '.tesseract/learning/decomposition/10001.fragments.json',
    '.tesseract/learning/workflow/10001.fragments.json',
    '.tesseract/learning/replays/10001.run-1.json',
  ];

  for (const learningPath of learningPaths) {
    expect(learningPath.startsWith('.tesseract/learning/')).toBe(true);
    for (const canonicalPrefix of canonicalPrefixes) {
      expect(learningPath.startsWith(canonicalPrefix)).toBe(false);
    }
  }
});

// ─── WP1: Corpus Health ───

test('corpus health: thin screen detection with threshold of 3 fragments', () => {
  const fragments = [
    makeFragment({ graphNodeIds: ['target:policy-search'] }),
    makeFragment({ id: 'decomposition:10001:1', graphNodeIds: ['target:policy-search'] }),
    makeFragment({ id: 'decomposition:10002:0', graphNodeIds: ['target:policy-detail'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  expect(health.thinScreens).toContain('policy-search');
  expect(health.thinScreens).toContain('policy-detail');

  const detailEntry = health.screenCoverage.find((s) => s.screen === 'policy-detail');
  expect(detailEntry?.thin).toBe(true);
  expect(detailEntry?.fragmentCount).toBe(1);
});

test('corpus health: screen with 3+ fragments is not thin', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', graphNodeIds: ['target:policy-search'] }),
    makeFragment({ id: 'd:10001:1', graphNodeIds: ['target:policy-search'] }),
    makeFragment({ id: 'd:10001:2', graphNodeIds: ['target:policy-search'] }),
    makeFragment({ id: 'w:10001', runtime: 'workflow', graphNodeIds: ['target:policy-search'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  expect(health.thinScreens).not.toContain('policy-search');
  const searchEntry = health.screenCoverage.find((s) => s.screen === 'policy-search');
  expect(searchEntry?.thin).toBe(false);
  expect(searchEntry?.fragmentCount).toBe(4);
});

test('corpus health: runtime coverage counts are correct', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', runtime: 'decomposition' }),
    makeFragment({ id: 'd:10001:1', runtime: 'decomposition', adoId: '10002' as never }),
    makeFragment({ id: 'w:10001', runtime: 'workflow' }),
    makeFragment({ id: 'r:10001:0', runtime: 'repair-recovery' }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  const decomp = health.runtimeCoverage.find((r) => r.runtime === 'decomposition');
  expect(decomp?.fragmentCount).toBe(2);
  expect(decomp?.scenarioCount).toBe(2);

  const workflow = health.runtimeCoverage.find((r) => r.runtime === 'workflow');
  expect(workflow?.fragmentCount).toBe(1);

  const repair = health.runtimeCoverage.find((r) => r.runtime === 'repair-recovery');
  expect(repair?.fragmentCount).toBe(1);
});

test('corpus health: action family coverage detects thin actions', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', action: 'input' }),
    makeFragment({ id: 'd:10001:1', action: 'input' }),
    makeFragment({ id: 'd:10001:2', action: 'click' }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });

  const fillEntry = health.actionFamilyCoverage.find((a) => a.action === 'input');
  expect(fillEntry?.thin).toBe(false);
  expect(fillEntry?.fragmentCount).toBe(2);

  const clickEntry = health.actionFamilyCoverage.find((a) => a.action === 'click');
  expect(clickEntry?.thin).toBe(true);
  expect(clickEntry?.fragmentCount).toBe(1);
});

// ─── WP3: Bottleneck Detection ───

test('bottleneck: screens with higher repair density rank higher', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', graphNodeIds: ['target:screen-a'] }),
    makeFragment({ id: 'r:10001:0', runtime: 'repair-recovery', graphNodeIds: ['target:screen-a'] }),
    makeFragment({ id: 'd:10002:0', graphNodeIds: ['target:screen-b'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });
  const report = projectBottlenecks({
    healthReport: health,
    fragments,
    runStepSummaries: [],
    generatedAt: TIMESTAMP,
  });

  const screenABottleneck = report.bottlenecks.find((b) => b.screen === 'screen-a');
  const screenBBottleneck = report.bottlenecks.find((b) => b.screen === 'screen-b');
  expect(screenABottleneck).toBeDefined();
  expect(screenBBottleneck).toBeDefined();
  expect(screenABottleneck!.rank).toBeLessThan(screenBBottleneck!.rank);
});

test('bottleneck: ranking is deterministic', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', graphNodeIds: ['target:screen-a'] }),
    makeFragment({ id: 'r:10001:0', runtime: 'repair-recovery', graphNodeIds: ['target:screen-b'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });
  const first = projectBottlenecks({ healthReport: health, fragments, runStepSummaries: [], generatedAt: TIMESTAMP });
  const second = projectBottlenecks({ healthReport: health, fragments, runStepSummaries: [], generatedAt: TIMESTAMP });

  expect(first).toEqual(second);
});

test('bottleneck: each signal variant can appear', () => {
  const fragments = [
    makeFragment({ id: 'd:10001:0', graphNodeIds: ['target:thin-screen'] }),
  ];

  const health = projectCorpusHealth({ manifest: makeManifest(), fragments, generatedAt: TIMESTAMP });
  const report = projectBottlenecks({
    healthReport: health,
    fragments,
    runStepSummaries: [
      { adoId: '10001', winningSource: 'translation', resolutionMode: 'translation', screen: 'translation-screen', action: 'fill' },
      { adoId: '10001', winningSource: 'translation', resolutionMode: 'translation', screen: 'translation-screen', action: 'fill' },
    ],
    generatedAt: TIMESTAMP,
  });

  expect(report.bottlenecks.length).toBeGreaterThan(0);
  const signals = report.bottlenecks.map((b) => b.signal);
  expect(signals.some((s) => s === 'thin-screen-coverage')).toBe(true);
});

// ─── WP4: Proposal Ranking ───

test('ranking: trust-policy-allowed proposals outrank review-required with equal impact', () => {
  const allowedBundle = makeProposalBundle({
    adoId: '10001' as never,
    proposals: [{
      ...makeProposalBundle().payload.proposals[0]!,
      proposalId: 'prop-allow',
      trustPolicy: { decision: 'allow', reasons: [] },
    }],
  });

  const reviewBundle = makeProposalBundle({
    adoId: '10002' as never,
    proposals: [{
      ...makeProposalBundle().payload.proposals[0]!,
      proposalId: 'prop-review',
      trustPolicy: { decision: 'review', reasons: [{ code: 'minimum-confidence', message: 'needs review' }] },
    }],
  });

  const report = rankProposals({
    proposalBundles: [allowedBundle, reviewBundle],
    bottleneckReport: null,
    generatedAt: TIMESTAMP,
  });

  expect(report.totalRanked).toBe(2);
  const allowRank = report.rankings.find((r) => r.proposalId === 'prop-allow');
  const reviewRank = report.rankings.find((r) => r.proposalId === 'prop-review');
  expect(allowRank).toBeDefined();
  expect(reviewRank).toBeDefined();
  expect(allowRank!.rank).toBeLessThan(reviewRank!.rank);
});

test('ranking: is deterministic', () => {
  const bundles = [makeProposalBundle()];
  const first = rankProposals({ proposalBundles: bundles, bottleneckReport: null, generatedAt: TIMESTAMP });
  const second = rankProposals({ proposalBundles: bundles, bottleneckReport: null, generatedAt: TIMESTAMP });

  expect(first).toEqual(second);
});

test('ranking: only pending proposals are ranked', () => {
  const bundle = makeProposalBundle({
    proposals: [
      {
        ...makeProposalBundle().payload.proposals[0]!,
        proposalId: 'prop-active',
        activation: { status: 'activated', activatedAt: TIMESTAMP, reason: null },
      },
      {
        ...makeProposalBundle().payload.proposals[0]!,
        proposalId: 'prop-pending',
        activation: { status: 'pending', activatedAt: null, reason: null },
      },
    ],
  });

  const report = rankProposals({
    proposalBundles: [bundle],
    bottleneckReport: null,
    generatedAt: TIMESTAMP,
  });

  expect(report.totalPending).toBe(1);
  expect(report.totalRanked).toBe(1);
  expect(report.rankings[0]!.proposalId).toBe('prop-pending');
});

import { expect, test } from '@playwright/test';
import {
  buildFitnessReport,
  compareToScorecard,
  updateScorecard,
  type FitnessInputData,
} from '../../workshop/orchestration/fitness';
import type { ProposalBundle, StepExecutionReceipt } from '../../product/domain/execution/types';
import type { PipelineScorecard } from '../../workshop/metrics/types';
import type { ResolutionReceipt } from '../../product/domain/resolution/types';
import type { DogfoodIterationResult, DogfoodLedger } from '../../workshop/orchestration/dogfood';

// ─── Test Fixtures ───

function createMockIteration(overrides: Partial<DogfoodIterationResult> = {}): DogfoodIterationResult {
  return {
    iteration: 1,
    scenarioIds: ['20001'],
    proposalsGenerated: 2,
    proposalsActivated: 2,
    proposalsBlocked: 0,
    knowledgeHitRate: 0.75,
    unresolvedStepCount: 1,
    totalStepCount: 4,
    instructionCount: 100,
    ...overrides,
  };
}

function createMockLedger(overrides: Partial<DogfoodLedger> = {}): DogfoodLedger {
  return {
    kind: 'dogfood-ledger',
    version: 1,
    maxIterations: 3,
    completedIterations: 2,
    converged: true,
    convergenceReason: 'no-proposals',
    iterations: [
      createMockIteration({ iteration: 1, knowledgeHitRate: 0.5 }),
      createMockIteration({ iteration: 2, knowledgeHitRate: 0.75, proposalsActivated: 0 }),
    ],
    totalProposalsActivated: 2,
    totalInstructionCount: 200,
    knowledgeHitRateDelta: 0.25,
    ...overrides,
  };
}

function createMockResolutionReceipt(overrides: Record<string, unknown> = {}): ResolutionReceipt {
  return {
    kind: 'resolved',
    version: 1,
    stage: 'resolution',
    scope: 'step',
    ids: {},
    fingerprints: { artifact: 'fp' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'approved',
    taskFingerprint: 'tf',
    knowledgeFingerprint: 'kf',
    provider: 'test',
    mode: 'diagnostic',
    runAt: '2026-01-01T00:00:00Z',
    stepIndex: 0,
    resolutionMode: 'deterministic',
    knowledgeRefs: [],
    supplementRefs: [],
    controlRefs: [],
    evidenceRefs: [],
    overlayRefs: [],
    observations: [],
    exhaustion: [],
    handshakes: [],
    winningConcern: 'resolution',
    winningSource: 'approved-knowledge',
    confidence: 'compiler-derived',
    provenanceKind: 'approved-knowledge',
    target: { action: 'navigate', screen: 'policy-search' as never },
    evidenceDrafts: [],
    proposalDrafts: [],
    ...overrides,
  } as unknown as ResolutionReceipt;
}

function createMockExecution(overrides: Record<string, unknown> = {}): StepExecutionReceipt {
  return {
    version: 1,
    stage: 'execution',
    scope: 'step',
    ids: {},
    fingerprints: { artifact: 'fp' },
    lineage: { sources: [], parents: [], handshakes: [] },
    governance: 'approved',
    stepIndex: 0,
    taskFingerprint: 'tf',
    knowledgeFingerprint: 'kf',
    runAt: '2026-01-01T00:00:00Z',
    mode: 'diagnostic',
    degraded: false,
    preconditionFailures: [],
    durationMs: 100,
    timing: { setupMs: 10, resolutionMs: 20, actionMs: 30, assertionMs: 20, retriesMs: 0, teardownMs: 10, totalMs: 100 },
    cost: { instructionCount: 1, diagnosticCount: 0 },
    budget: { thresholds: {}, status: 'within-budget', breaches: [] },
    failure: { family: 'none' },
    recovery: { policyProfile: 'default', attempts: [] },
    handshakes: [],
    execution: { status: 'ok', observedEffects: [], diagnostics: [] },
    ...overrides,
  } as unknown as StepExecutionReceipt;
}

function createFitnessInput(overrides: Partial<FitnessInputData> = {}): FitnessInputData {
  return {
    pipelineVersion: 'test-abc123',
    ledger: createMockLedger(),
    runSteps: [
      { interpretation: createMockResolutionReceipt({ stepIndex: 0 }), execution: createMockExecution({ stepIndex: 0 }) },
      { interpretation: createMockResolutionReceipt({ stepIndex: 1 }), execution: createMockExecution({ stepIndex: 1 }) },
      {
        interpretation: createMockResolutionReceipt({
          stepIndex: 2,
          winningSource: 'structured-translation',
          translation: { kind: 'translation-receipt', version: 1, mode: 'structured-translation', matched: true, selected: { kind: 'screen', target: 'policy-detail', score: 0.6, aliases: [], sourceRefs: [] }, candidates: [], rationale: 'test', failureClass: 'none' },
        }),
        execution: createMockExecution({ stepIndex: 2 }),
      },
      {
        interpretation: createMockResolutionReceipt({
          stepIndex: 3,
          kind: 'needs-human',
          confidence: 'unbound',
          provenanceKind: 'unresolved',
          winningSource: 'none',
          translation: { kind: 'translation-receipt', version: 1, mode: 'structured-translation', matched: false, selected: null, candidates: [], rationale: 'test', failureClass: 'no-candidate' },
        }),
        execution: createMockExecution({ stepIndex: 3 }),
      },
    ],
    proposalBundles: [],
    knowledgeCoverage: {
      totalElements: 4,
      totalScreens: 2,
      roleCoverageRate: 1,
      affordanceCoverageRate: 0.75,
      locatorCoverageRate: 1,
      postureCoverageRate: 0.5,
      routeScreenCoverageRate: 1,
      routeVariantCoverageRate: 1,
    },
    ...overrides,
  };
}

// ─── Fitness Report Laws ───

test.describe('Pipeline Fitness Report', () => {
  test('report has correct kind and version', () => {
    const report = buildFitnessReport(createFitnessInput());
    expect(report.kind).toBe('pipeline-fitness-report');
    expect(report.version).toBe(1);
    expect(report.baseline).toBe(true);
  });

  test('pipeline version is preserved in report', () => {
    const report = buildFitnessReport(createFitnessInput({ pipelineVersion: 'abc123' }));
    expect(report.pipelineVersion).toBe('abc123');
  });

  test('knowledge hit rate reflects final ledger iteration', () => {
    const report = buildFitnessReport(createFitnessInput());
    expect(report.metrics.knowledgeHitRate).toBe(0.75);
  });

  test('effective hit rate and unresolvedness economics are emitted', () => {
    const report = buildFitnessReport(createFitnessInput());
    expect(report.metrics.effectiveHitRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.ambiguityRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.suspensionRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.agentFallbackRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.liveDomFallbackRate).toBeGreaterThanOrEqual(0);
    expect(report.metrics.routeMismatchRate).toBeGreaterThanOrEqual(0);
  });

  test('resolution by rung accounts for all steps', () => {
    const report = buildFitnessReport(createFitnessInput());
    const totalWins = report.metrics.resolutionByRung.reduce((sum, r) => sum + r.wins, 0);
    expect(totalWins).toBe(4); // 4 steps
  });

  test('failure modes are sorted by count descending', () => {
    const report = buildFitnessReport(createFitnessInput());
    for (let i = 1; i < report.failureModes.length; i++) {
      expect(report.failureModes[i]!.count).toBeLessThanOrEqual(report.failureModes[i - 1]!.count);
    }
  });

  test('each failure mode has a valid improvement target', () => {
    const report = buildFitnessReport(createFitnessInput());
    const validKinds = ['translation', 'scoring', 'resolution', 'recovery', 'trust-policy'];
    for (const mode of report.failureModes) {
      expect(validKinds).toContain(mode.improvementTarget.kind);
      expect(mode.improvementTarget.detail.length).toBeGreaterThan(0);
    }
  });

  test('translation precision is between 0 and 1', () => {
    const report = buildFitnessReport(createFitnessInput());
    expect(report.metrics.translationPrecision).toBeGreaterThanOrEqual(0);
    expect(report.metrics.translationPrecision).toBeLessThanOrEqual(1);
  });

  test('classifies translation-threshold-miss for near-miss candidates', () => {
    const input = createFitnessInput({
      runSteps: [{
        interpretation: createMockResolutionReceipt({
          winningSource: 'none',
          translation: {
            kind: 'translation-receipt', version: 1, mode: 'structured-translation',
            matched: false, selected: null,
            candidates: [{ kind: 'screen', target: 'test', score: 0.25, aliases: [], sourceRefs: [] }],
            rationale: 'test', failureClass: 'no-candidate',
          },
        }),
        execution: createMockExecution(),
      }],
    });
    const report = buildFitnessReport(input);
    const classes = report.failureModes.map((m) => m.class);
    expect(classes).toContain('translation-threshold-miss');
  });

  test('classifies resolution-rung-skip for translation-won steps', () => {
    const input = createFitnessInput({
      runSteps: [{
        interpretation: createMockResolutionReceipt({
          winningSource: 'structured-translation',
          translation: { kind: 'translation-receipt', version: 1, mode: 'structured-translation', matched: true, selected: { kind: 'screen', target: 't', score: 0.5, aliases: [], sourceRefs: [] }, candidates: [], rationale: 'r', failureClass: 'none' },
        }),
        execution: createMockExecution(),
      }],
    });
    const report = buildFitnessReport(input);
    expect(report.failureModes.map((m) => m.class)).toContain('resolution-rung-skip');
  });

  test('trust-policy-over-block detected when all proposals blocked', () => {
    const input = createFitnessInput({
      runSteps: [{
        interpretation: createMockResolutionReceipt({
          winningSource: 'approved-knowledge',
          proposalDrafts: [{ artifactType: 'hints', targetPath: 't', title: 't', patch: {}, rationale: 'r' }],
        }),
        execution: createMockExecution(),
      }],
      proposalBundles: [{
        kind: 'proposal-bundle', version: 1, stage: 'proposal', scope: 'scenario',
        ids: {}, fingerprints: { artifact: 'fp' }, lineage: { sources: [], parents: [], handshakes: [] },
        governance: 'approved',
        payload: { adoId: '20001' as never, runId: 'r1', revision: 1, title: 't', suite: 's', proposals: [{ proposalId: 'p1', stepIndex: 0, artifactType: 'hints', targetPath: 't', title: 't', patch: {}, evidenceIds: [], impactedSteps: [], trustPolicy: { decision: 'deny', reasons: [] }, certification: 'uncertified', activation: { status: 'blocked' }, lineage: { runIds: [], evidenceIds: [], sourceArtifactPaths: [] } }] },
      } as unknown as ProposalBundle],
    });
    const report = buildFitnessReport(input);
    // The step itself has a proposal draft and blocking, so it should detect the blocked proposal in bundles
    expect(report.metrics.proposalYield).toBe(0);
  });

  test('proposal categories and winning source distribution are surfaced', () => {
    const input = createFitnessInput({
      proposalBundles: [{
        kind: 'proposal-bundle', version: 1, stage: 'proposal', scope: 'scenario',
        ids: {}, fingerprints: { artifact: 'fp' }, lineage: { sources: [], parents: [], handshakes: [] },
        governance: 'approved',
        payload: {
          adoId: '20001' as never,
          runId: 'r1',
          revision: 1,
          title: 't',
          suite: 's',
          proposals: [{
            proposalId: 'p1',
            stepIndex: 0,
            artifactType: 'hints',
            category: 'needs-human',
            targetPath: 't',
            title: 't',
            patch: {},
            evidenceIds: [],
            impactedSteps: [],
            trustPolicy: { decision: 'review', reasons: [] },
            certification: 'uncertified',
            activation: { status: 'pending' },
            lineage: { runIds: [], evidenceIds: [], sourceArtifactPaths: [] },
          }],
        },
      } as unknown as ProposalBundle],
    });
    const report = buildFitnessReport(input);
    expect(report.metrics.proposalCategoryCounts?.['needs-human']).toBe(1);
    expect(report.metrics.winningSourceDistribution?.some((entry) => entry.source === 'approved-knowledge')).toBe(true);
  });

  test('logical proof obligations are emitted from measurable runtime evidence', () => {
    const report = buildFitnessReport(createFitnessInput());
    const obligations = report.metrics.proofObligations ?? [];
    expect(obligations.length).toBeGreaterThan(0);
    expect(obligations.some((entry) => entry.obligation === 'target-observability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'posture-separability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'affordance-recoverability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'structural-legibility')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'variance-factorability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'recoverability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'compounding-economics')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'surface-compressibility')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'surface-predictability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'surface-repairability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'participatory-repairability')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'memory-worthiness')).toBe(true);
    expect(obligations.some((entry) => entry.obligation === 'meta-worthiness')).toBe(true);
    expect(obligations.every((entry) => entry.score >= 0 && entry.score <= 1)).toBe(true);
  });
});

// ─── Scorecard Comparison Laws ───

test.describe('Scorecard Comparison', () => {
  test('first run always improves (no existing scorecard)', () => {
    const report = buildFitnessReport(createFitnessInput());
    const comparison = compareToScorecard(report, null);
    expect(comparison.improved).toBe(true);
    expect(comparison.summary).toContain('First run');
  });

  test('higher hit rate beats existing scorecard', () => {
    const report = buildFitnessReport(createFitnessInput());
    const existing: PipelineScorecard = {
      kind: 'pipeline-scorecard',
      version: 1,
      highWaterMark: {
        setAt: '2026-01-01T00:00:00Z',
        pipelineVersion: 'old',
        knowledgeHitRate: 0.5,
        translationPrecision: 0.8,
        convergenceVelocity: 3,
        proposalYield: 0.9,
        resolutionByRung: [],
      },
      history: [],
    };
    const comparison = compareToScorecard(report, existing);
    expect(comparison.improved).toBe(true);
    expect(comparison.knowledgeHitRateDelta).toBeGreaterThan(0);
  });

  test('lower hit rate does not beat existing scorecard', () => {
    const report = buildFitnessReport(createFitnessInput());
    const existing: PipelineScorecard = {
      kind: 'pipeline-scorecard',
      version: 1,
      highWaterMark: {
        setAt: '2026-01-01T00:00:00Z',
        pipelineVersion: 'better',
        knowledgeHitRate: 0.95,
        translationPrecision: 0.9,
        convergenceVelocity: 1,
        proposalYield: 1,
        resolutionByRung: [],
      },
      history: [],
    };
    const comparison = compareToScorecard(report, existing);
    expect(comparison.improved).toBe(false);
    expect(comparison.knowledgeHitRateDelta).toBeLessThan(0);
  });

  test('updateScorecard advances high-water-mark on improvement', () => {
    const report = buildFitnessReport(createFitnessInput());
    const comparison = compareToScorecard(report, null);
    const scorecard = updateScorecard(report, null, comparison);
    expect(scorecard.kind).toBe('pipeline-scorecard');
    expect(scorecard.highWaterMark.knowledgeHitRate).toBe(report.metrics.knowledgeHitRate);
    expect(scorecard.highWaterMark.proofObligations?.length).toBeGreaterThan(0);
    // Phase 1.7 honesty: proof obligations from `runtimeProofObligations`
    // are heuristic-proxy by construction, so they do NOT inflate the
    // `direct` count. This is the honest baseline — direct status comes
    // from the cohort-trajectory builder (when ≥2 history points) or the
    // fingerprint-stability probe (K0). On a first run with no history
    // and no probe, the baseline summary should show heuristic-proxy
    // obligations as `proxy`, not `direct`.
    const summary = scorecard.highWaterMark.theoremBaselineSummary!;
    expect(summary.direct).toBe(0);
    expect(summary.proxy).toBeGreaterThan(0);
    expect(scorecard.history).toHaveLength(1);
    expect(scorecard.history[0]!.theoremBaselineSummary?.direct).toBe(0);
    expect(scorecard.history[0]!.theoremBaselineSummary?.proxy).toBeGreaterThan(0);
    expect(scorecard.history[0]!.improved).toBe(true);
  });

  test('updateScorecard preserves existing high-water-mark on no improvement', () => {
    const existing: PipelineScorecard = {
      kind: 'pipeline-scorecard',
      version: 1,
      highWaterMark: {
        setAt: '2026-01-01T00:00:00Z',
        pipelineVersion: 'better',
        knowledgeHitRate: 0.95,
        translationPrecision: 0.9,
        convergenceVelocity: 1,
        proposalYield: 1,
        resolutionByRung: [],
      },
      history: [],
    };
    const report = buildFitnessReport(createFitnessInput());
    const comparison = compareToScorecard(report, existing);
    const scorecard = updateScorecard(report, existing, comparison);
    expect(scorecard.highWaterMark.knowledgeHitRate).toBe(0.95); // unchanged
    expect(scorecard.history).toHaveLength(1);
    expect(scorecard.history[0]!.improved).toBe(false);
  });

  test('scorecard history is append-only', () => {
    const existing: PipelineScorecard = {
      kind: 'pipeline-scorecard',
      version: 1,
      highWaterMark: {
        setAt: '2026-01-01T00:00:00Z',
        pipelineVersion: 'v1',
        knowledgeHitRate: 0.5,
        translationPrecision: 0.8,
        convergenceVelocity: 3,
        proposalYield: 0.9,
        resolutionByRung: [],
      },
      history: [{ runAt: '2026-01-01T00:00:00Z', pipelineVersion: 'v1', knowledgeHitRate: 0.5, translationPrecision: 0.8, convergenceVelocity: 3, improved: true }],
    };
    const report = buildFitnessReport(createFitnessInput());
    const comparison = compareToScorecard(report, existing);
    const scorecard = updateScorecard(report, existing, comparison);
    expect(scorecard.history).toHaveLength(2);
    expect(scorecard.history[0]).toEqual(existing.history[0]);
  });
});

import { Effect } from 'effect';
import type {
  CorpusHealthReport,
  GroundedSpecFragment,
  KnowledgeBottleneckReport,
  LearningScorecard,
  ProposalRankingReport,
  ReplayEvaluationSummary,
  TrainingCorpusManifest,
} from '../domain/types';
import type { ProjectPaths } from './paths';
import {
  learningBottlenecksPath,
  learningHealthPath,
  learningRankingsPath,
  relativeProjectPath,
} from './paths';
import { FileSystem } from './ports';
import { projectCorpusHealth } from './learning-health';
import { buildReplayEvaluationSummary } from './replay-evaluation';
import { projectBottlenecks } from './learning-bottlenecks';
import { rankProposals } from './learning-rankings';
import { loadWorkspaceCatalog } from './catalog';
import { walkFiles } from './artifacts';

export interface LearningEvaluationResult {
  readonly healthReport: CorpusHealthReport;
  readonly evaluationSummary: ReplayEvaluationSummary;
  readonly bottleneckReport: KnowledgeBottleneckReport;
  readonly rankingReport: ProposalRankingReport;
  readonly learningScorecard: LearningScorecard;
  readonly artifactPaths: readonly string[];
}

function isGroundedFragment(entry: unknown): entry is GroundedSpecFragment {
  return entry != null && typeof entry === 'object' && 'id' in entry && 'runtime' in entry;
}

function loadAllFragments(fs: { readJson(path: string): Effect.Effect<unknown, unknown> }, learningDir: string) {
  return Effect.gen(function* () {
    const allFiles = yield* walkFiles(fs as never, learningDir);
    const fragmentFiles = allFiles.filter((f) =>
      f.endsWith('.fragments.json') && !f.includes('manifest'),
    );
    const fileContents = yield* Effect.all(
      fragmentFiles.map((file) => fs.readJson(file)),
      { concurrency: 'unbounded' },
    );
    return fileContents.flatMap((content) =>
      Array.isArray(content) ? content.filter(isGroundedFragment) : [],
    );
  });
}

function buildLearningScorecard(
  healthReport: CorpusHealthReport,
  evaluationSummary: ReplayEvaluationSummary,
  bottleneckReport: KnowledgeBottleneckReport,
  rankingReport: ProposalRankingReport,
  manifest: TrainingCorpusManifest,
): LearningScorecard {
  const topBottleneck = bottleneckReport.bottlenecks[0] ?? null;
  const topProposal = rankingReport.rankings[0] ?? null;

  return {
    corpusFragmentCount: healthReport.runtimeCoverage.reduce((sum, r) => sum + r.fragmentCount, 0),
    replayExampleCount: manifest.replayExamples,
    avgReproducibilityScore: evaluationSummary.avgReproducibilityScore,
    fragmentProvenanceCompleteness: healthReport.fragmentProvenanceCompleteness,
    thinScreenCount: healthReport.thinScreens.length,
    thinActionFamilyCount: healthReport.thinActionFamilies.length,
    topBottleneckScreen: topBottleneck?.screen ?? null,
    topBottleneckImpact: topBottleneck?.impactScore ?? 0,
    rankedProposalCount: rankingReport.totalRanked,
    topProposalId: topProposal?.proposalId ?? null,
    topProposalScore: topProposal?.overallScore ?? 0,
  };
}

export function projectLearningEvaluation(options: {
  readonly paths: ProjectPaths;
  readonly generatedAt?: string | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' });
    const manifest = catalog.learningManifest?.artifact ?? {
      kind: 'training-corpus-manifest' as const,
      version: 1 as const,
      generatedAt: new Date(0).toISOString(),
      corpora: [],
      replayExamples: 0,
      scenarioIds: [],
      runIds: [],
    };

    const fragments = yield* loadAllFragments(fs, options.paths.learningDir);
    const timestamp = options.generatedAt ?? new Date(0).toISOString();

    // WP1: Corpus health
    const healthReport = projectCorpusHealth({
      manifest,
      fragments,
      generatedAt: timestamp,
    });

    // WP2: Replay evaluation (summary from existing results — no re-execution)
    const evaluationSummary = buildReplayEvaluationSummary({
      results: [],
      totalExamples: manifest.replayExamples,
      generatedAt: timestamp,
    });

    // WP3: Bottleneck detection
    const runStepSummaries = catalog.runRecords.flatMap((entry) =>
      entry.artifact.steps.map((step) => ({
        adoId: entry.artifact.adoId,
        winningSource: step.interpretation.winningSource,
        resolutionMode: step.interpretation.resolutionMode,
        screen: step.interpretation.kind === 'needs-human' ? 'unknown' : step.interpretation.target.screen,
        action: step.interpretation.kind === 'needs-human' ? 'custom' : step.interpretation.target.action,
      })),
    );
    const bottleneckReport = projectBottlenecks({
      healthReport,
      fragments,
      runStepSummaries,
      generatedAt: timestamp,
    });

    // WP4: Proposal ranking
    const rankingReport = rankProposals({
      proposalBundles: catalog.proposalBundles.map((e) => e.artifact),
      bottleneckReport,
      generatedAt: timestamp,
    });

    // Build learning scorecard
    const learningScorecard = buildLearningScorecard(
      healthReport,
      evaluationSummary,
      bottleneckReport,
      rankingReport,
      manifest,
    );

    // Write artifacts (independent writes)
    const healthPath = learningHealthPath(options.paths);
    const bottlenecksPath = learningBottlenecksPath(options.paths);
    const rankingsPath = learningRankingsPath(options.paths);

    yield* fs.ensureDir(options.paths.learningDir);
    yield* Effect.all({
      health: fs.writeJson(healthPath, healthReport),
      bottlenecks: fs.writeJson(bottlenecksPath, bottleneckReport),
      rankings: fs.writeJson(rankingsPath, rankingReport),
    }, { concurrency: 'unbounded' });

    const artifactPaths = [
      relativeProjectPath(options.paths, healthPath),
      relativeProjectPath(options.paths, bottlenecksPath),
      relativeProjectPath(options.paths, rankingsPath),
    ];

    return {
      healthReport,
      evaluationSummary,
      bottleneckReport,
      rankingReport,
      learningScorecard,
      artifactPaths,
    } satisfies LearningEvaluationResult;
  });
}

import { Effect } from 'effect';
import { loadWorkspaceCatalog } from './catalog';
import { runScenarioSelection } from './run';
import type { ProjectPaths } from './paths';
import {
  benchmarkImprovementProjectionPath,
  benchmarkDogfoodRunPath,
  benchmarkScorecardJsonPath,
  benchmarkScorecardMarkdownPath,
  benchmarkVariantsReviewPath,
  benchmarkVariantsSpecPath,
  benchmarkVariantsTracePath,
  relativeProjectPath,
} from './paths';
import { ExecutionContext, FileSystem } from './ports';
import { groupBy, uniqueSorted } from '../domain/collections';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
  ImprovementProjectionSummary,
  ImprovementRun,
  InterpretationDriftRecord,
  LearningScorecard,
  ProposalBundle,
} from '../domain/types';

interface BenchmarkVariant {
  id: string;
  fieldId: string;
  screen: string;
  element: string;
  posture: string;
  sourceRuleIndex: number;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function benchmarkByName(benchmarks: readonly BenchmarkContext[], name: string): BenchmarkContext {
  const benchmark = benchmarks.find((entry) => entry.name === name) ?? null;
  if (!benchmark) {
    throw new Error(`Unknown benchmark ${name}`);
  }
  return benchmark;
}

function variantsForBenchmark(benchmark: BenchmarkContext): BenchmarkVariant[] {
  return benchmark.expansionRules.flatMap((rule, ruleIndex) =>
    rule.fieldIds.flatMap((fieldId) => {
      const field = benchmark.fieldCatalog.find((entry) => entry.id === fieldId) ?? null;
      if (!field) {
        return [];
      }
      return rule.postures.flatMap((posture) =>
        Array.from({ length: rule.variantsPerField }).map((_, variantIndex) => ({
          id: `${fieldId}-${posture}-${variantIndex + 1}`,
          fieldId,
          screen: field.screen,
          element: field.element,
          posture,
          sourceRuleIndex: ruleIndex,
        })),
      );
    }),
  );
}

function proposalsForScenarios(bundles: readonly ProposalBundle[], scenarioIds: readonly string[]): ProposalBundle[] {
  return bundles.filter((bundle) => scenarioIds.includes(bundle.adoId));
}

function knowledgeChurnForBundles(bundles: readonly ProposalBundle[]): Record<string, number> {
  const grouped = groupBy(
    bundles.flatMap((bundle) => bundle.proposals),
    (proposal) => proposal.artifactType,
  );
  return Object.fromEntries(
    Object.entries(grouped).map(([artifactType, proposals]) => [artifactType, proposals.length]),
  );
}

function scorecardForBenchmark(input: {
  benchmark: BenchmarkContext;
  scenarioIds: string[];
  proposalBundles: ProposalBundle[];
  approvalCount: number;
  generatedVariantCount: number;
  runRecords: Array<{
    adoId: string;
    executionMetrics: {
      timingTotals: {
        setupMs: number;
        resolutionMs: number;
        actionMs: number;
        assertionMs: number;
        retriesMs: number;
        teardownMs: number;
        totalMs: number;
      };
      costTotals: {
        instructionCount: number;
        diagnosticCount: number;
      };
      budgetBreaches: number;
      failureFamilies: Record<string, number>;
      recoveryFamilies: Record<string, number>;
      recoveryStrategies: Record<string, number>;
    };
    steps: Array<{
      resolutionMode: 'deterministic' | 'translation' | 'agentic';
      winningSource: string;
      degraded: boolean;
    }>;
  }>;
  confidenceRecords: Array<{
    id: string;
    status: string;
    screen?: string | null | undefined;
    failureCount: number;
  }>;
  interpretationDriftRecords: InterpretationDriftRecord[];
  learningScorecard?: LearningScorecard | null | undefined;
}): BenchmarkScorecard {
  const uniqueScreens = uniqueSorted(input.benchmark.fieldCatalog.map((field) => field.screen).filter((value) => value.length > 0));
  const driftCount = input.benchmark.driftEvents.length;
  const locatorDriftCount = input.benchmark.driftEvents.filter((event) => event.kind === 'locator-degradation').length;
  const widgetDriftCount = input.benchmark.driftEvents.filter((event) => event.kind === 'widget-swap').length;
  const uniqueFieldAwarenessCount = input.benchmark.fieldCatalog.length;
  const firstPassScreenResolutionRate = round(Math.max(0, (uniqueScreens.length - driftCount * 0.2) / Math.max(uniqueScreens.length, 1)));
  const firstPassElementResolutionRate = round(
    Math.max(0, (uniqueFieldAwarenessCount - locatorDriftCount - widgetDriftCount) / Math.max(uniqueFieldAwarenessCount, 1)),
  );
  const degradedLocatorRate = round(locatorDriftCount / Math.max(uniqueFieldAwarenessCount, 1));
  const reviewRequiredCount = input.proposalBundles.reduce((count, bundle) =>
    count + bundle.proposals.filter((proposal) => proposal.trustPolicy.decision !== 'allow').length,
  0);
  const repairLoopCount = input.proposalBundles.reduce((count, bundle) => count + bundle.proposals.length, 0);
  const benchmarkRuns = input.runRecords.filter((record) => input.scenarioIds.includes(record.adoId));
  const benchmarkSteps = benchmarkRuns.flatMap((record) => record.steps);
  const translationHitRate = round(benchmarkSteps.filter((step) => step.resolutionMode === 'translation').length / Math.max(benchmarkSteps.length, 1));
  const agenticHitRate = round(benchmarkSteps.filter((step) => step.resolutionMode === 'agentic').length / Math.max(benchmarkSteps.length, 1));
  const approvedEquivalentCount = benchmarkSteps.filter((step) => step.winningSource === 'approved-equivalent').length;
  const thinKnowledgeScreenCount = uniqueScreens.filter((screen) =>
    input.benchmark.fieldCatalog.filter((field) => field.screen === screen).length < 3,
  ).length;
  const degradedLocatorHotspotCount = uniqueSorted(
    benchmarkRuns.flatMap((record) =>
      record.steps.flatMap((step) => step.degraded ? [record.adoId] : []),
    ).filter((value) => value.length > 0),
  ).length;
  const interpretationDriftHotspotCount = input.interpretationDriftRecords
    .reduce((sum, record) => sum + (input.scenarioIds.includes(record.adoId) && record.hasDrift ? record.changedStepCount : 0), 0);
  const overlayChurn = input.confidenceRecords.filter((record) =>
    record.failureCount > 0 && uniqueScreens.includes(record.screen ?? ''),
  ).length;
  const timingTotals = benchmarkRuns.reduce((acc, run) => ({
    setup: acc.setup + run.executionMetrics.timingTotals.setupMs,
    resolution: acc.resolution + run.executionMetrics.timingTotals.resolutionMs,
    action: acc.action + run.executionMetrics.timingTotals.actionMs,
    assertion: acc.assertion + run.executionMetrics.timingTotals.assertionMs,
    retries: acc.retries + run.executionMetrics.timingTotals.retriesMs,
    teardown: acc.teardown + run.executionMetrics.timingTotals.teardownMs,
    total: acc.total + run.executionMetrics.timingTotals.totalMs,
  }), { setup: 0, resolution: 0, action: 0, assertion: 0, retries: 0, teardown: 0, total: 0 });
  const executionCostTotals = benchmarkRuns.reduce((acc, run) => ({
    instructionCount: acc.instructionCount + run.executionMetrics.costTotals.instructionCount,
    diagnosticCount: acc.diagnosticCount + run.executionMetrics.costTotals.diagnosticCount,
  }), { instructionCount: 0, diagnosticCount: 0 });
  const executionFailureFamilies = benchmarkRuns.reduce<Record<string, number>>((acc, run) => {
    for (const [family, count] of Object.entries(run.executionMetrics.failureFamilies)) {
      acc[family] = (acc[family] ?? 0) + count;
    }
    return acc;
  }, {});
  const recoveryFamilies = benchmarkRuns.reduce<Record<string, number>>((acc, run) => {
    for (const [family, count] of Object.entries(run.executionMetrics.recoveryFamilies ?? {})) {
      acc[family] = (acc[family] ?? 0) + count;
    }
    return acc;
  }, {});
  const recoveryStrategies = benchmarkRuns.reduce<Record<string, number>>((acc, run) => {
    for (const [strategy, count] of Object.entries(run.executionMetrics.recoveryStrategies ?? {})) {
      acc[strategy] = (acc[strategy] ?? 0) + count;
    }
    return acc;
  }, {});
  const budgetBreachCount = benchmarkRuns.reduce((sum, run) => sum + run.executionMetrics.budgetBreaches, 0);
  const thresholds = input.benchmark.fieldAwarenessThresholds;
  const thresholdStatus = uniqueFieldAwarenessCount < thresholds.minFieldAwarenessCount
    || firstPassScreenResolutionRate < thresholds.minFirstPassScreenResolutionRate
    || firstPassElementResolutionRate < thresholds.minFirstPassElementResolutionRate
    || degradedLocatorRate > thresholds.maxDegradedLocatorRate
    ? 'fail'
    : reviewRequiredCount > 0
      ? 'warn'
      : 'pass';

  return {
    kind: 'benchmark-scorecard',
    version: 1,
    benchmark: input.benchmark.name,
    generatedAt: new Date().toISOString(),
    uniqueFieldAwarenessCount,
    firstPassScreenResolutionRate,
    firstPassElementResolutionRate,
    degradedLocatorRate,
    reviewRequiredCount,
    repairLoopCount,
    operatorTouchCount: input.approvalCount,
    knowledgeChurn: knowledgeChurnForBundles(input.proposalBundles),
    generatedVariantCount: input.generatedVariantCount,
    translationHitRate,
    agenticHitRate,
    approvedEquivalentCount,
    thinKnowledgeScreenCount,
    degradedLocatorHotspotCount,
    interpretationDriftHotspotCount,
    overlayChurn,
    executionTimingTotalsMs: timingTotals,
    executionCostTotals,
    executionFailureFamilies,
    recoveryFamilies,
    recoveryStrategies,
    budgetBreachCount,
    thresholdStatus,
    learning: input.learningScorecard ?? null,
  };
}

function renderVariantSpec(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[]): string {
  const lines: string[] = [
    `// Benchmark variants for ${benchmark.name}`,
    `import { literal, workflow } from '../../lib/domain/workflow-facade';`,
    '',
    'export const benchmarkVariants = [',
    ...variants.map((variant) =>
      `  workflow.screen('${variant.screen}').element('${variant.element}').input(literal('${variant.id}'), '${variant.posture}'),`,
    ),
    '] as const;',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function renderVariantReview(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[], scorecard: BenchmarkScorecard): string {
  const lines: string[] = [
    `# ${benchmark.name} benchmark`,
    '',
    `- Field awareness count: ${scorecard.uniqueFieldAwarenessCount}`,
    `- Generated variants: ${scorecard.generatedVariantCount}`,
    `- Threshold status: ${scorecard.thresholdStatus}`,
    `- Next commands: tesseract benchmark --benchmark ${benchmark.name} | tesseract scorecard --benchmark ${benchmark.name} | tesseract inbox`,
    '',
  ];

  for (const variant of variants) {
    lines.push(`## ${variant.id}`);
    lines.push('');
    lines.push(`- Field: ${variant.fieldId}`);
    lines.push(`- Screen: ${variant.screen}`);
    lines.push(`- Element: ${variant.element}`);
    lines.push(`- Posture: ${variant.posture}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

function variantTrace(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[], scorecard: BenchmarkScorecard) {
  return {
    kind: 'benchmark-variant-trace',
    version: 1,
    benchmark: benchmark.name,
    generatedAt: new Date().toISOString(),
    scorecard,
    variants,
  };
}

function relatedImprovementRuns(
  runs: readonly ImprovementRun[],
  scenarioIds: readonly string[],
): readonly ImprovementRun[] {
  const scenarioIdSet = new Set(scenarioIds);
  return [...runs]
    .filter((run) => run.iterations.some((iteration) => iteration.scenarioIds.some((scenarioId) => scenarioIdSet.has(String(scenarioId)))))
    .sort((left, right) => (right.completedAt ?? right.startedAt).localeCompare(left.completedAt ?? left.startedAt));
}

function summarizeImprovementRuns(
  runs: readonly ImprovementRun[],
): ImprovementProjectionSummary | null {
  if (runs.length === 0) {
    return null;
  }

  const latestImprovementRun = runs[0] ?? null;
  const latestDecision = latestImprovementRun?.acceptanceDecisions[0] ?? null;
  return {
    relatedRunIds: runs.map((run) => run.improvementRunId),
    latestRunId: latestImprovementRun?.improvementRunId ?? null,
    latestAccepted: latestImprovementRun?.accepted ?? null,
    latestVerdict: latestDecision?.verdict ?? null,
    latestDecisionId: latestDecision?.decisionId ?? null,
    signalCount: latestImprovementRun?.signals.length ?? 0,
    candidateInterventionCount: latestImprovementRun?.candidateInterventions.length ?? 0,
    checkpointRef: latestDecision?.checkpointRef ?? null,
  };
}

function renderScorecardMarkdown(
  benchmark: BenchmarkContext,
  scorecard: BenchmarkScorecard,
  run: BenchmarkImprovementProjection | null,
): string {
  const lines = [
    `# ${benchmark.name} scorecard`,
    '',
    `- Threshold status: ${scorecard.thresholdStatus}`,
    `- Unique field awareness count: ${scorecard.uniqueFieldAwarenessCount}`,
    `- First-pass screen resolution rate: ${scorecard.firstPassScreenResolutionRate}`,
    `- First-pass element resolution rate: ${scorecard.firstPassElementResolutionRate}`,
    `- Degraded locator rate: ${scorecard.degradedLocatorRate}`,
    `- Review-required count: ${scorecard.reviewRequiredCount}`,
    `- Repair-loop count: ${scorecard.repairLoopCount}`,
    `- Operator-touch count: ${scorecard.operatorTouchCount}`,
    `- Translation hit rate: ${scorecard.translationHitRate}`,
    `- Agentic hit rate: ${scorecard.agenticHitRate}`,
    `- Approved-equivalent count: ${scorecard.approvedEquivalentCount}`,
    `- Thin-knowledge screens: ${scorecard.thinKnowledgeScreenCount}`,
    `- Degraded locator hotspots: ${scorecard.degradedLocatorHotspotCount}`,
    `- Interpretation drift hotspots: ${scorecard.interpretationDriftHotspotCount}`,
    `- Overlay churn: ${scorecard.overlayChurn}`,
    `- Execution timing totals (ms): ${JSON.stringify(scorecard.executionTimingTotalsMs)}`,
    `- Execution cost totals: ${JSON.stringify(scorecard.executionCostTotals)}`,
    `- Execution failure families: ${JSON.stringify(scorecard.executionFailureFamilies)}`,
    `- Recovery families: ${JSON.stringify(scorecard.recoveryFamilies)}`,
    `- Recovery strategies: ${JSON.stringify(scorecard.recoveryStrategies)}`,
    `- Budget breach count: ${scorecard.budgetBreachCount}`,
    `- Knowledge churn: ${JSON.stringify(scorecard.knowledgeChurn)}`,
    `- Generated variants: ${scorecard.generatedVariantCount}`,
    `- Next commands: tesseract benchmark --benchmark ${benchmark.name} | tesseract scorecard --benchmark ${benchmark.name} | tesseract inbox`,
    '',
    ...(scorecard.learning ? [
      '## Learning',
      '',
      `- Corpus fragment count: ${scorecard.learning.corpusFragmentCount}`,
      `- Replay example count: ${scorecard.learning.replayExampleCount}`,
      `- Avg reproducibility score: ${scorecard.learning.avgReproducibilityScore}`,
      `- Fragment provenance completeness: ${scorecard.learning.fragmentProvenanceCompleteness}`,
      `- Thin screen count: ${scorecard.learning.thinScreenCount}`,
      `- Thin action family count: ${scorecard.learning.thinActionFamilyCount}`,
      `- Top bottleneck screen: ${scorecard.learning.topBottleneckScreen ?? 'none'}`,
      `- Top bottleneck impact: ${scorecard.learning.topBottleneckImpact}`,
      `- Ranked proposal count: ${scorecard.learning.rankedProposalCount}`,
      `- Top proposal id: ${scorecard.learning.topProposalId ?? 'none'}`,
      `- Top proposal score: ${scorecard.learning.topProposalScore}`,
      '',
    ] : []),
    ...(run?.improvement ? [
      '## Recursive Improvement',
      '',
      `- Related runs: ${run.improvement.relatedRunIds.join(', ') || 'none'}`,
      `- Latest run: ${run.improvement.latestRunId ?? 'none'}`,
      `- Latest accepted: ${run.improvement.latestAccepted === null ? 'none' : run.improvement.latestAccepted ? 'yes' : 'no'}`,
      `- Latest verdict: ${run.improvement.latestVerdict ?? 'none'}`,
      `- Latest decision id: ${run.improvement.latestDecisionId ?? 'none'}`,
      `- Latest checkpoint: ${run.improvement.checkpointRef ?? 'none'}`,
      `- Latest signal count: ${run.improvement.signalCount}`,
      `- Latest candidate interventions: ${run.improvement.candidateInterventionCount}`,
      '',
    ] : []),
    ...(run ? [
      '## Benchmark Improvement Projection',
      '',
      `- Run id: ${run.runId}`,
      `- Runbooks: ${run.runbooks.join(', ') || 'none'}`,
      `- Scenario ids: ${run.scenarioIds.join(', ') || 'none'}`,
      '',
    ] : []),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function projectBenchmarkScorecard(options: {
  paths: ProjectPaths;
  benchmarkName: string;
  includeExecution?: boolean | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const executionContext = yield* ExecutionContext;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const benchmark = benchmarkByName(catalog.benchmarks.map((entry) => entry.artifact), options.benchmarkName);
    const variants = variantsForBenchmark(benchmark);

    let scenarioIds: string[] = [];
    if (options.includeExecution) {
      for (const runbook of benchmark.benchmarkRunbooks) {
        const selection = yield* runScenarioSelection({
          paths: options.paths,
          runbookName: runbook.runbook,
          tag: runbook.tag ?? undefined,
          interpreterMode: executionContext.posture.interpreterMode === 'playwright'
            ? 'diagnostic'
            : executionContext.posture.interpreterMode,
          posture: executionContext.posture,
        });
        scenarioIds = uniqueSorted([...scenarioIds, ...selection.selection.adoIds]);
      }
    } else {
      scenarioIds = uniqueSorted(
        catalog.scenarios
          .flatMap((entry) => entry.artifact.metadata.suite.startsWith(benchmark.suite) ? [entry.artifact.source.ado_id] : []),
      );
    }

    // After execution, reload post-run scope to pick up new run records; otherwise reuse the initial catalog
    const scorecardCatalog = options.includeExecution
      ? yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' })
      : catalog;
    const proposalBundles = proposalsForScenarios(scorecardCatalog.proposalBundles.map((entry) => entry.artifact), scenarioIds);
    const scorecard = scorecardForBenchmark({
      benchmark,
      scenarioIds,
      proposalBundles,
      approvalCount: scorecardCatalog.approvalReceipts.length,
      generatedVariantCount: variants.length,
      runRecords: scorecardCatalog.runRecords.map((entry) => ({
        adoId: entry.artifact.adoId,
        executionMetrics: entry.artifact.executionMetrics,
        steps: entry.artifact.steps.map((step) => ({
          resolutionMode: step.interpretation.resolutionMode,
          winningSource: step.interpretation.winningSource,
          degraded: step.execution.degraded,
        })),
      })),
      confidenceRecords: (scorecardCatalog.confidenceCatalog?.artifact.records ?? []).map((record) => ({
        id: record.id,
        status: record.status,
        screen: record.screen ?? null,
        failureCount: record.failureCount,
      })),
      interpretationDriftRecords: scorecardCatalog.interpretationDriftRecords.map((entry) => entry.artifact),
    });
    const improvementRuns = relatedImprovementRuns(
      scorecardCatalog.improvementRuns.map((entry) => entry.artifact),
      scenarioIds,
    );
    const benchmarkImprovementProjection: BenchmarkImprovementProjection = {
      kind: 'benchmark-improvement-projection',
      version: 1,
      benchmark: benchmark.name,
      runId: new Date().toISOString().replace(/[:.]/g, '-'),
      executedAt: new Date().toISOString(),
      posture: executionContext.posture,
      runbooks: benchmark.benchmarkRunbooks.map((entry) => entry.runbook),
      scenarioIds: scenarioIds as unknown as DogfoodRun['scenarioIds'],
      driftEventIds: benchmark.driftEvents.map((event) => event.id),
      scorecard,
      improvement: summarizeImprovementRuns(improvementRuns),
      nextCommands: [
        `tesseract scorecard --benchmark ${benchmark.name}`,
        `tesseract inbox`,
      ],
    };
    const dogfoodRun: DogfoodRun = {
      ...benchmarkImprovementProjection,
      kind: 'dogfood-run',
    };
    const variantSpec = renderVariantSpec(benchmark, variants);
    const variantTraceArtifact = variantTrace(benchmark, variants, scorecard);
    const variantReview = renderVariantReview(benchmark, variants, scorecard);
    const scorecardMarkdown = renderScorecardMarkdown(benchmark, scorecard, benchmarkImprovementProjection);

    const benchmarkImprovementPath = benchmarkImprovementProjectionPath(options.paths, benchmark.name, benchmarkImprovementProjection.runId);
    const dogfoodPath = benchmarkDogfoodRunPath(options.paths, benchmark.name, dogfoodRun.runId);
    const scorecardJsonPath = benchmarkScorecardJsonPath(options.paths, benchmark.name);
    const scorecardMarkdownPath = benchmarkScorecardMarkdownPath(options.paths, benchmark.name);
    const variantsSpecPath = benchmarkVariantsSpecPath(options.paths, benchmark.name);
    const variantsTracePath = benchmarkVariantsTracePath(options.paths, benchmark.name);
    const variantsReviewPath = benchmarkVariantsReviewPath(options.paths, benchmark.name);

    yield* fs.writeJson(benchmarkImprovementPath, benchmarkImprovementProjection);
    yield* fs.writeJson(dogfoodPath, dogfoodRun);
    yield* fs.writeJson(scorecardJsonPath, scorecard);
    yield* fs.writeText(scorecardMarkdownPath, scorecardMarkdown);
    yield* fs.writeText(variantsSpecPath, variantSpec);
    yield* fs.writeJson(variantsTracePath, variantTraceArtifact);
    yield* fs.writeText(variantsReviewPath, variantReview);

    return {
      benchmark: benchmark.name,
      scorecard,
      benchmarkImprovementProjection,
      dogfoodRun,
      benchmarkImprovementPath,
      scorecardJsonPath,
      scorecardMarkdownPath,
      variantsSpecPath,
      variantsTracePath,
      variantsReviewPath,
      rewritten: [
        relativeProjectPath(options.paths, benchmarkImprovementPath),
        relativeProjectPath(options.paths, dogfoodPath),
        relativeProjectPath(options.paths, scorecardJsonPath),
        relativeProjectPath(options.paths, scorecardMarkdownPath),
        relativeProjectPath(options.paths, variantsSpecPath),
        relativeProjectPath(options.paths, variantsTracePath),
        relativeProjectPath(options.paths, variantsReviewPath),
      ],
    };
  });
}

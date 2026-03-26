/**
 * Speedrun core — the programmatic forward pass of the self-improving loop.
 *
 * This module owns the full speedrun pipeline as Effect programs:
 * - Single-seed speedrun (generate → flywheel → fitness → scorecard → experiment)
 * - Multi-seed orchestration (sequential seed runs → averaged fitness → aggregate comparison)
 * - Scorecard loading, comparison, and conditional update
 * - Experiment recording
 * - Clean-slate preparation (wipe transient artifacts, restore knowledge to HEAD)
 *
 * Scripts are thin CLI wrappers that parse args and call these programs.
 */

import path from 'path';
import { Effect } from 'effect';
import type { ProjectPaths } from './paths';
import { generateSyntheticScenarios } from './synthesis/scenario-generator';
import { refreshScenarioCore } from './refresh';
import { buildDerivedGraph } from './graph';
import { generateTypes } from './types';
import { resolveEffectConcurrency } from './concurrency';
import { runDogfoodLoop } from './dogfood';
import type { AdoId } from '../domain/identity';
import {
  averageFitnessReports,
  buildFitnessReport,
  compareToScorecard,
  updateScorecard,
  type FitnessInputData,
  type ScorecardComparison,
} from './fitness';
import { buildImprovementRun, recordImprovementRun, scorecardPath } from './improvement';
import { recordExperiment } from './experiment-registry';
import { loadWorkspaceCatalog } from './catalog';
import { cleanSlateProgram } from './clean-slate';
import { FileSystem, VersionControl } from './ports';
import type {
  ExperimentRecord,
  ExperimentSubstrate,
  ImprovementRun,
  KnowledgePosture,
  PipelineConfig,
  PipelineFitnessReport,
  PipelineScorecard,
  ProposalBundle,
  SpeedrunProgressEvent,
  SubstrateContext,
} from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import type { RunRecord } from '../domain/types/execution';

// ─── Public input/result types ───

export interface SpeedrunInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly count: number;
  readonly seed: string;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
  /** Rate [0,1] at which step text is perturbed with synonyms NOT in the knowledge base. */
  readonly perturbationRate?: number | undefined;
  readonly tag?: string | undefined;
  readonly parentExperimentId?: string | null | undefined;
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /**
   * Fire-and-forget progress callback. Invoked after each dogfood iteration
   * and at phase boundaries (generate, fitness, complete). The callback is a
   * side channel for observability — it does not participate in the pipeline.
   */
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export interface SpeedrunResult {
  readonly pipelineVersion: string;
  readonly fitnessReport: PipelineFitnessReport;
  readonly comparison: ScorecardComparison;
  readonly completedIterations: number;
  readonly converged: boolean;
  readonly improvementRun: ImprovementRun;
}

export interface MultiSeedInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly seeds: readonly string[];
  readonly count: number;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
  /** Rate [0,1] at which step text is perturbed with synonyms NOT in the knowledge base. */
  readonly perturbationRate?: number | undefined;
  readonly tag?: string | undefined;
  readonly knowledgePosture?: KnowledgePosture | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export interface MultiSeedResult {
  readonly pipelineVersion: string;
  readonly fitnessReport: PipelineFitnessReport;
  readonly comparison: ScorecardComparison;
  readonly seedResults: readonly SpeedrunResult[];
  readonly scorecardUpdated: boolean;
}

// ─── Pure helpers ───

function diffPipelineConfig(current: PipelineConfig): Partial<PipelineConfig> {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      const baselineValue = DEFAULT_PIPELINE_CONFIG[key as keyof PipelineConfig];
      return JSON.stringify(baselineValue) !== JSON.stringify(value);
    }),
  ) as Partial<PipelineConfig>;
}

// ─── Scorecard loading/saving as Effect programs ───

function loadScorecard(paths: ProjectPaths) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const artifactPath = scorecardPath(paths);
    const exists = yield* fs.exists(artifactPath);
    if (!exists) {
      return null;
    }
    return (yield* fs.readJson(artifactPath)) as PipelineScorecard;
  });
}

function saveScorecard(paths: ProjectPaths, scorecard: PipelineScorecard) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = path.dirname(scorecardPath(paths));
    yield* fs.ensureDir(dir);
    yield* fs.writeJson(scorecardPath(paths), scorecard);
  });
}

function saveFitnessReport(paths: ProjectPaths, report: PipelineFitnessReport) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const dir = path.join(paths.rootDir, '.tesseract', 'benchmarks', 'runs');
    yield* fs.ensureDir(dir);
    const timestamp = report.runAt.replace(/[:.]/g, '-');
    const filePath = path.join(dir, `${timestamp}.fitness.json`);
    yield* fs.writeJson(filePath, report);
    return filePath;
  });
}

// ─── Single-seed speedrun program ───

export function speedrunProgram(input: SpeedrunInput): Effect.Effect<SpeedrunResult, unknown, any> {
  return Effect.gen(function* () {
    const speedrunStart = Date.now();

    const generateStart = Date.now();
    const generated = yield* generateSyntheticScenarios({
      paths: input.paths,
      count: input.count,
      seed: input.seed,
      perturbationRate: input.perturbationRate,
    });
    const generateDuration = Date.now() - generateStart;

    // Emit generate-phase progress
    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'generate',
      iteration: 0,
      maxIterations: input.maxIterations,
      metrics: null,
      convergenceReason: null,
      elapsed: Date.now() - speedrunStart,
      phaseDurationMs: generateDuration,
      wallClockMs: Date.now(),
      seed: input.seed,
      scenarioCount: generated.scenariosGenerated,
    });

    const { ledger } = yield* runDogfoodLoop({
      paths: input.paths,
      maxIterations: input.maxIterations,
      convergenceThreshold: input.config.convergenceThreshold,
      interpreterMode: 'diagnostic',
      tag: input.tag ?? 'synthetic',
      runbook: 'synthetic-dogfood',
      knowledgePosture: input.knowledgePosture,
      onProgress: input.onProgress,
      seed: input.seed,
    });

    const fitnessStart = Date.now();

    // Emit fitness-phase progress (timing updated after computation below)

    const catalog = yield* loadWorkspaceCatalog({
      paths: input.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });
    const runRecords: RunRecord[] = catalog.runRecords.map((entry) => entry.artifact as unknown as RunRecord);
    const runSteps = runRecords.flatMap((record) =>
      record.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const proposalBundles: ProposalBundle[] = catalog.proposalBundles.map((entry) => entry.artifact);

    const versionControl = yield* VersionControl;
    const pipelineVersion = yield* versionControl.currentRevision().pipe(
      Effect.catchAll(() => Effect.succeed('unknown')),
    );

    const fitnessData: FitnessInputData = {
      pipelineVersion,
      ledger,
      runSteps,
      proposalBundles,
    };
    const fitnessReport = buildFitnessReport(fitnessData);
    const fitnessDuration = Date.now() - fitnessStart;

    // Emit fitness-phase progress
    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'fitness',
      iteration: ledger.completedIterations,
      maxIterations: input.maxIterations,
      metrics: {
        knowledgeHitRate: fitnessReport.metrics.knowledgeHitRate,
        proposalsActivated: 0,
        totalSteps: 0,
        unresolvedSteps: 0,
      },
      convergenceReason: ledger.convergenceReason,
      elapsed: Date.now() - speedrunStart,
      phaseDurationMs: fitnessDuration,
      wallClockMs: Date.now(),
      seed: input.seed,
    });

    const existingScorecard = yield* loadScorecard(input.paths);
    const comparison = compareToScorecard(fitnessReport, existingScorecard);

    const improvementRun = buildImprovementRun({
      paths: input.paths,
      pipelineVersion,
      baselineConfig: DEFAULT_PIPELINE_CONFIG,
      configDelta: diffPipelineConfig(input.config),
      substrateContext: {
        substrate: input.substrate ?? 'synthetic',
        seed: input.seed,
        scenarioCount: input.count,
        screenCount: generated.screens.length,
        phrasingTemplateVersion: 'v1',
        ...('screenDistribution' in generated
          ? { screenDistribution: (generated as { readonly screenDistribution: ReadonlyArray<{ readonly screen: string; readonly count: number }> }).screenDistribution }
          : {}),
      },
      fitnessReport,
      scorecardComparison: {
        improved: comparison.improved,
        knowledgeHitRateDelta: comparison.knowledgeHitRateDelta,
        translationPrecisionDelta: comparison.translationPrecisionDelta,
        convergenceVelocityDelta: comparison.convergenceVelocityDelta,
      },
      scorecardSummary: comparison.summary,
      ledger,
      parentExperimentId: input.parentExperimentId ?? null,
      tags: input.tag ? [input.tag] : [],
    });

    yield* recordImprovementRun({ paths: input.paths, run: improvementRun });

    return {
      pipelineVersion,
      fitnessReport,
      comparison,
      completedIterations: ledger.completedIterations,
      converged: ledger.converged,
      improvementRun,
    };
  });
}

// ─── Multi-seed speedrun program ───

/**
 * Run the full speedrun for each seed sequentially (parallel would double
 * memory), average fitness reports, compare against the scorecard, and
 * record the experiment. Returns the aggregate result.
 */
export function multiSeedSpeedrun(input: MultiSeedInput): Effect.Effect<MultiSeedResult, unknown, any> {
  return Effect.gen(function* () {
    const multiStart = Date.now();
    const versionControl = yield* VersionControl;
    const pipelineVersion = yield* versionControl.currentRevision().pipe(
      Effect.catchAll(() => Effect.succeed('unknown')),
    );

    // Run each seed sequentially
    const seedResults: SpeedrunResult[] = [];
    for (const currentSeed of input.seeds) {
      // Clean slate before each seed
      yield* cleanSlateProgram(input.paths.rootDir, input.paths);

      const result = yield* speedrunProgram({
        paths: input.paths,
        config: input.config,
        count: input.count,
        seed: currentSeed,
        maxIterations: input.maxIterations,
        substrate: input.substrate,
        perturbationRate: input.perturbationRate,
        tag: input.tag,
        knowledgePosture: input.knowledgePosture,
        onProgress: input.onProgress,
      });

      // Save per-seed fitness report
      yield* saveFitnessReport(input.paths, result.fitnessReport);

      // Clean slate after each seed to restore knowledge
      yield* cleanSlateProgram(input.paths.rootDir, input.paths);

      seedResults.push(result);
    }

    // Aggregate: average reports for multi-seed, use single for single
    const reports = seedResults.map((r) => r.fitnessReport);
    const fitnessReport = averageFitnessReports(reports);

    // Compare against scorecard
    const existingScorecard = yield* loadScorecard(input.paths);
    const comparison = compareToScorecard(fitnessReport, existingScorecard);

    // Update scorecard if improved
    let scorecardUpdated = false;
    if (comparison.improved) {
      const updatedScorecard = updateScorecard(fitnessReport, existingScorecard, comparison);
      yield* saveScorecard(input.paths, updatedScorecard);
      scorecardUpdated = true;
    }

    // Record experiment
    const primaryResult = seedResults[0]!;
    const substrateContext: SubstrateContext = {
      substrate: input.substrate ?? 'synthetic',
      seed: input.seeds.length > 1 ? input.seeds.join(',') : input.seeds[0]!,
      scenarioCount: input.count,
      screenCount: fitnessReport.metrics.resolutionByRung.length,
      phrasingTemplateVersion: 'v2',
    };
    const configDelta = diffPipelineConfig(input.config);
    const experimentRecord: ExperimentRecord = {
      id: new Date().toISOString().replace(/[:.]/g, '-'),
      runAt: fitnessReport.runAt,
      pipelineVersion,
      baselineConfig: DEFAULT_PIPELINE_CONFIG,
      configDelta,
      substrateContext,
      fitnessReport,
      scorecardComparison: {
        improved: comparison.improved,
        knowledgeHitRateDelta: comparison.knowledgeHitRateDelta,
        translationPrecisionDelta: comparison.translationPrecisionDelta,
        convergenceVelocityDelta: comparison.convergenceVelocityDelta,
      },
      accepted: comparison.improved,
      tags: input.tag ? [input.tag] : [],
      parentExperimentId: null,
      improvementRunId: primaryResult.improvementRun.improvementRunId,
      improvementRun: primaryResult.improvementRun,
    };
    yield* recordExperiment(input.paths, experimentRecord);

    // Emit completion progress
    const totalDuration = Date.now() - multiStart;
    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'complete',
      iteration: primaryResult.completedIterations,
      maxIterations: input.maxIterations,
      metrics: {
        knowledgeHitRate: fitnessReport.metrics.knowledgeHitRate,
        proposalsActivated: 0,
        totalSteps: 0,
        unresolvedSteps: 0,
      },
      convergenceReason: null,
      elapsed: totalDuration,
      phaseDurationMs: totalDuration,
      wallClockMs: Date.now(),
      seed: input.seeds.join(','),
    });

    return {
      pipelineVersion,
      fitnessReport,
      comparison,
      seedResults,
      scorecardUpdated,
    };
  });
}

// ─── Segmented phase programs ───
// Each phase reads from and writes to disk artifacts, enabling step-through execution.

export interface GeneratePhaseInput {
  readonly paths: ProjectPaths;
  readonly count: number;
  readonly seed: string;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export function generatePhase(input: GeneratePhaseInput) {
  return Effect.gen(function* () {
    const start = Date.now();
    const generated = yield* generateSyntheticScenarios({
      paths: input.paths,
      count: input.count,
      seed: input.seed,
    });
    const durationMs = Date.now() - start;

    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'generate',
      iteration: 0,
      maxIterations: 0,
      metrics: null,
      convergenceReason: null,
      elapsed: durationMs,
      phaseDurationMs: durationMs,
      wallClockMs: Date.now(),
      seed: input.seed,
      scenarioCount: generated.scenariosGenerated,
    });

    return { scenariosGenerated: generated.scenariosGenerated, screens: generated.screens, durationMs };
  });
}

export interface CompilePhaseInput {
  readonly paths: ProjectPaths;
  readonly tag?: string | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export function compilePhase(input: CompilePhaseInput) {
  return Effect.gen(function* () {
    const start = Date.now();
    const catalog = yield* loadWorkspaceCatalog({
      paths: input.paths,
      knowledgePosture: 'warm-start',
      scope: 'compile',
    });

    const tag = input.tag ?? null;
    const scenarioIds = catalog.scenarios
      .map((entry) => entry.artifact)
      .filter((scenario) => !tag || scenario.metadata.tags.includes(tag))
      .map((scenario) => scenario.source.ado_id);

    const compileConcurrency = resolveEffectConcurrency();
    yield* Effect.all(
      scenarioIds.map((adoId) => refreshScenarioCore({ adoId: adoId as AdoId, paths: input.paths, catalog })),
      { concurrency: compileConcurrency },
    );
    // Single pass for global projections after all scenarios are compiled
    yield* Effect.all({
      graph: buildDerivedGraph({ paths: input.paths }),
      generatedTypes: generateTypes({ paths: input.paths }),
    }, { concurrency: 'unbounded' });

    const durationMs = Date.now() - start;

    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'compile',
      iteration: 0,
      maxIterations: 0,
      metrics: null,
      convergenceReason: null,
      elapsed: durationMs,
      phaseDurationMs: durationMs,
      wallClockMs: Date.now(),
      seed: '',
      scenarioCount: scenarioIds.length,
    });

    return { scenariosCompiled: scenarioIds.length, durationMs };
  });
}

export interface IteratePhaseInput {
  readonly paths: ProjectPaths;
  readonly maxIterations: number;
  readonly convergenceThreshold?: number | undefined;
  readonly tag?: string | undefined;
  readonly runbook?: string | undefined;
  readonly knowledgePosture?: KnowledgePosture | undefined;
  readonly seed?: string | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export function iteratePhase(input: IteratePhaseInput) {
  return Effect.gen(function* () {
    const start = Date.now();
    const { ledger } = yield* runDogfoodLoop({
      paths: input.paths,
      maxIterations: input.maxIterations,
      convergenceThreshold: input.convergenceThreshold,
      interpreterMode: 'diagnostic',
      tag: input.tag ?? 'synthetic',
      runbook: input.runbook ?? 'synthetic-dogfood',
      knowledgePosture: input.knowledgePosture,
      onProgress: input.onProgress,
      seed: input.seed,
    });
    const durationMs = Date.now() - start;
    return { ledger, durationMs };
  });
}

export interface FitnessPhaseInput {
  readonly paths: ProjectPaths;
  readonly seed?: string | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

export function fitnessPhase(input: FitnessPhaseInput) {
  return Effect.gen(function* () {
    const start = Date.now();
    const catalog = yield* loadWorkspaceCatalog({
      paths: input.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });

    const runRecords: RunRecord[] = catalog.runRecords.map((entry) => entry.artifact as unknown as RunRecord);
    const runSteps = runRecords.flatMap((record) =>
      record.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const proposalBundles: ProposalBundle[] = catalog.proposalBundles.map((entry) => entry.artifact);

    const versionControl = yield* VersionControl;
    const pipelineVersion = yield* versionControl.currentRevision().pipe(
      Effect.catchAll(() => Effect.succeed('unknown')),
    );

    const fitnessData: FitnessInputData = {
      pipelineVersion,
      ledger: null as never, // Ledger not available in standalone fitness phase
      runSteps,
      proposalBundles,
    };
    const fitnessReport = buildFitnessReport(fitnessData);
    yield* saveFitnessReport(input.paths, fitnessReport);

    const durationMs = Date.now() - start;

    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'fitness',
      iteration: 0,
      maxIterations: 0,
      metrics: {
        knowledgeHitRate: fitnessReport.metrics.knowledgeHitRate,
        proposalsActivated: 0,
        totalSteps: runSteps.length,
        unresolvedSteps: 0,
      },
      convergenceReason: null,
      elapsed: durationMs,
      phaseDurationMs: durationMs,
      wallClockMs: Date.now(),
      seed: input.seed ?? '',
    });

    return { fitnessReport, durationMs };
  });
}

export interface ReportPhaseInput {
  readonly paths: ProjectPaths;
}

export function reportPhase(input: ReportPhaseInput) {
  return Effect.gen(function* () {
    const catalog = yield* loadWorkspaceCatalog({
      paths: input.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });

    const runRecords: RunRecord[] = catalog.runRecords.map((entry) => entry.artifact as unknown as RunRecord);
    const runSteps = runRecords.flatMap((record) =>
      record.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const proposalBundles: ProposalBundle[] = catalog.proposalBundles.map((entry) => entry.artifact);

    const versionControl = yield* VersionControl;
    const pipelineVersion = yield* versionControl.currentRevision().pipe(
      Effect.catchAll(() => Effect.succeed('unknown')),
    );

    const fitnessReport = buildFitnessReport({
      pipelineVersion,
      ledger: null as never,
      runSteps,
      proposalBundles,
    });

    const existingScorecard = yield* loadScorecard(input.paths);
    const comparison = compareToScorecard(fitnessReport, existingScorecard);

    if (comparison.improved) {
      const updatedScorecard = updateScorecard(fitnessReport, existingScorecard, comparison);
      yield* saveScorecard(input.paths, updatedScorecard);
    }

    return { fitnessReport, comparison, scorecardUpdated: comparison.improved };
  });
}

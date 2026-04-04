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
import { Effect, Either, Schema } from 'effect';
import type { ProjectPaths } from '../paths';
import { generateSyntheticScenarios } from '../synthesis/scenario-generator';
import { generateDriftVariants } from '../synthesis/interface-fuzzer';
import { compileScenariosParallel } from '../compile';
import { runDogfoodLoop } from './dogfood';
import type { AdoId } from '../../domain/kernel/identity';
import {
  averageFitnessReports,
  buildFitnessReport,
  compareToScorecard,
  updateScorecard,
  type FitnessInputData,
  type ScorecardComparison,
} from '../fitness';
import { buildImprovementRun, recordImprovementRun, scorecardPath } from './improvement';
import { recordExperiment } from './experiment-registry';
import { loadWorkspaceCatalog } from '../catalog';
import { cleanSlateProgram } from './clean-slate';
import { Dashboard, FileSystem, VersionControl } from '../ports';
import { validateRunRecord } from '../../domain/validation';
import { decodeUnknownEither } from '../../domain/schemas/decode';
import type {
  ExperimentRecord,
  ExperimentSubstrate,
  ImprovementLoopLedger,
  ImprovementRun,
  KnowledgePosture,
  PipelineConfig,
  PipelineFitnessReport,
  PipelineScorecard,
  ProposalBundle,
  SpeedrunProgressEvent,
  SubstrateContext,
} from '../../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import type { RunRecord } from '../../domain/types/execution-context';
import type { PerturbationConfig } from '../synthesis/scenario-generator';
import { TesseractError } from '../../domain/kernel/errors';

// ─── Public input/result types ───

export interface SpeedrunInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly count: number;
  readonly seed: string;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
  /** Lexical gap rate [0,1] — probability of using held-out vocabulary instead of known aliases. */
  readonly perturbationRate?: number | undefined;
  /** Fine-grained perturbation config (lexicalGap, dataVariation, coverageGap, crossScreen). */
  readonly perturbation?: PerturbationConfig | undefined;
  readonly tag?: string | undefined;
  readonly parentExperimentId?: string | null | undefined;
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /** Number of knowledge drift mutations to apply before scenario generation. 0 = no drift. */
  readonly driftCount?: number | undefined;
  /**
   * Fire-and-forget progress callback. Invoked after each dogfood iteration
   * and at phase boundaries (generate, fitness, complete). The callback is a
   * side channel for observability — it does not participate in the pipeline.
   */
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
  /** Interpreter mode for the dogfood loop. Default: 'playwright'. */
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | 'playwright' | undefined;
  /** Base URL of the SUT for Playwright execution (e.g., http://127.0.0.1:3200). */
  readonly baseUrl?: string | undefined;
  /** Browser pool for page reuse across scenarios. Managed by caller. */
  readonly browserPool?: import('../browser-pool').BrowserPoolPort | undefined;
}

export interface SpeedrunResult {
  readonly pipelineVersion: string;
  readonly fitnessReport: PipelineFitnessReport;
  readonly comparison: ScorecardComparison;
  readonly completedIterations: number;
  readonly converged: boolean;
  readonly improvementRun: ImprovementRun;
  /** The dogfood loop ledger — carries per-iteration proposalsGenerated counts. */
  readonly ledger: ImprovementLoopLedger;
}

export interface MultiSeedInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly seeds: readonly string[];
  readonly count: number;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
  /** Lexical gap rate [0,1] — probability of using held-out vocabulary instead of known aliases. */
  readonly perturbationRate?: number | undefined;
  /** Fine-grained perturbation config (lexicalGap, dataVariation, coverageGap, crossScreen). */
  readonly perturbation?: PerturbationConfig | undefined;
  readonly tag?: string | undefined;
  readonly knowledgePosture?: KnowledgePosture | undefined;
  /** Number of knowledge drift mutations to apply before scenario generation. 0 = no drift. */
  readonly driftCount?: number | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
  /** Interpreter mode for the dogfood loop. Default: 'playwright'. */
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | 'playwright' | undefined;
  readonly baseUrl?: string | undefined;
  /** Browser pool for page reuse across scenarios. Managed by caller. */
  readonly browserPool?: import('../browser-pool').BrowserPoolPort | undefined;
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

const LearningSignalsSummarySchema = Schema.Struct({
  timingRegressionRate: Schema.Number,
  selectorFlakinessRate: Schema.Number,
  recoveryEfficiency: Schema.Number,
  consoleNoiseLevel: Schema.Number,
  costEfficiency: Schema.Number,
  rungStability: Schema.Number,
  componentMaturityRate: Schema.Number,
  compositeHealthScore: Schema.Number,
  hotScreenCount: Schema.Number,
});

const ImprovementLoopIterationSchema = Schema.Struct({
  iteration: Schema.Number,
  scenarioIds: Schema.Array(Schema.String),
  proposalsGenerated: Schema.Number,
  proposalsActivated: Schema.Number,
  proposalsBlocked: Schema.Number,
  knowledgeHitRate: Schema.Number,
  unresolvedStepCount: Schema.Number,
  totalStepCount: Schema.Number,
  instructionCount: Schema.Number,
  learningSignals: Schema.optional(LearningSignalsSummarySchema),
});

const ImprovementLoopLedgerSchema = Schema.Struct({
  kind: Schema.String,
  version: Schema.Literal(1),
  maxIterations: Schema.Number,
  completedIterations: Schema.Number,
  converged: Schema.Boolean,
  convergenceReason: Schema.NullOr(Schema.Literal('no-proposals', 'threshold-met', 'budget-exhausted', 'max-iterations')),
  iterations: Schema.Array(ImprovementLoopIterationSchema),
  totalProposalsActivated: Schema.Number,
  totalInstructionCount: Schema.Number,
  knowledgeHitRateDelta: Schema.Number,
});

const decodeImprovementLoopLedger = decodeUnknownEither<
  typeof ImprovementLoopLedgerSchema.Type,
  typeof ImprovementLoopLedgerSchema.Encoded,
  ImprovementLoopLedger<string>
>(ImprovementLoopLedgerSchema);

function decodeRunRecords(records: ReadonlyArray<unknown>, provenance: string): RunRecord[] {
  return records.map((record, index) => {
    try {
      return validateRunRecord(record);
    } catch (error) {
      throw new TesseractError(
        'run-record-validation-failed',
        `${provenance}.runRecords[${index}] failed validation`,
        error,
      );
    }
  });
}

function decodeLedgerOrThrow(value: unknown, provenance: string): ImprovementLoopLedger<string> {
  return Either.match(decodeImprovementLoopLedger(value), {
    onLeft: (error) => {
      throw new TesseractError(
        'speedrun-ledger-validation-failed',
        `${provenance} failed validation${error.path ? ` at ${error.path}` : ''}`,
        error,
      );
    },
    onRight: (ledger) => ledger,
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

    // Apply knowledge drift mutations before generation (simulates real UI drift)
    if (input.driftCount && input.driftCount > 0) {
      yield* generateDriftVariants({
        paths: input.paths,
        seed: input.seed,
        driftCount: input.driftCount,
      });
    }

    const generateStart = Date.now();
    const generated = yield* generateSyntheticScenarios({
      paths: input.paths,
      count: input.count,
      seed: input.seed,
      perturbationRate: input.perturbationRate,
      perturbation: input.perturbation,
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

    // Thread dashboard port for live visualization (passive — never gates the pipeline)
    const dashboard = yield* Dashboard;

    const { ledger } = yield* runDogfoodLoop({
      paths: input.paths,
      maxIterations: input.maxIterations,
      convergenceThreshold: input.config.convergenceThreshold,
      interpreterMode: input.interpreterMode ?? 'playwright',
      tag: input.tag ?? 'synthetic',
      runbook: 'synthetic-dogfood',
      knowledgePosture: input.knowledgePosture,
      onProgress: input.onProgress,
      seed: input.seed,
      dashboard,
      baseUrl: input.baseUrl,
      browserPool: input.browserPool,
    });

    const fitnessStart = Date.now();

    // Emit fitness-phase progress (timing updated after computation below)

    const catalog = yield* loadWorkspaceCatalog({
      paths: input.paths,
      knowledgePosture: 'warm-start',
      scope: 'post-run',
    });
    const runRecords = decodeRunRecords(
      catalog.runRecords.map((entry) => entry.artifact),
      'speedrunProgram(post-run catalog)',
    );
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
      ledger,
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

    // Structured entropy ramp: perturbation increases across seeds
    // Seed 0 gets baseline perturbation, final seed gets up to 2× perturbation
    const totalSeeds = input.seeds.length;
    const rampPerturbation = (seedIndex: number): typeof input.perturbation => {
      if (!input.perturbation || totalSeeds <= 1) return input.perturbation;
      const rampFactor = 1 + (seedIndex / (totalSeeds - 1));
      const clamp = (v: number) => Math.min(1, v * rampFactor);
      return {
        lexicalGap: clamp(input.perturbation.lexicalGap),
        dataVariation: clamp(input.perturbation.dataVariation),
        coverageGap: clamp(input.perturbation.coverageGap),
        crossScreen: clamp(input.perturbation.crossScreen),
      };
    };

    // Run each seed sequentially via recursive fold
    const runSeeds = (
      remaining: readonly string[],
      acc: readonly SpeedrunResult[],
    ): Effect.Effect<readonly SpeedrunResult[], unknown, any> =>
      Effect.gen(function* () {
        if (remaining.length === 0) return acc;
        const [currentSeed, ...rest] = remaining;
        const seedIndex = totalSeeds - remaining.length;
        // Clean slate before each seed
        yield* cleanSlateProgram(input.paths.rootDir, input.paths);

        const result = yield* speedrunProgram({
          paths: input.paths,
          config: input.config,
          count: input.count,
          seed: currentSeed!,
          maxIterations: input.maxIterations,
          substrate: input.substrate,
          perturbationRate: input.perturbationRate,
          perturbation: rampPerturbation(seedIndex),
          tag: input.tag,
          knowledgePosture: input.knowledgePosture,
          driftCount: input.driftCount,
          onProgress: input.onProgress,
          interpreterMode: input.interpreterMode,
          baseUrl: input.baseUrl,
          browserPool: input.browserPool,
        });

        // Save per-seed fitness report
        yield* saveFitnessReport(input.paths, result.fitnessReport);

        // Clean slate after each seed to restore knowledge
        yield* cleanSlateProgram(input.paths.rootDir, input.paths);

        return yield* runSeeds(rest, [...acc, result]);
      });

    const seedResults = yield* runSeeds(input.seeds, []);

    // Aggregate: average reports for multi-seed, use single for single
    const reports = seedResults.map((r) => r.fitnessReport);
    const fitnessReport = averageFitnessReports(reports);

    // Compare against scorecard
    const existingScorecard = yield* loadScorecard(input.paths);
    const comparison = compareToScorecard(fitnessReport, existingScorecard);

    // Update scorecard if improved
    const scorecardUpdated = comparison.improved;
    if (scorecardUpdated) {
      const updatedScorecard = updateScorecard(fitnessReport, existingScorecard, comparison);
      yield* saveScorecard(input.paths, updatedScorecard);
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
      .flatMap((entry) => !tag || entry.artifact.metadata.tags.includes(tag) ? [entry.artifact.source.ado_id] : []) as readonly AdoId[];

    yield* compileScenariosParallel({
      scenarioIds,
      paths: input.paths,
      catalog,
    });

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
  /** Interpreter mode for the dogfood loop. Default: 'playwright'. */
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | 'playwright' | undefined;
  readonly baseUrl?: string | undefined;
  /** Browser pool for page reuse across scenarios. Managed by caller. */
  readonly browserPool?: import('../browser-pool').BrowserPoolPort | undefined;
}

export function iteratePhase(input: IteratePhaseInput) {
  return Effect.gen(function* () {
    const start = Date.now();
    const dashboard = yield* Dashboard;
    const { ledger } = yield* runDogfoodLoop({
      paths: input.paths,
      maxIterations: input.maxIterations,
      convergenceThreshold: input.convergenceThreshold,
      interpreterMode: input.interpreterMode ?? 'playwright',
      tag: input.tag ?? 'synthetic',
      runbook: input.runbook ?? 'synthetic-dogfood',
      knowledgePosture: input.knowledgePosture,
      onProgress: input.onProgress,
      seed: input.seed,
      dashboard,
      baseUrl: input.baseUrl,
      browserPool: input.browserPool,
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

    const runRecords = decodeRunRecords(
      catalog.runRecords.map((entry) => entry.artifact),
      'fitnessPhase(post-run catalog)',
    );
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

    const fs = yield* FileSystem;
    const ledgerPath = path.join(input.paths.runsDir, 'improvement-loop-ledger.json');
    const rawLedger: unknown = yield* fs.readJson(ledgerPath).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    const emptyLedger: ImprovementLoopLedger<string> = { kind: 'improvement-loop-ledger', version: 1, maxIterations: 0, completedIterations: 0, converged: false, convergenceReason: null, iterations: [], totalProposalsActivated: 0, totalInstructionCount: 0, knowledgeHitRateDelta: 0 };
    const ledger: ImprovementLoopLedger<string> = rawLedger != null
      ? decodeLedgerOrThrow(rawLedger, `fitnessPhase(${ledgerPath})`)
      : emptyLedger;

    const fitnessData: FitnessInputData = {
      pipelineVersion,
      ledger,
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

    const runRecords = decodeRunRecords(
      catalog.runRecords.map((entry) => entry.artifact),
      'reportPhase(post-run catalog)',
    );
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

    const fs = yield* FileSystem;
    const reportLedgerPath = path.join(input.paths.runsDir, 'improvement-loop-ledger.json');
    const rawReportLedger: unknown = yield* fs.readJson(reportLedgerPath).pipe(
      Effect.catchAll(() => Effect.succeed(null)),
    );
    const reportEmptyLedger: ImprovementLoopLedger<string> = { kind: 'improvement-loop-ledger', version: 1, maxIterations: 0, completedIterations: 0, converged: false, convergenceReason: null, iterations: [], totalProposalsActivated: 0, totalInstructionCount: 0, knowledgeHitRateDelta: 0 };
    const reportLedger: ImprovementLoopLedger<string> = rawReportLedger != null
      ? decodeLedgerOrThrow(rawReportLedger, `reportPhase(${reportLedgerPath})`)
      : reportEmptyLedger;

    const fitnessReport = buildFitnessReport({
      pipelineVersion,
      ledger: reportLedger,
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

/**
 * Speedrun core - the programmatic forward pass of the self-improving loop.
 *
 * This module extracts the speedrun pipeline into an Effect program that
 * accepts a PipelineConfig and returns a fitness report, governed comparison,
 * and unified improvement aggregate.
 */

import { Effect } from 'effect';
import type { ProjectPaths } from './paths';
import { generateSyntheticScenarios } from './synthesis/scenario-generator';
import { runDogfoodLoop } from './dogfood';
import { buildFitnessReport, compareToScorecard, type FitnessInputData, type ScorecardComparison } from './fitness';
import { buildImprovementRun, recordImprovementRun, scorecardPath } from './improvement';
import { loadWorkspaceCatalog } from './catalog';
import { FileSystem, VersionControl } from './ports';
import type {
  ExperimentSubstrate,
  ImprovementRun,
  KnowledgePosture,
  PipelineConfig,
  PipelineFitnessReport,
  PipelineScorecard,
  ProposalBundle,
  SpeedrunProgressEvent,
} from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import type { RunRecord } from '../domain/types/execution';

export interface SpeedrunInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly count: number;
  readonly seed: string;
  readonly maxIterations: number;
  readonly substrate?: ExperimentSubstrate | undefined;
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

function diffPipelineConfig(current: PipelineConfig): Partial<PipelineConfig> {
  return Object.fromEntries(
    Object.entries(current).filter(([key, value]) => {
      const baselineValue = DEFAULT_PIPELINE_CONFIG[key as keyof PipelineConfig];
      return JSON.stringify(baselineValue) !== JSON.stringify(value);
    }),
  ) as Partial<PipelineConfig>;
}

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

export function speedrunProgram(input: SpeedrunInput): Effect.Effect<SpeedrunResult, unknown, any> {
  return Effect.gen(function* () {
    const generated = yield* generateSyntheticScenarios({
      paths: input.paths,
      count: input.count,
      seed: input.seed,
    });

    // Emit generate-phase progress
    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'generate',
      iteration: 0,
      maxIterations: input.maxIterations,
      metrics: null,
      convergenceReason: null,
      elapsed: 0,
      seed: input.seed,
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

    // Emit fitness-phase progress
    input.onProgress?.({
      kind: 'speedrun-progress',
      phase: 'fitness',
      iteration: ledger.completedIterations,
      maxIterations: input.maxIterations,
      metrics: null,
      convergenceReason: ledger.convergenceReason,
      elapsed: 0,
      seed: input.seed,
    });

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

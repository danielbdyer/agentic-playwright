/**
 * Speedrun core — the programmatic forward pass of the self-improving loop.
 *
 * This module extracts the speedrun pipeline into an Effect program that
 * accepts a PipelineConfig and returns a fitness report + scorecard comparison.
 * Scripts (speedrun.ts, sensitivity.ts, evolve.ts) are thin wrappers.
 *
 * The design is substrate-agnostic: the same pipeline runs identically
 * whether the scenarios come from synthetic generation, production ADO
 * snapshots, or a hybrid mix. The substrate is metadata on the experiment
 * record, not a branch in the pipeline logic.
 */

import { Effect } from 'effect';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { ProjectPaths } from './paths';
import { generateSyntheticScenarios } from './synthesis/scenario-generator';
import { runDogfoodLoop } from './dogfood';
import { buildFitnessReport, compareToScorecard, updateScorecard, type FitnessInputData, type ScorecardComparison } from './fitness';
import { loadWorkspaceCatalog } from './catalog';
import type { PipelineConfig, PipelineFitnessReport, PipelineScorecard, ProposalBundle } from '../domain/types';
import type { RunRecord } from '../domain/types/execution';

// ─── Speedrun Input/Output ───

export interface SpeedrunInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly count: number;
  readonly seed: string;
  readonly maxIterations: number;
}

export interface SpeedrunResult {
  readonly pipelineVersion: string;
  readonly fitnessReport: PipelineFitnessReport;
  readonly comparison: ScorecardComparison;
  readonly completedIterations: number;
  readonly converged: boolean;
}

// ─── Pure helpers ───

function getPipelineVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function loadScorecard(rootDir: string): PipelineScorecard | null {
  const scorecardPath = path.join(rootDir, '.tesseract', 'benchmarks', 'scorecard.json');
  if (!fs.existsSync(scorecardPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(scorecardPath, 'utf8')) as PipelineScorecard;
}

// ─── The forward pass as an Effect program ───

export function speedrunProgram(input: SpeedrunInput): Effect.Effect<SpeedrunResult, unknown, any> {
  return Effect.gen(function* () {
    // Phase 1: Generate synthetic scenarios
    const genResult = yield* generateSyntheticScenarios({
      paths: input.paths,
      count: input.count,
      seed: input.seed,
    });

    // Phase 2: Run dogfood flywheel
    const { ledger } = yield* runDogfoodLoop({
      paths: input.paths,
      maxIterations: input.maxIterations,
      convergenceThreshold: input.config.convergenceThreshold,
      interpreterMode: 'diagnostic',
      tag: 'synthetic',
      runbook: 'synthetic-dogfood',
    });

    // Phase 3: Collect run data
    const catalog = yield* loadWorkspaceCatalog({ paths: input.paths });
    const runRecords: RunRecord[] = catalog.runRecords.map((e) => e.artifact as unknown as RunRecord);
    const runSteps = runRecords.flatMap((record) =>
      record.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const proposalBundles: ProposalBundle[] = catalog.proposalBundles.map((e) => e.artifact);

    // Phase 4: Build fitness report
    const pipelineVersion = getPipelineVersion();
    const fitnessData: FitnessInputData = {
      pipelineVersion,
      ledger,
      runSteps,
      proposalBundles,
    };
    const fitnessReport = buildFitnessReport(fitnessData);

    // Phase 5: Compare to scorecard
    const rootDir = input.paths.rootDir;
    const existingScorecard = loadScorecard(rootDir);
    const comparison = compareToScorecard(fitnessReport, existingScorecard);

    return {
      pipelineVersion,
      fitnessReport,
      comparison,
      completedIterations: ledger.completedIterations,
      converged: ledger.converged,
    };
  });
}

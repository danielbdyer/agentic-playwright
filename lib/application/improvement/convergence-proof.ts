/**
 * Convergence proof harness — runs N independent trials from cold-start
 * and produces a statistical verdict on whether the recursive improvement
 * loop converges through its own proposal activation and knowledge accrual.
 *
 * Each trial:
 *   1. cleanSlateProgram()  — restore knowledge to git HEAD
 *   2. speedrunProgram()    — cold-start, unique seed
 *   3. Extract per-iteration metrics from improvementRun.iterations
 *   4. cleanSlateProgram()  — restore for next trial
 *
 * Cross-trial aggregation builds a ConvergenceVerdict with statistical
 * confidence. Scripts are thin CLI wrappers that call this program.
 */

import path from 'path';
import { Effect } from 'effect';
import type { ProjectPaths } from '../paths';
import { speedrunProgram, type SpeedrunResult } from './speedrun';
import { cleanSlateProgram } from './clean-slate';
import { FileSystem, VersionControl } from '../ports';
import type {
  KnowledgePosture,
  PipelineConfig,
  SpeedrunProgressEvent,
} from '../../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import {
  buildTrialResult,
  buildVerdict,
  type ConvergenceProofResult,
  type ConvergenceTrialResult,
} from '../../domain/types';
import type { BrowserPoolPort } from '../browser-pool';
import { runHyloEffect, type UnfoldStep } from '../../domain/algebra/hylomorphism';

// ─── Input ───

export interface ConvergenceProofInput {
  readonly paths: ProjectPaths;
  readonly config: PipelineConfig;
  readonly trialCount: number;
  readonly scenariosPerTrial: number;
  readonly maxIterations: number;
  readonly seeds: readonly string[];
  /** Must be 'cold-start' to isolate the loop's learning contribution. */
  readonly knowledgePosture: KnowledgePosture;
  readonly interpreterMode?: 'dry-run' | 'diagnostic' | 'playwright' | undefined;
  readonly baseUrl?: string | undefined;
  readonly browserPool?: BrowserPoolPort | undefined;
  readonly onTrialComplete?: ((trial: ConvergenceTrialResult, index: number) => void) | undefined;
  readonly onProgress?: ((event: SpeedrunProgressEvent) => void) | undefined;
}

// ─── Defaults ───

export function defaultConvergenceSeeds(count: number): readonly string[] {
  return Array.from({ length: count }, (_, i) => `proof-${i + 1}`);
}

// ─── Effect program ───

export function convergenceProofProgram(
  input: ConvergenceProofInput,
): Effect.Effect<ConvergenceProofResult, unknown, any> {
  return Effect.gen(function* () {
    const versionControl = yield* VersionControl;
    const pipelineVersion = yield* versionControl.currentRevision().pipe(
      Effect.catchAll(() => Effect.succeed('unknown')),
    );

    const seeds = input.seeds.length > 0
      ? input.seeds
      : defaultConvergenceSeeds(input.trialCount);

    // ─── Hylomorphism: unfold seeds → fold trial results ───
    // Each unfold step runs one trial (clean slate → speedrun → extract).
    // The fold step is pure array append. No intermediate list is allocated.
    // @see docs/design-calculus.md § Duality 1: Fold / Unfold (hylomorphism)

    interface TrialSeed {
      readonly remaining: readonly string[];
      readonly trialIndex: number;
    }

    const trials = yield* runHyloEffect<TrialSeed, ConvergenceTrialResult, readonly ConvergenceTrialResult[], unknown, any>(
      { remaining: [...seeds], trialIndex: 0 },
      [],
      (seed) => Effect.gen(function* () {
        if (seed.remaining.length === 0) {
          return { done: true } as UnfoldStep<TrialSeed, ConvergenceTrialResult>;
        }
        const [currentSeed, ...rest] = seed.remaining;

        // Clean slate before trial — wipe bound artifacts too to prevent
        // stale file races during parallel compilation in the next trial
        yield* cleanSlateProgram(input.paths.rootDir, input.paths);
        const fs = yield* FileSystem;
        yield* fs.removeDir(path.join(input.paths.rootDir, '.tesseract', 'bound'));

        const result: SpeedrunResult = yield* speedrunProgram({
          paths: input.paths,
          config: input.config,
          count: input.scenariosPerTrial,
          seed: currentSeed!,
          maxIterations: input.maxIterations,
          knowledgePosture: input.knowledgePosture,
          interpreterMode: input.interpreterMode ?? 'playwright',
          baseUrl: input.baseUrl,
          browserPool: input.browserPool,
          onProgress: input.onProgress,
        });

        const iterations = result.ledger.iterations;
        const trial = buildTrialResult(
          currentSeed!,
          iterations,
          result.converged,
          result.improvementRun.convergenceReason,
          result.fitnessReport,
        );

        input.onTrialComplete?.(trial, seed.trialIndex);

        // Clean slate after trial
        yield* cleanSlateProgram(input.paths.rootDir, input.paths);

        return {
          done: false,
          value: trial,
          next: { remaining: rest, trialIndex: seed.trialIndex + 1 },
        } as UnfoldStep<TrialSeed, ConvergenceTrialResult>;
      }),
      (acc, trial) => [...acc, trial],
    );
    const verdict = buildVerdict(trials);

    return {
      trials,
      verdict,
      runAt: new Date().toISOString(),
      pipelineVersion,
    };
  });
}

// ─── Report formatting ───

export function formatConvergenceReport(result: ConvergenceProofResult): string {
  const { verdict, trials } = result;
  const lines: string[] = [];

  lines.push(`# Convergence Proof — ${result.runAt}`);
  lines.push(`Pipeline: ${result.pipelineVersion} | Trials: ${trials.length} | Max iterations: ${trials[0]?.iterations.length ?? '?'}`);
  lines.push('');

  // Verdict
  lines.push('## Verdict');
  lines.push(verdict.converges ? '**THE LOOP CONVERGES**' : '**THE LOOP DOES NOT CONVERGE**');
  lines.push(`Learning contribution: ${verdict.learningContribution.toFixed(4)}/iter | Confidence: ${verdict.confidenceLevel}`);
  lines.push('');

  // Per-trial trajectories
  lines.push('## Per-Trial Trajectories');
  lines.push('| Trial | Seed | Iters | HitRate: Start → End | Delta | Proposals | Converged |');
  lines.push('|-------|------|-------|----------------------|-------|-----------|-----------|');
  for (let i = 0; i < trials.length; i++) {
    const t = trials[i]!;
    const start = (t.hitRateTrajectory[0] ?? 0).toFixed(4);
    const end = (t.hitRateTrajectory[t.hitRateTrajectory.length - 1] ?? 0).toFixed(4);
    const delta = t.hitRateDelta >= 0 ? `+${t.hitRateDelta.toFixed(4)}` : t.hitRateDelta.toFixed(4);
    const totalProposals = t.proposalTrajectory[t.proposalTrajectory.length - 1] ?? 0;
    lines.push(`| ${i + 1} | ${t.seed} | ${t.iterations.length} | ${start} → ${end} | ${delta} | ${totalProposals} | ${t.converged ? 'yes' : 'no'} |`);
  }
  lines.push('');

  // Iteration-level detail
  lines.push('## Iteration-Level Detail');
  lines.push('| Trial | Iter | HitRate | Generated | Activated | Unresolved | Total Steps |');
  lines.push('|-------|------|---------|-----------|-----------|------------|-------------|');
  for (let i = 0; i < trials.length; i++) {
    const t = trials[i]!;
    for (const it of t.iterations) {
      lines.push(`| ${i + 1} | ${it.iteration} | ${it.knowledgeHitRate.toFixed(4)} | ${it.proposalsGenerated} | ${it.proposalsActivated} | ${it.unresolvedStepCount} | ${it.totalStepCount} |`);
    }
  }
  lines.push('');

  // Bottleneck analysis
  lines.push('## Bottleneck Analysis');
  if (verdict.bottleneckSummary.length === 0) {
    lines.push('No consistent bottleneck detected across trials.');
  } else {
    for (const b of verdict.bottleneckSummary) {
      lines.push(`- ${b}`);
    }
  }
  lines.push('');

  // Statistical summary
  lines.push('## Statistical Summary');
  lines.push(`Mean hitRate delta: ${verdict.meanHitRateDelta.toFixed(4)} ± ${verdict.stddevHitRateDelta.toFixed(4)}`);
  lines.push(`Mean final hitRate: ${verdict.meanFinalHitRate.toFixed(4)}`);
  lines.push(`Median iterations to converge: ${verdict.medianIterationsToConverge ?? 'N/A'}`);
  lines.push(`Plateau level: ${verdict.plateauLevel !== null ? verdict.plateauLevel.toFixed(4) : 'N/A'}`);
  lines.push('');

  return lines.join('\n');
}

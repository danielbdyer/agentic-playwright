/**
 * Convergence proof harness — CLI wrapper.
 *
 * Runs N independent trials from cold-start, captures per-iteration metrics,
 * and produces a statistical verdict on whether the recursive improvement
 * loop converges through its own learning.
 *
 * Usage:
 *   npx tsx scripts/convergence-proof.ts [--trials N] [--count N]
 *        [--max-iterations N] [--seeds s1,s2,s3]
 *        [--mode playwright|diagnostic] [--base-url URL]
 *
 * Outputs:
 *   .tesseract/benchmarks/convergence-proof.json  — raw data
 *   .tesseract/benchmarks/convergence-proof.md    — human-readable report
 *
 * Exit code: 0 if verdict.converges, 1 otherwise.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import {
  convergenceProofProgram,
  defaultConvergenceSeeds,
  formatConvergenceReport,
  type ConvergenceProofInput,
} from '../lib/application/improvement/convergence-proof';
import type { ConvergenceTrialResult } from '../lib/domain/convergence/types';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { KnowledgePosture } from '../lib/domain/governance/workflow-types';
import type { SpeedrunProgressEvent } from '../lib/domain/improvement/types';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/attention/pipeline-config';
import { startFixtureServer, type FixtureServer } from '../lib/infrastructure/tooling/fixture-server';
import { createPlaywrightBrowserPool } from '../lib/infrastructure/runtime/playwright-browser-pool';
import type { BrowserPoolPort } from '../lib/application/runtime-support/browser-pool';

// ─── CLI argument parsing ───

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const trialCount = Number(argVal('--trials', '5'));
const count = Number(argVal('--count', '50'));
const maxIterations = Number(argVal('--max-iterations', '5'));
const multiSeeds = args.includes('--seeds') ? argVal('--seeds', '').split(',').filter(Boolean) : [];
const seeds = multiSeeds.length > 0 ? multiSeeds : [...defaultConvergenceSeeds(trialCount)];
const rawMode = args.includes('--mode') ? argVal('--mode', 'playwright') : 'playwright';
const effectiveMode = rawMode as 'dry-run' | 'diagnostic' | 'playwright';
const explicitBaseUrl = args.includes('--base-url') ? argVal('--base-url', '') : '';

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));

// ─── Progress callback (JSONL sidecar + stderr) ───

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function createProgressCallback(progressPath: string): (event: SpeedrunProgressEvent) => void {
  return (event: SpeedrunProgressEvent): void => {
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.appendFileSync(progressPath, JSON.stringify(event) + '\n');

    const phaseLabel = event.phase === 'iterate' && event.metrics
      ? `[iter ${event.iteration}/${event.maxIterations}]`
      : `[${event.phase}]`;

    const metricsLabel = event.metrics
      ? ` hitRate=${(event.metrics.knowledgeHitRate * 100).toFixed(1)}% proposals=${event.metrics.proposalsActivated}`
      : '';

    const convergenceLabel = event.convergenceReason
      ? ` convergence=${event.convergenceReason}`
      : '';

    const durationLabel = event.phaseDurationMs !== null && event.phaseDurationMs !== undefined
      ? ` phase=${formatElapsed(event.phaseDurationMs)}`
      : '';

    process.stderr.write(
      `${phaseLabel}${metricsLabel}${convergenceLabel}${durationLabel} elapsed=${formatElapsed(event.elapsed)}\n`,
    );
  };
}

// ─── Trial completion callback ───

function onTrialComplete(trial: ConvergenceTrialResult, index: number): void {
  const start = (trial.hitRateTrajectory[0] ?? 0).toFixed(4);
  const end = (trial.hitRateTrajectory[trial.hitRateTrajectory.length - 1] ?? 0).toFixed(4);
  const delta = trial.hitRateDelta >= 0 ? `+${trial.hitRateDelta.toFixed(4)}` : trial.hitRateDelta.toFixed(4);
  const totalProposals = trial.proposalTrajectory[trial.proposalTrajectory.length - 1] ?? 0;

  console.log(`\n--- Trial ${index + 1} complete (seed: ${trial.seed}) ---`);
  console.log(`  Iterations: ${trial.iterations.length} | HitRate: ${start} → ${end} (${delta}) | Proposals: ${totalProposals} | Converged: ${trial.converged}`);
}

// ─── Fixture server + browser pool lifecycle ───

interface PlaywrightEnvironment {
  readonly baseUrl: string | undefined;
  readonly browserPool: BrowserPoolPort | undefined;
}

async function withPlaywrightEnvironment<T>(fn: (env: PlaywrightEnvironment) => Promise<T>): Promise<T> {
  if (effectiveMode === 'diagnostic') return fn({ baseUrl: undefined, browserPool: undefined });

  const resolvedBaseUrl = explicitBaseUrl || undefined;
  let server: FixtureServer | null = null;
  let pool: BrowserPoolPort | null = null;

  try {
    if (!resolvedBaseUrl) {
      console.log('Starting fixture server...');
      server = await startFixtureServer({ rootDir });
      console.log(`Fixture server ready at ${server.baseUrl}`);
    }

    const baseUrl = resolvedBaseUrl ?? server?.baseUrl;

    console.log('Creating browser pool...');
    pool = await createPlaywrightBrowserPool({ config: { poolSize: 4, preWarm: true, maxPageAgeMs: 300_000 } });
    console.log('Browser pool ready.');

    return await fn({ baseUrl, browserPool: pool });
  } finally {
    if (pool) {
      const stats = pool.stats;
      console.log(`Browser pool stats: acquired=${stats.totalAcquired} released=${stats.totalReleased}`);
      await pool.close();
    }
    if (server) {
      await server.stop();
      console.log('Fixture server stopped.');
    }
  }
}

// ─── Main ───

async function run(): Promise<void> {
  console.log('=== Convergence Proof Harness ===');
  console.log(`Trials: ${trialCount} | Scenarios/trial: ${count} | Max iterations: ${maxIterations}`);
  console.log(`Mode: ${effectiveMode} | Seeds: ${seeds.join(', ')}`);
  console.log(`Knowledge posture: cold-start (forced for convergence isolation)`);
  console.log('');

  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'convergence-proof-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  const serviceOptions = {
    posture: { interpreterMode: effectiveMode, writeMode: 'persist' as const, executionProfile: 'dogfood' as const },
    suiteRoot: paths.suiteRoot,
    pipelineConfig: DEFAULT_PIPELINE_CONFIG,
  };

  const result = await withPlaywrightEnvironment((env) => runWithLocalServices(
    convergenceProofProgram({
      paths,
      config: DEFAULT_PIPELINE_CONFIG,
      trialCount,
      scenariosPerTrial: count,
      maxIterations,
      seeds,
      knowledgePosture: 'cold-start' as KnowledgePosture,
      interpreterMode: effectiveMode,
      baseUrl: env.baseUrl,
      browserPool: env.browserPool,
      onTrialComplete,
      onProgress,
    }),
    rootDir,
    {
      ...serviceOptions,
      browserPool: env.browserPool,
    },
  ));

  // Write outputs
  const benchmarkDir = path.join(rootDir, '.tesseract', 'benchmarks');
  fs.mkdirSync(benchmarkDir, { recursive: true });

  const jsonPath = path.join(benchmarkDir, 'convergence-proof.json');
  fs.writeFileSync(jsonPath, JSON.stringify(result, null, 2));
  console.log(`\nRaw data written to ${jsonPath}`);

  const mdPath = path.join(benchmarkDir, 'convergence-proof.md');
  const report = formatConvergenceReport(result);
  fs.writeFileSync(mdPath, report);
  console.log(`Report written to ${mdPath}`);

  // Print verdict
  console.log('\n' + '='.repeat(60));
  console.log(result.verdict.converges
    ? 'VERDICT: THE LOOP CONVERGES'
    : 'VERDICT: THE LOOP DOES NOT CONVERGE');
  console.log(`Learning contribution: ${result.verdict.learningContribution.toFixed(4)}/iter`);
  console.log(`Mean hitRate delta: ${result.verdict.meanHitRateDelta.toFixed(4)} ± ${result.verdict.stddevHitRateDelta.toFixed(4)}`);
  console.log(`Confidence: ${result.verdict.confidenceLevel}`);
  console.log('='.repeat(60));

  // Exit code reflects verdict
  if (!result.verdict.converges) {
    process.exit(1);
  }
}

run().catch((error) => {
  console.error('Convergence proof failed:', error);
  process.exit(1);
});

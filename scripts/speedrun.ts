/**
 * Self-improving pipeline speedrun — CLI wrapper.
 *
 * Clean-slate → generate → flywheel → measure → compare → report.
 *
 * Usage: npx tsx scripts/speedrun.ts [--count N] [--seed S] [--seeds S1,S2,S3]
 *        [--max-iterations N] [--posture cold-start|warm-start|production]
 *
 * Multi-seed mode (--seeds): runs the full speedrun for each seed and averages
 * fitness metrics. A pipeline change only "wins" if it improves average fitness
 * across all seeds, preventing overfitting to a single phrasing distribution.
 *
 * All orchestration lives in lib/application/speedrun.ts. This script is a thin
 * CLI wrapper: parse args → build input → call Effect program → print results.
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { multiSeedSpeedrun, type MultiSeedResult } from '../lib/application/speedrun';
import { resolveKnowledgePosture } from '../lib/application/knowledge-posture';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { KnowledgePosture, PipelineConfig, PipelineFitnessReport, SpeedrunProgressEvent } from '../lib/domain/types';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/types';

// ─── CLI argument parsing ───

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const count = Number(argVal('--count', '50'));
const singleSeed = argVal('--seed', 'speedrun-v1');
const multiSeeds = args.includes('--seeds') ? argVal('--seeds', '').split(',').filter(Boolean) : [];
const seeds = multiSeeds.length > 0 ? multiSeeds : [singleSeed];
const maxIterations = Number(argVal('--max-iterations', '5'));
const configPath = argVal('--config', '');
const experimentTag = argVal('--tag', '');
const substrate = argVal('--substrate', 'synthetic') as 'synthetic' | 'production' | 'hybrid';
const explicitPosture = args.includes('--posture') ? argVal('--posture', '') as KnowledgePosture : undefined;

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const knowledgePosture = resolveKnowledgePosture(paths.postureConfigPath, explicitPosture);

function loadPipelineConfig(): PipelineConfig {
  if (!configPath) return DEFAULT_PIPELINE_CONFIG;
  const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>;
  return mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, overrides);
}

// ─── Clean-slate preparation (infrastructure concern — raw fs + git) ───

function cleanSlate(): void {
  const dirsToWipe = [
    path.join(paths.scenariosDir, 'synthetic'),
    path.join(rootDir, 'generated', 'synthetic'),
    path.join(rootDir, '.tesseract', 'evidence', 'runs'),
    path.join(rootDir, '.tesseract', 'learning'),
    path.join(rootDir, '.tesseract', 'runs'),
  ];
  for (const dir of dirsToWipe) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  try {
    execSync('git checkout HEAD -- knowledge/', { cwd: rootDir, stdio: 'pipe' });
  } catch {
    // knowledge/ may not have changes
  }
}

// ─── Progress callback (infrastructure concern — JSONL sidecar + stderr) ───

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function createProgressCallback(progressPath: string): (event: SpeedrunProgressEvent) => void {
  fs.mkdirSync(path.dirname(progressPath), { recursive: true });

  return (event: SpeedrunProgressEvent): void => {
    fs.appendFileSync(progressPath, JSON.stringify(event) + '\n');

    const phaseLabel = event.phase === 'iterate' && event.metrics
      ? `[iter ${event.iteration}/${event.maxIterations}]`
      : `[${event.phase}]`;

    const metricsLabel = event.metrics
      ? ` hitRate=${(event.metrics.knowledgeHitRate * 100).toFixed(1)}% proposals=${event.metrics.proposalsActivated} steps=${event.metrics.totalSteps} unresolved=${event.metrics.unresolvedSteps}`
      : '';

    const convergenceLabel = event.convergenceReason
      ? ` convergence=${event.convergenceReason}`
      : '';

    process.stderr.write(
      `${phaseLabel}${metricsLabel}${convergenceLabel} elapsed=${formatElapsed(event.elapsed)}\n`,
    );
  };
}

// ─── Display helpers ───

function printMetrics(report: PipelineFitnessReport): void {
  console.log('\n=== Pipeline Fitness Metrics ===\n');
  console.log(`  Knowledge hit rate:     ${report.metrics.knowledgeHitRate}`);
  console.log(`  Translation precision:  ${report.metrics.translationPrecision}`);
  console.log(`  Translation recall:     ${report.metrics.translationRecall}`);
  console.log(`  Convergence velocity:   ${report.metrics.convergenceVelocity} iterations`);
  console.log(`  Proposal yield:         ${report.metrics.proposalYield}`);
  console.log(`  Degraded locator rate:  ${report.metrics.degradedLocatorRate}`);
  console.log(`  Recovery success rate:  ${report.metrics.recoverySuccessRate}`);

  console.log('\n  Resolution by rung:');
  for (const rung of report.metrics.resolutionByRung) {
    if (rung.wins > 0) {
      console.log(`    ${rung.rung}: ${rung.wins} wins (${(rung.rate * 100).toFixed(1)}%)`);
    }
  }

  if (report.failureModes.length > 0) {
    console.log('\n=== Top Pipeline Improvement Targets ===\n');
    for (const mode of report.failureModes.slice(0, 5)) {
      console.log(`  ${mode.class} (${mode.count} occurrences, ${mode.affectedSteps} steps)`);
      console.log(`    Target: ${mode.improvementTarget.kind} — ${mode.improvementTarget.detail}`);
    }
  }
}

function printResult(result: MultiSeedResult): void {
  if (result.seedResults.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Averaged Metrics (${result.seedResults.length} seeds) ===`);
    console.log(`${'='.repeat(60)}`);
  }

  printMetrics(result.fitnessReport);

  console.log(`\n=== Scorecard Comparison ===\n`);
  console.log(result.comparison.summary);
  console.log(`  Knowledge hit rate delta: ${result.comparison.knowledgeHitRateDelta > 0 ? '+' : ''}${result.comparison.knowledgeHitRateDelta}`);
  console.log(`  Translation precision delta: ${result.comparison.translationPrecisionDelta > 0 ? '+' : ''}${result.comparison.translationPrecisionDelta}`);

  console.log(result.scorecardUpdated
    ? '\nScorecard UPDATED — new high-water-mark set.'
    : '\nScorecard unchanged — did not beat the mark.');

  console.log('\nSpeedrun complete.');
}

// ─── Main ───

async function main(): Promise<void> {
  const pipelineConfig = loadPipelineConfig();
  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  console.log(`Pipeline version: (resolved at runtime)`);
  console.log(`Knowledge posture: ${knowledgePosture}`);
  console.log(`Seeds: ${seeds.join(', ')}`);
  console.log(`Count: ${count}, Max iterations: ${maxIterations}`);

  const result = await runWithLocalServices(
    multiSeedSpeedrun({
      paths,
      config: pipelineConfig,
      seeds,
      count,
      maxIterations,
      substrate,
      tag: experimentTag || undefined,
      knowledgePosture,
      onProgress,
      onCleanSlate: cleanSlate,
    }),
    rootDir,
    {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
      pipelineConfig,
    },
  );

  printResult(result);
}

main().catch((error) => {
  console.error('Speedrun failed:', error);
  process.exit(1);
});

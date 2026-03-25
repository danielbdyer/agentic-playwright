/**
 * Self-improving pipeline speedrun.
 *
 * Clean-slate → generate → flywheel → measure → compare → report.
 *
 * Usage: npx tsx scripts/speedrun.ts [--count N] [--seed S] [--seeds S1,S2,S3] [--max-iterations N] [--posture cold-start|warm-start|production]
 *
 * Multi-seed mode (--seeds): runs the full speedrun for each seed and averages
 * fitness metrics. A pipeline change only "wins" if it improves average fitness
 * across all seeds, preventing overfitting to a single phrasing distribution.
 */

import { Effect } from 'effect';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { generateSyntheticScenarios } from '../lib/application/synthesis/scenario-generator';
import { runDogfoodLoop } from '../lib/application/dogfood';
import { buildFitnessReport, compareToScorecard, updateScorecard, type FitnessInputData } from '../lib/application/fitness';
import { buildImprovementRun, recordImprovementRun } from '../lib/application/improvement';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { recordExperiment } from '../lib/application/experiment-registry';
import { runWithLocalServices } from '../lib/composition/local-services';
import { resolveKnowledgePosture } from '../lib/application/knowledge-posture';
import type { ExperimentRecord, KnowledgePosture, PipelineConfig, PipelineScorecard, ProposalBundle, SpeedrunProgressEvent, SubstrateContext } from '../lib/domain/types';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/types';
import type { RunRecord } from '../lib/domain/types/execution';

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

function loadPipelineConfig(): PipelineConfig {
  if (!configPath) {
    return DEFAULT_PIPELINE_CONFIG;
  }
  const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>;
  return mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, overrides);
}

const pipelineConfig = loadPipelineConfig();

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const knowledgePosture = resolveKnowledgePosture(paths.postureConfigPath, explicitPosture);

function getPipelineVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function cleanSlate(): void {
  // Wipe synthetic scenarios
  const syntheticDir = path.join(paths.scenariosDir, 'synthetic');
  if (fs.existsSync(syntheticDir)) {
    fs.rmSync(syntheticDir, { recursive: true, force: true });
  }

  // Wipe generated synthetic output
  const generatedDir = path.join(rootDir, 'generated', 'synthetic');
  if (fs.existsSync(generatedDir)) {
    fs.rmSync(generatedDir, { recursive: true, force: true });
  }

  // Wipe ephemeral evidence
  const evidenceDir = path.join(rootDir, '.tesseract', 'evidence', 'runs');
  if (fs.existsSync(evidenceDir)) {
    fs.rmSync(evidenceDir, { recursive: true, force: true });
  }

  // Wipe learning artifacts
  const learningDir = path.join(rootDir, '.tesseract', 'learning');
  if (fs.existsSync(learningDir)) {
    fs.rmSync(learningDir, { recursive: true, force: true });
  }

  // Wipe runs
  const runsDir = path.join(rootDir, '.tesseract', 'runs');
  if (fs.existsSync(runsDir)) {
    fs.rmSync(runsDir, { recursive: true, force: true });
  }

  // Restore knowledge files to git HEAD state
  try {
    execSync('git checkout HEAD -- knowledge/', { cwd: rootDir, stdio: 'pipe' });
  } catch {
    // knowledge/ may not have changes, that's fine
  }

  console.log('Clean slate: all synthetic and ephemeral artifacts wiped.');
}

function loadScorecard(): PipelineScorecard | null {
  const scorecardPath = path.join(rootDir, '.tesseract', 'benchmarks', 'scorecard.json');
  if (!fs.existsSync(scorecardPath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(scorecardPath, 'utf8')) as PipelineScorecard;
}

function saveScorecard(scorecard: PipelineScorecard): void {
  const dir = path.join(rootDir, '.tesseract', 'benchmarks');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'scorecard.json'),
    JSON.stringify(scorecard, null, 2) + '\n',
  );
}

function saveFitnessReport(report: ReturnType<typeof buildFitnessReport>): string {
  const dir = path.join(rootDir, '.tesseract', 'benchmarks', 'runs');
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${timestamp}.fitness.json`);
  fs.writeFileSync(filePath, JSON.stringify(report, null, 2) + '\n');
  return filePath;
}

function generateAdoFixtures(): void {
  try {
    execSync('npx tsx scripts/generate-ado-sync.ts', { cwd: rootDir, stdio: 'pipe' });
    console.log('ADO fixtures generated for synthetic scenarios.');
  } catch (err) {
    console.warn('Warning: ADO fixture generation failed, continuing anyway.');
  }
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function createProgressCallback(progressPath: string): (event: SpeedrunProgressEvent) => void {
  // Ensure the directory exists before first write
  const dir = path.dirname(progressPath);
  fs.mkdirSync(dir, { recursive: true });

  return (event: SpeedrunProgressEvent): void => {
    // Append as JSONL for machine consumption
    fs.appendFileSync(progressPath, JSON.stringify(event) + '\n');

    // Print human-readable summary to stderr
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

function createProgram(currentSeed: string, onProgress: (event: SpeedrunProgressEvent) => void) {
  return Effect.gen(function* () {
    // Step 1: Generate synthetic scenarios
    console.log(`\n=== Generating ${count} synthetic scenarios (seed: ${currentSeed}) ===\n`);
    const genResult = yield* generateSyntheticScenarios({ paths, count, seed: currentSeed });
    console.log(`Generated ${genResult.scenariosGenerated} scenarios across ${genResult.screens.length} screens`);

    // Step 1b: Generate ADO fixtures for new scenarios
    generateAdoFixtures();

    // Step 2: Run dogfood flywheel
    console.log(`\n=== Running dogfood flywheel (max ${maxIterations} iterations, posture: ${knowledgePosture}) ===\n`);
    const { ledger } = yield* runDogfoodLoop({
      paths,
      maxIterations,
      convergenceThreshold: pipelineConfig.convergenceThreshold,
      interpreterMode: 'diagnostic',
      tag: 'synthetic',
      runbook: 'synthetic-dogfood',
      knowledgePosture,
      onProgress,
      seed: currentSeed,
    });

    console.log(`Flywheel complete: ${ledger.completedIterations} iterations, converged=${ledger.converged} (${ledger.convergenceReason})`);
    for (const iter of ledger.iterations) {
      console.log(`  Iteration ${iter.iteration}: hitRate=${iter.knowledgeHitRate}, proposals=${iter.proposalsActivated}, steps=${iter.totalStepCount}`);
    }

    // Step 3: Collect run data for fitness report (scoped to post-run artifacts only)
    const catalog = yield* loadWorkspaceCatalog({ paths, knowledgePosture: 'warm-start', scope: 'post-run' });
    const runRecords: RunRecord[] = catalog.runRecords.map((e) => e.artifact as unknown as RunRecord);
    const runSteps = runRecords.flatMap((record) =>
      record.steps.map((step) => ({
        interpretation: step.interpretation,
        execution: step.execution,
      })),
    );
    const proposalBundles: ProposalBundle[] = catalog.proposalBundles.map((e) => e.artifact);

    return { ledger, runSteps, proposalBundles };
  });
}

interface SeedRunResult {
  readonly report: ReturnType<typeof buildFitnessReport>;
  readonly ledger: FitnessInputData['ledger'];
}

async function runSingleSeed(currentSeed: string, pipelineVersion: string): Promise<SeedRunResult> {
  // Step 0: Clean slate
  cleanSlate();

  // Set up progress tracking
  const progressPath = path.join(rootDir, '.tesseract', 'runs', `speedrun-progress-${currentSeed}.jsonl`);
  const onProgress = createProgressCallback(progressPath);

  // Steps 1-3: Generate + flywheel + collect data
  const { ledger, runSteps, proposalBundles } = await runWithLocalServices(createProgram(currentSeed, onProgress), rootDir, {
    posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
    suiteRoot: paths.suiteRoot,
    pipelineConfig,
  });

  // Step 4: Build fitness report
  console.log('\n=== Building pipeline fitness report ===\n');
  const fitnessData: FitnessInputData = {
    pipelineVersion,
    ledger,
    runSteps,
    proposalBundles,
  };
  const report = buildFitnessReport(fitnessData);
  const reportPath = saveFitnessReport(report);
  console.log(`Fitness report saved: ${reportPath}`);

  printMetrics(report);

  // Restore knowledge to git HEAD (clean up activated proposals)
  cleanSlate();

  return { report, ledger };
}

function printMetrics(report: ReturnType<typeof buildFitnessReport>): void {
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

function averageReports(reports: readonly ReturnType<typeof buildFitnessReport>[]): ReturnType<typeof buildFitnessReport> {
  const n = reports.length;
  const avg = (fn: (r: ReturnType<typeof buildFitnessReport>) => number): number =>
    Number((reports.reduce((sum, r) => sum + fn(r), 0) / n).toFixed(6));

  const base = reports[0]!;
  return {
    ...base,
    metrics: {
      ...base.metrics,
      knowledgeHitRate: avg((r) => r.metrics.knowledgeHitRate),
      translationPrecision: avg((r) => r.metrics.translationPrecision),
      translationRecall: avg((r) => r.metrics.translationRecall),
      convergenceVelocity: Math.round(avg((r) => r.metrics.convergenceVelocity)),
      proposalYield: avg((r) => r.metrics.proposalYield),
      degradedLocatorRate: avg((r) => r.metrics.degradedLocatorRate),
      recoverySuccessRate: avg((r) => r.metrics.recoverySuccessRate),
    },
    // Merge failure modes from all reports, deduplicated by class
    failureModes: mergeFailureModes(reports.flatMap((r) => r.failureModes)),
  };
}

function mergeFailureModes(
  modes: readonly ReturnType<typeof buildFitnessReport>['failureModes'][number][],
): ReturnType<typeof buildFitnessReport>['failureModes'] {
  const byClass = new Map<string, ReturnType<typeof buildFitnessReport>['failureModes'][number]>();
  for (const mode of modes) {
    const existing = byClass.get(mode.class);
    if (existing) {
      byClass.set(mode.class, {
        ...existing,
        count: existing.count + mode.count,
        affectedSteps: existing.affectedSteps + mode.affectedSteps,
      });
    } else {
      byClass.set(mode.class, { ...mode });
    }
  }
  return [...byClass.values()].sort((a, b) => b.count - a.count);
}

async function main(): Promise<void> {
  const pipelineVersion = getPipelineVersion();
  console.log(`Pipeline version: ${pipelineVersion}`);
  console.log(`Knowledge posture: ${knowledgePosture}`);
  console.log(`Seeds: ${seeds.join(', ')}`);

  // Run for each seed
  const results: SeedRunResult[] = [];
  for (const currentSeed of seeds) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Speedrun with seed: ${currentSeed} ===`);
    console.log(`${'='.repeat(60)}`);
    const result = await runSingleSeed(currentSeed, pipelineVersion);
    results.push(result);
  }

  // Use averaged report for multi-seed, or single report
  const reports = results.map((r) => r.report);
  const report = reports.length > 1
    ? averageReports(reports)
    : reports[0]!;
  const primaryLedger = results[0]!.ledger;

  if (reports.length > 1) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== Averaged Metrics (${reports.length} seeds) ===`);
    console.log(`${'='.repeat(60)}`);
    printMetrics(report);
  }

  // Step 5: Compare to scorecard
  const existingScorecard = loadScorecard();
  const comparison = compareToScorecard(report, existingScorecard);
  console.log(`\n=== Scorecard Comparison ===\n`);
  console.log(comparison.summary);
  console.log(`  Knowledge hit rate delta: ${comparison.knowledgeHitRateDelta > 0 ? '+' : ''}${comparison.knowledgeHitRateDelta}`);
  console.log(`  Translation precision delta: ${comparison.translationPrecisionDelta > 0 ? '+' : ''}${comparison.translationPrecisionDelta}`);

  // Step 6: Update scorecard if improved
  if (comparison.improved) {
    const updatedScorecard = updateScorecard(report, existingScorecard, comparison);
    saveScorecard(updatedScorecard);
    console.log('\nScorecard UPDATED — new high-water-mark set.');
  } else {
    console.log('\nScorecard unchanged — did not beat the mark.');
  }

  // Step 6b: Record experiment
  const primarySeed = seeds[0]!;
  const substrateContext: SubstrateContext = {
    substrate,
    seed: seeds.length > 1 ? seeds.join(',') : primarySeed,
    scenarioCount: count,
    screenCount: report.metrics.resolutionByRung.length,
    phrasingTemplateVersion: 'v2',
  };
  const configDelta: Partial<PipelineConfig> = configPath
    ? JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>
    : {};
  const improvementRun = buildImprovementRun({
    paths,
    pipelineVersion,
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta,
    substrateContext,
    fitnessReport: report,
    scorecardComparison: {
      improved: comparison.improved,
      knowledgeHitRateDelta: comparison.knowledgeHitRateDelta,
      translationPrecisionDelta: comparison.translationPrecisionDelta,
      convergenceVelocityDelta: comparison.convergenceVelocityDelta,
    },
    scorecardSummary: comparison.summary,
    ledger: primaryLedger,
    parentExperimentId: null,
    tags: experimentTag ? [experimentTag] : [],
  });
  await runWithLocalServices(
    recordImprovementRun({ paths, run: improvementRun }),
    rootDir,
    {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
      pipelineConfig,
    },
  );
  const experimentRecord: ExperimentRecord = {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    runAt: report.runAt,
    pipelineVersion,
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta,
    substrateContext,
    fitnessReport: report,
    scorecardComparison: {
      improved: comparison.improved,
      knowledgeHitRateDelta: comparison.knowledgeHitRateDelta,
      translationPrecisionDelta: comparison.translationPrecisionDelta,
      convergenceVelocityDelta: comparison.convergenceVelocityDelta,
    },
    accepted: comparison.improved,
    tags: experimentTag ? [experimentTag] : [],
    parentExperimentId: null,
    improvementRunId: improvementRun.improvementRunId,
    improvementRun,
  };
  await runWithLocalServices(
    recordExperiment(paths, experimentRecord),
    rootDir,
    {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
      pipelineConfig,
    },
  );
  console.log(`Experiment recorded: ${experimentRecord.id}`);

  console.log('\nSpeedrun complete. Synthetic artifacts cleaned up.');
}

main().catch((error) => {
  console.error('Speedrun failed:', error);
  process.exit(1);
});

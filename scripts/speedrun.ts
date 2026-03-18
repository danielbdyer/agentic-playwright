/**
 * Self-improving pipeline speedrun.
 *
 * Clean-slate → generate → flywheel → measure → compare → report.
 *
 * Usage: npx tsx scripts/speedrun.ts [--count N] [--seed S] [--max-iterations N]
 */

import { Effect } from 'effect';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { generateSyntheticScenarios } from '../lib/application/synthesis/scenario-generator';
import { runDogfoodLoop } from '../lib/application/dogfood';
import { buildFitnessReport, compareToScorecard, updateScorecard, type FitnessInputData } from '../lib/application/fitness';
import { loadWorkspaceCatalog } from '../lib/application/catalog';
import { recordExperiment } from '../lib/application/experiment-registry';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { ExperimentRecord, PipelineConfig, PipelineScorecard, ProposalBundle, SubstrateContext } from '../lib/domain/types';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/types';
import type { RunRecord } from '../lib/domain/types/execution';

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const count = Number(argVal('--count', '50'));
const seed = argVal('--seed', 'speedrun-v1');
const maxIterations = Number(argVal('--max-iterations', '5'));
const configPath = argVal('--config', '');
const experimentTag = argVal('--tag', '');
const substrate = argVal('--substrate', 'synthetic') as 'synthetic' | 'production' | 'hybrid';

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

function getPipelineVersion(): string {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function cleanSlate(): void {
  // Wipe synthetic scenarios
  const syntheticDir = path.join(rootDir, 'scenarios', 'synthetic');
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

const program = Effect.gen(function* () {
  // Step 1: Generate synthetic scenarios
  console.log(`\n=== Generating ${count} synthetic scenarios (seed: ${seed}) ===\n`);
  const genResult = yield* generateSyntheticScenarios({ paths, count, seed });
  console.log(`Generated ${genResult.scenariosGenerated} scenarios across ${genResult.screens.length} screens`);

  // Step 2: Run dogfood flywheel
  console.log(`\n=== Running dogfood flywheel (max ${maxIterations} iterations) ===\n`);
  const { ledger } = yield* runDogfoodLoop({
    paths,
    maxIterations,
    convergenceThreshold: pipelineConfig.convergenceThreshold,
    interpreterMode: 'diagnostic',
    tag: 'synthetic',
    runbook: 'synthetic-dogfood',
  });

  console.log(`Flywheel complete: ${ledger.completedIterations} iterations, converged=${ledger.converged} (${ledger.convergenceReason})`);
  for (const iter of ledger.iterations) {
    console.log(`  Iteration ${iter.iteration}: hitRate=${iter.knowledgeHitRate}, proposals=${iter.proposalsActivated}, steps=${iter.totalStepCount}`);
  }

  // Step 3: Collect run data for fitness report
  const catalog = yield* loadWorkspaceCatalog({ paths });
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

async function main(): Promise<void> {
  const pipelineVersion = getPipelineVersion();
  console.log(`Pipeline version: ${pipelineVersion}`);

  // Step 0: Clean slate
  cleanSlate();

  // Steps 1-3: Generate + flywheel + collect data
  const { ledger, runSteps, proposalBundles } = await runWithLocalServices(program, rootDir, {
    posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
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
  const substrateContext: SubstrateContext = {
    substrate,
    seed,
    scenarioCount: count,
    screenCount: report.metrics.resolutionByRung.length,
    phrasingTemplateVersion: 'v1',
  };
  const configDelta: Partial<PipelineConfig> = configPath
    ? JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>
    : {};
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
  };
  recordExperiment(rootDir, experimentRecord);
  console.log(`Experiment recorded: ${experimentRecord.id}`);

  // Step 7: Report failure modes
  if (report.failureModes.length > 0) {
    console.log('\n=== Top Pipeline Improvement Targets ===\n');
    for (const mode of report.failureModes.slice(0, 5)) {
      console.log(`  ${mode.class} (${mode.count} occurrences, ${mode.affectedSteps} steps)`);
      console.log(`    Target: ${mode.improvementTarget.kind} — ${mode.improvementTarget.detail}`);
    }
  }

  // Step 8: Summary metrics
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

  // Restore knowledge to git HEAD (clean up activated proposals)
  cleanSlate();
  console.log('\nSpeedrun complete. Synthetic artifacts cleaned up.');
}

main().catch((error) => {
  console.error('Speedrun failed:', error);
  process.exit(1);
});

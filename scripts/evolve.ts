/**
 * Automatic Knob Search — the self-improving evolution loop.
 *
 * 1. Run baseline speedrun
 * 2. Read top failure mode from fitness report
 * 3. Map to implicated parameters
 * 4. Generate candidate configs
 * 5. Run speedrun for each candidate
 * 6. Accept the best candidate that beats the Pareto frontier
 * 7. Record experiment in registry
 * 8. Repeat (up to --max-epochs)
 *
 * Usage: npx tsx scripts/evolve.ts [--max-epochs N] [--seed S] [--count N] [--substrate S]
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { speedrunProgram, type SpeedrunInput, type SpeedrunResult } from '../lib/application/speedrun';
import { mappingForFailureClass, generateCandidates, type CandidateConfig } from '../lib/application/knob-search';
import { updateScorecard } from '../lib/application/fitness';
import { recordExperiment } from '../lib/application/experiment-registry';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { ExperimentRecord, PipelineConfig, PipelineScorecard, SubstrateContext } from '../lib/domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/types';

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const maxEpochs = Number(argVal('--max-epochs', '3'));
const seed = argVal('--seed', 'evolve-v1');
const count = Number(argVal('--count', '30'));
const maxIterations = Number(argVal('--max-iterations', '3'));
const substrate = argVal('--substrate', 'synthetic') as 'synthetic' | 'production' | 'hybrid';

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));

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

async function runSpeedrunWithConfig(config: PipelineConfig): Promise<SpeedrunResult> {
  const input: SpeedrunInput = { paths, config, count, seed, maxIterations, substrate };
  return runWithLocalServices(speedrunProgram(input), rootDir, {
    posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
    suiteRoot: paths.suiteRoot,
    pipelineConfig: config,
  });
}

function buildSubstrateContext(): SubstrateContext {
  return {
    substrate,
    seed,
    scenarioCount: count,
    screenCount: 0,
    phrasingTemplateVersion: 'v1',
  };
}

function buildExperimentRecord(
  result: SpeedrunResult,
  config: PipelineConfig,
  delta: Partial<PipelineConfig>,
  parentId: string | null,
  tag: string,
): ExperimentRecord {
  return {
    id: new Date().toISOString().replace(/[:.]/g, '-'),
    runAt: result.fitnessReport.runAt,
    pipelineVersion: result.pipelineVersion,
    baselineConfig: DEFAULT_PIPELINE_CONFIG,
    configDelta: delta,
    substrateContext: buildSubstrateContext(),
    fitnessReport: result.fitnessReport,
    scorecardComparison: {
      improved: result.comparison.improved,
      knowledgeHitRateDelta: result.comparison.knowledgeHitRateDelta,
      translationPrecisionDelta: result.comparison.translationPrecisionDelta,
      convergenceVelocityDelta: result.comparison.convergenceVelocityDelta,
    },
    accepted: result.comparison.improved,
    tags: [tag, `epoch-${tag}`],
    parentExperimentId: parentId,
    improvementRunId: result.improvementRun.improvementRunId,
    improvementRun: result.improvementRun,
  };
}

async function main(): Promise<void> {
  console.log(`\n=== Automatic Knob Search ===`);
  console.log(`  Max epochs: ${maxEpochs}, Seed: ${seed}, Count: ${count}\n`);

  let currentConfig = DEFAULT_PIPELINE_CONFIG;
  let lastExperimentId: string | null = null;

  for (let epoch = 1; epoch <= maxEpochs; epoch++) {
    console.log(`\n--- Epoch ${epoch}/${maxEpochs} ---\n`);

    // Step 1: Run baseline with current config
    console.log('Running baseline...');
    const baseline = await runSpeedrunWithConfig(currentConfig);
    const baseRecord = buildExperimentRecord(baseline, currentConfig, {}, lastExperimentId, `evolve-epoch-${epoch}-baseline`);
    await runWithLocalServices(recordExperiment(paths, baseRecord), rootDir, {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
      pipelineConfig: currentConfig,
    });
    lastExperimentId = baseRecord.id;

    console.log(`  Hit rate: ${baseline.fitnessReport.metrics.knowledgeHitRate}`);
    console.log(`  Failure modes: ${baseline.fitnessReport.failureModes.length}`);

    // Step 2: Read top failure mode
    const topFailure = baseline.fitnessReport.failureModes[0];
    if (!topFailure) {
      console.log('  No failure modes detected — pipeline is at maximum fitness.');
      break;
    }
    console.log(`  Top failure: ${topFailure.class} (${topFailure.count} occurrences)`);

    // Step 3: Map to parameters
    const mapping = mappingForFailureClass(topFailure.class);
    console.log(`  Implicated: ${mapping.implicatedParameters.join(', ')}`);
    console.log(`  Direction: ${mapping.direction}`);

    if (mapping.implicatedParameters.length === 0) {
      console.log('  No tunable parameters for this failure class. Skipping epoch.');
      continue;
    }

    // Step 4: Generate candidates
    const candidates = generateCandidates(currentConfig, mapping);
    console.log(`  Generated ${candidates.length} candidate configs\n`);

    // Step 5: Run each candidate
    let bestCandidate: CandidateConfig | null = null;
    let bestResult: SpeedrunResult | null = null;

    for (const candidate of candidates) {
      console.log(`  Testing: ${candidate.label}...`);
      const result = await runSpeedrunWithConfig(candidate.config);
      const record = buildExperimentRecord(result, candidate.config, candidate.delta, lastExperimentId, `evolve-epoch-${epoch}-candidate`);
      await runWithLocalServices(recordExperiment(paths, record), rootDir, {
        posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
        suiteRoot: paths.suiteRoot,
        pipelineConfig: candidate.config,
      });

      console.log(`    hitRate=${result.fitnessReport.metrics.knowledgeHitRate} delta=${result.comparison.knowledgeHitRateDelta > 0 ? '+' : ''}${result.comparison.knowledgeHitRateDelta}`);

      if (result.comparison.improved) {
        if (!bestResult || result.fitnessReport.metrics.knowledgeHitRate > bestResult.fitnessReport.metrics.knowledgeHitRate) {
          bestCandidate = candidate;
          bestResult = result;
        }
      }
    }

    // Step 6: Accept or reject
    if (bestCandidate && bestResult) {
      console.log(`\n  ACCEPTED: ${bestCandidate.label}`);
      console.log(`    ${bestCandidate.rationale}`);
      currentConfig = bestCandidate.config;

      // Update scorecard
      const existingScorecard = loadScorecard();
      const updatedScorecard = updateScorecard(bestResult.fitnessReport, existingScorecard, bestResult.comparison);
      saveScorecard(updatedScorecard);
      console.log('    Scorecard updated.');
    } else {
      console.log('\n  No candidate beat the mark this epoch.');
      break;
    }
  }

  // Final summary
  console.log(`\n=== Evolution Complete ===`);
  console.log(`  Final config delta from baseline:`);
  const delta = diffConfigs(DEFAULT_PIPELINE_CONFIG, currentConfig);
  if (Object.keys(delta).length === 0) {
    console.log('    (no changes from default)');
  } else {
    for (const [key, value] of Object.entries(delta)) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }
  }

  // Save final config
  const configOutPath = path.join(rootDir, '.tesseract', 'benchmarks', 'evolved-config.json');
  fs.mkdirSync(path.dirname(configOutPath), { recursive: true });
  fs.writeFileSync(configOutPath, JSON.stringify(currentConfig, null, 2) + '\n');
  console.log(`\n  Evolved config saved: ${configOutPath}`);
}

function diffConfigs(base: PipelineConfig, current: PipelineConfig): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  for (const key of Object.keys(base) as (keyof PipelineConfig)[]) {
    if (JSON.stringify(base[key]) !== JSON.stringify(current[key])) {
      diff[key] = current[key];
    }
  }
  return diff;
}

main().catch((error) => {
  console.error('Evolution failed:', error);
  process.exit(1);
});

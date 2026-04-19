/**
 * Parameter Sensitivity Analysis.
 *
 * For each numeric parameter in PipelineConfig, measures the fitness delta
 * when the parameter is varied by ±10%. Parameters are ranked by sensitivity
 * (|deltaHitRate| / |deltaParameter|).
 *
 * This is substrate-agnostic: the analysis runs against whatever scenario
 * substrate the speedrun produces. Tag the output with substrate context
 * so results are comparable only within the same evaluation environment.
 *
 * Usage: npx tsx scripts/sensitivity.ts [--seed S] [--count N] [--variation 0.10]
 *
 * Output: .tesseract/benchmarks/sensitivity.json
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../product/application/paths';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../product/domain/attention/pipeline-config';
import type { PipelineConfig } from '../product/domain/attention/pipeline-config';
import { speedrunProgram, type SpeedrunInput, type SpeedrunResult } from '../workshop/orchestration/speedrun';
import { runWithLocalServices } from '../product/composition/local-services';

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const seed = argVal('--seed', 'sensitivity-v1');
const count = Number(argVal('--count', '30'));
const variation = Number(argVal('--variation', '0.10'));
const maxIterations = Number(argVal('--max-iterations', '3'));

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));

// ─── Parameter perturbation descriptors ───

interface ParameterDescriptor {
  readonly name: string;
  readonly path: string;
  readonly currentValue: number;
  readonly apply: (config: PipelineConfig, value: number) => PipelineConfig;
}

function scalarParam(
  name: string,
  pathStr: string,
  get: (c: PipelineConfig) => number,
  set: (c: PipelineConfig, v: number) => PipelineConfig,
): ParameterDescriptor {
  return { name, path: pathStr, currentValue: get(DEFAULT_PIPELINE_CONFIG), apply: set };
}

const PARAMETERS: readonly ParameterDescriptor[] = [
  scalarParam('translationThreshold', 'translationThreshold',
    (c) => c.translationThreshold,
    (c, v) => mergePipelineConfig(c, { translationThreshold: v })),
  scalarParam('bottleneckWeights.repairDensity', 'bottleneckWeights.repairDensity',
    (c) => c.bottleneckWeights.repairDensity,
    (c, v) => mergePipelineConfig(c, { bottleneckWeights: { ...c.bottleneckWeights, repairDensity: v } })),
  scalarParam('bottleneckWeights.translationRate', 'bottleneckWeights.translationRate',
    (c) => c.bottleneckWeights.translationRate,
    (c, v) => mergePipelineConfig(c, { bottleneckWeights: { ...c.bottleneckWeights, translationRate: v } })),
  scalarParam('proposalRankingWeights.scenarioImpact', 'proposalRankingWeights.scenarioImpact',
    (c) => c.proposalRankingWeights.scenarioImpact,
    (c, v) => mergePipelineConfig(c, { proposalRankingWeights: { ...c.proposalRankingWeights, scenarioImpact: v } })),
  scalarParam('memoryCapacity.screenConfidenceFloor', 'memoryCapacity.screenConfidenceFloor',
    (c) => c.memoryCapacity.screenConfidenceFloor,
    (c, v) => mergePipelineConfig(c, { memoryCapacity: { ...c.memoryCapacity, screenConfidenceFloor: v } })),
  scalarParam('domScoringWeights.visibility', 'domScoringWeights.visibility',
    (c) => c.domScoringWeights.visibility,
    (c, v) => mergePipelineConfig(c, { domScoringWeights: { ...c.domScoringWeights, visibility: v } })),
  scalarParam('confidenceScaling.agentVerified', 'confidenceScaling.agentVerified',
    (c) => c.confidenceScaling.agentVerified,
    (c, v) => mergePipelineConfig(c, { confidenceScaling: { ...c.confidenceScaling, agentVerified: v } })),
  scalarParam('intentThresholds.element', 'intentThresholds.element',
    (c) => c.intentThresholds.element,
    (c, v) => mergePipelineConfig(c, { intentThresholds: { ...c.intentThresholds, element: Math.round(v) } })),
  scalarParam('convergenceThreshold', 'convergenceThreshold',
    (c) => c.convergenceThreshold,
    (c, v) => mergePipelineConfig(c, { convergenceThreshold: v })),
  scalarParam('proposalConfidenceValues.translation', 'proposalConfidenceValues.translation',
    (c) => c.proposalConfidenceValues.translation,
    (c, v) => mergePipelineConfig(c, { proposalConfidenceValues: { ...c.proposalConfidenceValues, translation: v } })),
];

// ─── Sensitivity result types ───

interface ParameterSensitivity {
  readonly name: string;
  readonly path: string;
  readonly currentValue: number;
  readonly upValue: number;
  readonly downValue: number;
  readonly upHitRate: number;
  readonly downHitRate: number;
  readonly baselineHitRate: number;
  readonly sensitivity: number;
}

interface SensitivityReport {
  readonly kind: 'sensitivity-report';
  readonly version: 1;
  readonly seed: string;
  readonly scenarioCount: number;
  readonly variation: number;
  readonly baselineHitRate: number;
  readonly rankings: readonly ParameterSensitivity[];
  readonly generatedAt: string;
}

// ─── Runner ───

async function runSpeedrun(config: PipelineConfig): Promise<SpeedrunResult> {
  const input: SpeedrunInput = { paths, config, count, seed, maxIterations };
  return runWithLocalServices(speedrunProgram(input), rootDir, {
    posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
    suiteRoot: paths.suiteRoot,
    pipelineConfig: config,
  });
}

async function main(): Promise<void> {
  console.log(`\n=== Parameter Sensitivity Analysis ===`);
  console.log(`  Seed: ${seed}, Count: ${count}, Variation: ±${(variation * 100).toFixed(0)}%\n`);

  // Baseline run
  console.log('Running baseline...');
  const baseline = await runSpeedrun(DEFAULT_PIPELINE_CONFIG);
  const baselineHitRate = baseline.fitnessReport.metrics.knowledgeHitRate;
  console.log(`  Baseline hit rate: ${baselineHitRate}\n`);

  const sensitivities: ParameterSensitivity[] = [];

  for (const param of PARAMETERS) {
    const upValue = param.currentValue * (1 + variation);
    const downValue = param.currentValue * (1 - variation);

    console.log(`Testing ${param.name} (${param.currentValue} → ${downValue.toFixed(4)}/${upValue.toFixed(4)})...`);

    const upConfig = param.apply(DEFAULT_PIPELINE_CONFIG, upValue);
    const downConfig = param.apply(DEFAULT_PIPELINE_CONFIG, downValue);

    const upResult = await runSpeedrun(upConfig);
    const downResult = await runSpeedrun(downConfig);

    const upHitRate = upResult.fitnessReport.metrics.knowledgeHitRate;
    const downHitRate = downResult.fitnessReport.metrics.knowledgeHitRate;
    const maxDelta = Math.max(Math.abs(upHitRate - baselineHitRate), Math.abs(downHitRate - baselineHitRate));
    const sensitivity = param.currentValue > 0 ? maxDelta / (param.currentValue * variation) : maxDelta;

    sensitivities.push({
      name: param.name,
      path: param.path,
      currentValue: param.currentValue,
      upValue,
      downValue,
      upHitRate,
      downHitRate,
      baselineHitRate,
      sensitivity,
    });

    console.log(`  ↑ hitRate=${upHitRate}  ↓ hitRate=${downHitRate}  sensitivity=${sensitivity.toFixed(6)}`);
  }

  // Rank by sensitivity (descending)
  const ranked = sensitivities
    .slice()
    .sort((a, b) => b.sensitivity - a.sensitivity);

  const report: SensitivityReport = {
    kind: 'sensitivity-report',
    version: 1,
    seed,
    scenarioCount: count,
    variation,
    baselineHitRate,
    rankings: ranked,
    generatedAt: new Date().toISOString(),
  };

  const outDir = path.join(rootDir, '.tesseract', 'benchmarks');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'sensitivity.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');

  console.log(`\n=== Sensitivity Rankings (most sensitive first) ===\n`);
  for (const [i, entry] of ranked.entries()) {
    console.log(`  ${i + 1}. ${entry.name} — sensitivity=${entry.sensitivity.toFixed(6)} (current=${entry.currentValue})`);
  }
  console.log(`\nReport saved: ${outPath}`);
}

main().catch((error) => {
  console.error('Sensitivity analysis failed:', error);
  process.exit(1);
});

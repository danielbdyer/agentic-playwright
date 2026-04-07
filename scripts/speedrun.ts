/**
 * Self-improving pipeline speedrun — CLI wrapper.
 *
 * Doctrinal four-verb model (fifth-kind loop):
 *
 *   npx tsx scripts/speedrun.ts corpus    [--seed S]
 *       Loop A: generate the 12-cohort reference workload to
 *       dogfood/scenarios/reference/. Idempotent on seed.
 *
 *   npx tsx scripts/speedrun.ts iterate   [--max-iterations N] [--posture P]
 *       Loop B: run the dogfood substrate-growth loop against the
 *       checked-in corpus. Reads the corpus; never regenerates.
 *
 *   npx tsx scripts/speedrun.ts fitness   [--seed S]
 *       Compute the pipeline fitness report from run records.
 *
 *   npx tsx scripts/speedrun.ts score     [--baseline LABEL|latest]
 *       Loop C: build the L4 metric tree from the latest fitness
 *       report and (optionally) diff against a stored baseline.
 *
 *   npx tsx scripts/speedrun.ts baseline  --label LABEL
 *       Snapshot the L4 metric tree as a labeled baseline.
 *
 * Legacy phase verbs (still supported):
 *
 *   npx tsx scripts/speedrun.ts generate  [--count N] [--seed S]
 *   npx tsx scripts/speedrun.ts compile   [--tag TAG]
 *   npx tsx scripts/speedrun.ts report
 *
 * Bare invocation prints `help` and exits with code 1. The previous
 * bundled "no-subcommand → multiSeedSpeedrun" default has been removed
 * outright — the four-verb model is the only supported entry point.
 *
 * All orchestration lives in lib/application/. This script is a thin
 * CLI wrapper: parse args → build input → call Effect program → print results.
 */

import * as fs from 'fs';
import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import {
  generatePhase,
  compilePhase,
  iteratePhase,
  fitnessPhase,
  reportPhase,
} from '../lib/application/improvement/speedrun';
import { resolveKnowledgePosture } from '../lib/application/knowledge/knowledge-posture';
import { generateCohortCorpus } from '../lib/application/synthesis/cohort-generator';
import {
  score as scoreCommand,
  captureBaseline,
} from '../lib/application/measurement';
import { buildL4MetricTree } from '../lib/domain/fitness/metric/visitors';
import { findLatestFitnessReport } from '../lib/application/measurement/score';
import { foldMetricTree } from '../lib/domain/fitness/metric/tree';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { PipelineConfig } from '../lib/domain/attention/pipeline-config';
import type { PipelineFitnessReport } from '../lib/domain/fitness/types';
import type { KnowledgePosture } from '../lib/domain/governance/workflow-types';
import type { SpeedrunProgressEvent } from '../lib/domain/improvement/types';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/attention/pipeline-config';
import {
  computeAllBaselines,
  deriveAllBudgets,
  detectRegression,
  extractTimingSamples,
  formatBaselineSummary,
  type PhaseTimingBaseline,
  type PhaseTimingBudget,
} from '../lib/domain/projection/speedrun-statistics';
import { startFixtureServer, type FixtureServer } from '../lib/infrastructure/tooling/fixture-server';
import { createPlaywrightBrowserPool } from '../lib/infrastructure/runtime/playwright-browser-pool';
import type { BrowserPoolPort } from '../lib/application/runtime-support/browser-pool';
import { createFileBackedDashboardPort } from '../lib/infrastructure/dashboard/file-dashboard-port';
import { resolvePlaywrightHeadless } from '../lib/infrastructure/tooling/browser-options';

// ─── CLI argument parsing ───

const args = process.argv.slice(2);
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const count = Number(argVal('--count', '50'));
const singleSeed = argVal('--seed', 'speedrun-v1');
const maxIterations = Number(argVal('--max-iterations', '5'));
const configPath = argVal('--config', '');
const experimentTag = argVal('--tag', '');
const explicitPosture = args.includes('--posture') ? argVal('--posture', '') as KnowledgePosture : undefined;
const rawMode = args.includes('--mode') ? argVal('--mode', 'playwright') : 'playwright';
const effectiveMode = rawMode === 'escalate' ? 'playwright' : rawMode;
if (rawMode === 'escalate') {
  console.error('WARNING: --mode escalate is deprecated. Playwright is now the default mode. Use --mode diagnostic for offline runs.');
}
const explicitBaseUrl = args.includes('--base-url') ? argVal('--base-url', '') : '';

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
const knowledgePosture = resolveKnowledgePosture(explicitPosture);

function loadPipelineConfig(): PipelineConfig {
  if (!configPath) return DEFAULT_PIPELINE_CONFIG;
  const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>;
  return mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, overrides);
}

// ─── Progress callback (infrastructure concern — JSONL sidecar + stderr) ───

function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}m${seconds}s` : `${seconds}s`;
}

function loadPriorBaselines(progressPath: string): {
  readonly baselines: readonly PhaseTimingBaseline[];
  readonly budgets: readonly PhaseTimingBudget[];
} {
  try {
    const raw = fs.readFileSync(progressPath, 'utf8');
    const events = raw.trim().split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SpeedrunProgressEvent);
    const samples = extractTimingSamples(events);
    const baselines = computeAllBaselines(samples);
    const budgets = deriveAllBudgets(baselines);
    if (baselines.length > 0) {
      process.stderr.write(`\n${formatBaselineSummary(baselines)}\n\n`);
    }
    return { baselines, budgets };
  } catch {
    return { baselines: [], budgets: [] };
  }
}

function createProgressCallback(progressPath: string): (event: SpeedrunProgressEvent) => void {
  const { baselines, budgets } = loadPriorBaselines(progressPath);

  return (event: SpeedrunProgressEvent): void => {
    fs.mkdirSync(path.dirname(progressPath), { recursive: true });
    fs.appendFileSync(progressPath, JSON.stringify(event) + '\n');

    // Emit a prominent banner on phase transitions so the operator knows what's happening
    if (event.phase === 'iterate' && event.iteration === 1 && !event.metrics) {
      process.stderr.write('\n>>> ITERATE PHASE — browser is now running scenarios <<<\n\n');
    } else if (event.phase === 'fitness' && !event.metrics) {
      process.stderr.write('\n>>> FITNESS PHASE — computing metrics <<<\n\n');
    }

    const phaseLabel = event.phase === 'iterate' && event.metrics
      ? `[iter ${event.iteration}/${event.maxIterations}]`
      : `[${event.phase}]`;

    const metricsLabel = event.metrics
      ? ` hitRate=${(event.metrics.knowledgeHitRate * 100).toFixed(1)}% proposals=${event.metrics.proposalsActivated} steps=${event.metrics.totalSteps} unresolved=${event.metrics.unresolvedSteps}`
      : '';

    const convergenceLabel = event.convergenceReason
      ? ` convergence=${event.convergenceReason}`
      : '';

    const scenarioLabel = event.scenarioCount !== undefined
      ? ` scenarios=${event.scenarioCount}`
      : '';

    const durationLabel = event.phaseDurationMs !== null && event.phaseDurationMs !== undefined
      ? ` phase=${formatElapsed(event.phaseDurationMs)}`
      : '';

    // Regression detection against prior baselines
    let regressionLabel = '';
    if (event.phaseDurationMs !== null && event.phaseDurationMs !== undefined && baselines.length > 0) {
      const baseline = baselines.find((b) => b.phase === event.phase);
      if (baseline && baseline.sampleCount >= 3) {
        const signal = detectRegression(baseline, event.phaseDurationMs);
        if (signal.severity === 'warning') {
          regressionLabel = ` ⚠ ${signal.zScore}σ above baseline`;
        } else if (signal.severity === 'regression') {
          regressionLabel = ` 🔴 REGRESSION ${signal.zScore}σ above baseline (p99=${formatElapsed(baseline.p99Ms)})`;
        }
      }
      const budget = budgets.find((b) => b.phase === event.phase);
      if (budget && event.phaseDurationMs > budget.timeoutMs) {
        regressionLabel += ` TIMEOUT EXCEEDED (budget=${formatElapsed(budget.timeoutMs)})`;
      }
    }

    // Calibration observability
    const calibrationLabel = event.calibration
      ? ` drift=${event.calibration.weightDrift.toFixed(4)}${event.calibration.topCorrelation ? ` top=${event.calibration.topCorrelation.signal}(${event.calibration.topCorrelation.strength > 0 ? '+' : ''}${event.calibration.topCorrelation.strength.toFixed(3)})` : ''}`
      : '';

    process.stderr.write(
      `${phaseLabel}${scenarioLabel}${metricsLabel}${convergenceLabel}${calibrationLabel}${durationLabel}${regressionLabel} elapsed=${formatElapsed(event.elapsed)}\n`,
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

// ─── Subcommand detection ───

const SUBCOMMANDS = [
  // Doctrinal four-verb model (fifth-kind loop)
  'corpus',
  'iterate',
  'fitness',
  'score',
  'baseline',
  // Legacy phase verbs (still supported for one-shot use)
  'generate',
  'compile',
  'report',
  // Help
  'help',
] as const;
type Subcommand = typeof SUBCOMMANDS[number];
const subcommand: Subcommand | null =
  args.length > 0 && SUBCOMMANDS.includes(args[0] as Subcommand) ? args[0] as Subcommand : null;

const mcpDecisions = args.includes('--mcp-decisions');
const mcpDashboard = mcpDecisions
  ? createFileBackedDashboardPort({
      decisionsDir: paths.decisionsDir,
      decisionTimeoutMs: Number(argVal('--decision-timeout', '120000')),
    })
  : undefined;

if (mcpDecisions) {
  console.log(`MCP decision mode: waiting for agent decisions via ${paths.decisionsDir}`);
}

const serviceOptions = {
  posture: { interpreterMode: effectiveMode as 'diagnostic' | 'playwright' | 'dry-run', writeMode: 'persist' as const, executionProfile: 'dogfood' as const },
  suiteRoot: paths.suiteRoot,
  pipelineConfig: loadPipelineConfig(),
  dashboard: mcpDashboard,
};

// ─── Segmented phase runners ───

async function runGenerate(): Promise<void> {
  console.log(`Generating ${count} scenarios (seed: ${singleSeed})...`);
  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  const result = await runWithLocalServices(
    generatePhase({ paths, count, seed: singleSeed, onProgress }),
    rootDir,
    serviceOptions,
  );
  console.log(`Generated ${result.scenariosGenerated} scenarios across ${result.screens.length} screens in ${(result.durationMs / 1000).toFixed(1)}s`);
}

async function runCompile(): Promise<void> {
  console.log(`Compiling scenarios${experimentTag ? ` (tag: ${experimentTag})` : ''}...`);
  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  const result = await runWithLocalServices(
    compilePhase({ paths, tag: experimentTag || undefined, onProgress }),
    rootDir,
    serviceOptions,
  );
  console.log(`Compiled ${result.scenariosCompiled} scenarios in ${(result.durationMs / 1000).toFixed(1)}s`);
}

async function runIterate(): Promise<void> {
  console.log(`Running dogfood loop (max ${maxIterations} iterations, posture: ${knowledgePosture})...`);
  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  const result = await withPlaywrightEnvironment((env) => runWithLocalServices(
    iteratePhase({
      paths,
      maxIterations,
      convergenceThreshold: loadPipelineConfig().convergenceThreshold,
      tag: experimentTag || undefined,
      knowledgePosture,
      seed: singleSeed,
      onProgress,
      interpreterMode: effectiveMode as 'dry-run' | 'diagnostic' | 'playwright',
      baseUrl: env.baseUrl,
      browserPool: env.browserPool,
    }),
    rootDir,
    { ...serviceOptions, browserPool: env.browserPool },
  ));
  console.log(`\nDogfood loop: ${result.ledger.completedIterations} iterations, converged=${result.ledger.converged} (${result.ledger.convergenceReason ?? 'n/a'})`);
  console.log(`  Knowledge hit rate delta: ${result.ledger.knowledgeHitRateDelta > 0 ? '+' : ''}${result.ledger.knowledgeHitRateDelta}`);
  console.log(`  Total proposals activated: ${result.ledger.totalProposalsActivated}`);
  console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
}

async function runFitness(): Promise<void> {
  console.log('Computing fitness report from run records...');
  const progressPath = path.join(rootDir, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  const onProgress = createProgressCallback(progressPath);

  const result = await runWithLocalServices(
    fitnessPhase({ paths, seed: singleSeed, onProgress }),
    rootDir,
    serviceOptions,
  );
  printMetrics(result.fitnessReport);
  console.log(`\nFitness computed in ${(result.durationMs / 1000).toFixed(1)}s`);
}

async function runReport(): Promise<void> {
  console.log('Comparing fitness to scorecard...');
  const result = await runWithLocalServices(
    reportPhase({ paths }),
    rootDir,
    serviceOptions,
  );
  printMetrics(result.fitnessReport);
  console.log(`\n=== Scorecard Comparison ===\n`);
  console.log(result.comparison.summary);
  console.log(`  Knowledge hit rate delta: ${result.comparison.knowledgeHitRateDelta > 0 ? '+' : ''}${result.comparison.knowledgeHitRateDelta}`);
  console.log(result.scorecardUpdated
    ? '\nScorecard UPDATED — new high-water-mark set.'
    : '\nScorecard unchanged — did not beat the mark.');
}

// ─── Loop A / C verbs (fifth-kind loop) ───

async function runCorpus(): Promise<void> {
  const masterSeed = singleSeed;
  console.log(`Generating reference cohort corpus (master seed: ${masterSeed})...`);
  const result = await runWithLocalServices(
    generateCohortCorpus({ paths, masterSeed }),
    rootDir,
    serviceOptions,
  );
  console.log(`Generated ${result.totalScenarios} scenarios across ${result.cohorts.length} cohorts`);
  console.log(`Aggregate hash: ${result.manifest.contentHash}`);
  console.log(`Manifest: ${result.manifestPath}`);
  for (const cohort of result.cohorts) {
    console.log(`  ${cohort.cohortId.padEnd(22)} ${String(cohort.count).padStart(3)} scenarios  ${cohort.contentHash}`);
  }
}

async function runBaseline(): Promise<void> {
  const label = argVal('--label', '');
  if (!label) {
    console.error('baseline subcommand requires --label LABEL');
    process.exit(2);
  }
  console.log(`Capturing L4 metric baseline as '${label}'...`);

  const { Effect } = await import('effect');
  const captured = await runWithLocalServices(
    Effect.gen(function* () {
      const report = yield* findLatestFitnessReport(paths);
      if (report === null) {
        return yield* Effect.fail(
          new Error('No fitness report found in .tesseract/benchmarks/runs/. Run `speedrun fitness` (or full mode) first.'),
        );
      }
      const tree = buildL4MetricTree({
        metrics: report.metrics,
        computedAt: new Date().toISOString(),
      });
      return yield* captureBaseline({
        paths,
        label,
        tree,
        commitSha: null,
        pipelineVersion: report.pipelineVersion,
      });
    }),
    rootDir,
    serviceOptions,
  );

  console.log(`Baseline captured: ${captured.path}`);
  console.log(`Label: ${captured.baseline.label}`);
}

async function runScore(): Promise<void> {
  const baselineLabel = args.includes('--baseline') ? argVal('--baseline', 'latest') : undefined;
  const label = baselineLabel === undefined ? '(no baseline)' : baselineLabel;
  console.log(`Computing L4 score (baseline: ${label})...`);

  const { Effect } = await import('effect');
  const result = await runWithLocalServices(
    Effect.gen(function* () {
      const opts = baselineLabel !== undefined
        ? { paths, baselineLabel: baselineLabel as 'latest' | string }
        : { paths };
      return yield* scoreCommand(opts);
    }),
    rootDir,
    serviceOptions,
  );

  console.log(`\n=== L4 metric tree (root: ${result.tree.metric.kind}) ===`);
  const flat = foldMetricTree<readonly { kind: string; value: number; depth: number }[]>(
    result.tree,
    (metric, childResults) => [
      { kind: metric.kind, value: metric.value, depth: 0 },
      ...childResults.flatMap((kids) => kids.map((k) => ({ ...k, depth: k.depth + 1 }))),
    ],
  );
  for (const entry of flat) {
    const indent = '  '.repeat(entry.depth);
    console.log(`${indent}${entry.kind.padEnd(40 - entry.depth * 2)} ${entry.value.toFixed(4)}`);
  }

  if (result.delta && result.verdict) {
    console.log(`\n=== Delta vs '${result.baseline?.label}' (verdict: ${result.verdict}) ===`);
    for (const entry of result.delta.entries) {
      if (entry.direction === 'unchanged' || entry.direction === 'incomparable') continue;
      const arrow = entry.direction === 'better' ? '↑' : entry.direction === 'worse' ? '↓' : '·';
      const before = entry.before?.toFixed(4) ?? '—';
      const after = entry.after?.toFixed(4) ?? '—';
      const abs = entry.absolute !== null ? (entry.absolute >= 0 ? '+' : '') + entry.absolute.toFixed(4) : '—';
      console.log(`  ${arrow} ${entry.kind.padEnd(38)} ${before} → ${after}  (${abs})  [${entry.direction}]`);
    }
  }
}

// ─── Fixture server + browser pool lifecycle helper ───

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
    // Start fixture server if no explicit base URL
    if (!resolvedBaseUrl) {
      console.log('Starting fixture server for Playwright execution...');
      server = await startFixtureServer({ rootDir });
      console.log(`Fixture server ready at ${server.baseUrl}`);
    }

    const baseUrl = resolvedBaseUrl ?? server?.baseUrl;

    // Create browser pool for page reuse across scenarios
    const headless = resolvePlaywrightHeadless(process.env);
    console.log(`Creating browser pool (headless=${headless})...`);
    pool = await createPlaywrightBrowserPool({ headless, config: { poolSize: 4, preWarm: true, maxPageAgeMs: 300_000 } });
    console.log(`Browser pool ready (4 warm pages, ${headless ? 'headless' : 'HEADED — watch for the Chromium window'}).`);

    return await fn({ baseUrl, browserPool: pool });
  } finally {
    if (pool) {
      const stats = pool.stats;
      console.log(`Browser pool stats: acquired=${stats.totalAcquired} released=${stats.totalReleased} overflow=${stats.totalOverflow} resets=${stats.totalResets}`);
      await pool.close();
      console.log('Browser pool closed.');
    }
    if (server) {
      await server.stop();
      console.log('Fixture server stopped.');
    }
  }
}

// ─── Help ───
//
// Bare invocation prints help and exits with code 1. The previous
// "no-subcommand → multiSeedSpeedrun" default has been removed
// outright. Operators compose the four doctrinal verbs explicitly.

async function runHelp(): Promise<void> {
  const lines: readonly string[] = [
    '',
    'tesseract speedrun — pipeline iteration shell',
    '',
    'Doctrinal four-verb model (fifth-kind loop):',
    '',
    '  speedrun corpus    [--seed S]',
    '      Loop A: generate the 12-cohort reference workload to',
    '      dogfood/scenarios/reference/. Idempotent on seed.',
    '',
    '  speedrun iterate   [--max-iterations N] [--posture P]',
    '      Loop B: run the dogfood substrate-growth loop against the',
    '      checked-in corpus. Reads the corpus; never regenerates it.',
    '',
    '  speedrun fitness   [--seed S]',
    '      Compute the pipeline fitness report from run records.',
    '      Output feeds both the legacy scorecard and the L4 score verb.',
    '',
    '  speedrun score     [--baseline LABEL|latest]',
    '      Loop C: build the L4 metric tree from the latest fitness',
    '      report and (optionally) diff it against a stored baseline.',
    '',
    '  speedrun baseline  --label LABEL',
    '      Capture the L4 metric tree as a labeled snapshot under',
    '      .tesseract/baselines/{LABEL}.baseline.json.',
    '',
    'Legacy phase verbs (still supported):',
    '',
    '  speedrun generate  [--count N] [--seed S]',
    '      Pre-cohort single-batch generator. Writes to',
    '      dogfood/scenarios/synthetic/. New work should use `corpus`.',
    '',
    '  speedrun compile   [--tag TAG]',
    '      Compile scenarios into bound form. Internal step of iterate;',
    '      occasionally useful as a one-shot.',
    '',
    '  speedrun report',
    '      Compare the latest fitness report against the legacy',
    '      scorecard high-water-mark.',
    '',
    'Usage:',
    '  npx tsx scripts/speedrun.ts <subcommand> [flags]',
    '  npx tsx scripts/speedrun.ts help     # show this message',
    '',
  ];
  for (const line of lines) console.log(line);
}

const dispatch: Record<Subcommand, () => Promise<void>> = {
  generate: runGenerate,
  compile: runCompile,
  iterate: runIterate,
  fitness: runFitness,
  report: runReport,
  corpus: runCorpus,
  baseline: runBaseline,
  score: runScore,
  help: runHelp,
};

// Bare invocation: print help and exit non-zero. The previous
// "no-subcommand → multiSeedSpeedrun" default has been removed
// outright.
async function runBareDefault(): Promise<void> {
  console.error('Error: speedrun requires an explicit subcommand. See:');
  console.error('');
  await runHelp();
  process.exit(1);
}

const runner = subcommand ? dispatch[subcommand] : runBareDefault;

runner().catch((error) => {
  console.error(`Speedrun${subcommand ? ` (${subcommand})` : ''} failed:`, error);
  process.exit(1);
});

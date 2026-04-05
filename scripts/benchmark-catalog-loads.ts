/**
 * Benchmark: measure catalog load count and timing for a dogfood iteration.
 *
 * Usage: npx tsx scripts/benchmark-catalog-loads.ts
 *
 * This script runs a minimal speedrun (3 scenarios, 1 iteration) and reports
 * how many times loadWorkspaceCatalog was called and how long each phase took.
 */

import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { getCatalogLoadCount, resetCatalogLoadCount } from '../lib/application/catalog';
import { speedrunProgram } from '../lib/application/improvement/speedrun';
import { cleanSlateProgram } from '../lib/application/improvement/clean-slate';
import { runWithLocalServices } from '../lib/composition/local-services';
import type { SpeedrunProgressEvent } from '../lib/domain/improvement/types';

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));

async function main(): Promise<void> {
  resetCatalogLoadCount();
  const events: SpeedrunProgressEvent[] = [];

  const onProgress = (event: SpeedrunProgressEvent): void => {
    events.push(event);
    const phase = event.phase === 'iterate'
      ? `iter ${event.iteration}/${event.maxIterations}`
      : event.phase;
    const duration = event.phaseDurationMs !== null && event.phaseDurationMs !== undefined
      ? `${(event.phaseDurationMs / 1000).toFixed(1)}s`
      : '?';
    const loads = getCatalogLoadCount();
    process.stderr.write(
      `[${phase}] duration=${duration} catalogLoads=${loads} scenarios=${event.scenarioCount ?? '?'}\n`,
    );
  };

  // Clean slate
  const cleanStart = Date.now();
  await runWithLocalServices(
    cleanSlateProgram(rootDir, paths),
    rootDir,
    { posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' }, suiteRoot: paths.suiteRoot },
  );
  const cleanDuration = Date.now() - cleanStart;
  console.log(`\nClean slate: ${(cleanDuration / 1000).toFixed(1)}s, catalog loads: ${getCatalogLoadCount()}`);
  resetCatalogLoadCount();

  // Speedrun
  const speedrunStart = Date.now();
  const result = await runWithLocalServices(
    speedrunProgram({
      paths,
      config: (await import('../lib/domain/types')).DEFAULT_PIPELINE_CONFIG,
      count: 3,
      seed: 'benchmark-v1',
      maxIterations: 1,
      knowledgePosture: 'cold-start',
      onProgress,
    }),
    rootDir,
    {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
    },
  );
  const totalDuration = Date.now() - speedrunStart;
  const totalLoads = getCatalogLoadCount();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`CATALOG LOAD BENCHMARK`);
  console.log(`${'='.repeat(60)}`);
  console.log(`Total catalog loads:    ${totalLoads}`);
  console.log(`Total duration:         ${(totalDuration / 1000).toFixed(1)}s`);
  console.log(`Avg load cost:          ${(totalDuration / totalLoads / 1000).toFixed(2)}s (amortized)`);
  console.log(`Scenarios generated:    ${result.fitnessReport.metrics.resolutionByRung.reduce((s, r) => s + r.wins, 0)} steps`);
  console.log(`Knowledge hit rate:     ${(result.fitnessReport.metrics.knowledgeHitRate * 100).toFixed(1)}%`);
  console.log(`Converged:              ${result.converged}`);
  console.log(`${'='.repeat(60)}`);

  console.log(`\nPhase breakdown:`);
  for (const event of events) {
    const phase = event.phase === 'iterate'
      ? `  iter ${event.iteration}`
      : `  ${event.phase}`;
    const dur = event.phaseDurationMs !== null && event.phaseDurationMs !== undefined
      ? `${(event.phaseDurationMs / 1000).toFixed(1)}s`
      : '?';
    console.log(`${phase.padEnd(20)} ${dur}`);
  }
}

main().catch((error) => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});

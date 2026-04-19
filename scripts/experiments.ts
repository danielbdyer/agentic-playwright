/**
 * Recursive-improvement history query tool.
 *
 * Usage: npx tsx scripts/experiments.ts [--accepted] [--tag X] [--substrate S] [--top N]
 *
 * The canonical history comes from `.tesseract/benchmarks/improvement-ledger.json`.
 * `experiments.json` remains a compatibility projection for legacy tooling.
 */

import path from 'path';
import { createProjectPaths } from '../product/application/paths';
import { loadImprovementLedger, toExperimentRecord } from '../workshop/orchestration/improvement';
import { runWithLocalServices } from '../product/composition/local-services';
import type { ExperimentRecord } from '../product/domain/improvement/experiment';
import type { ExperimentSubstrate, ImprovementRun } from '../product/domain/improvement/types';

const args = process.argv.slice(2);

function hasFlag(name: string): boolean {
  return args.includes(name);
}

function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

function formatDelta(record: ExperimentRecord): string {
  return Object.keys(record.configDelta).length > 0
    ? Object.keys(record.configDelta).join(', ')
    : 'baseline';
}

function renderRun(run: ImprovementRun): void {
  const record = toExperimentRecord(run);
  const status = record.accepted ? 'ACCEPTED' : 'rejected';
  const latestDecision = run.acceptanceDecisions[run.acceptanceDecisions.length - 1] ?? null;

  console.log(`  ${run.improvementRunId}  [${status}]  substrate=${run.substrateContext.substrate}  seed=${run.substrateContext.seed}`);
  console.log(`    pipeline=${run.pipelineVersion}  hitRate=${record.fitnessReport.metrics.knowledgeHitRate}  delta=${record.scorecardComparison.knowledgeHitRateDelta > 0 ? '+' : ''}${record.scorecardComparison.knowledgeHitRateDelta}`);
  console.log(`    config: ${formatDelta(record)}`);
  if (run.tags.length > 0) {
    console.log(`    tags: ${run.tags.join(', ')}`);
  }
  if (latestDecision) {
    console.log(`    verdict: ${latestDecision.verdict}`);
  }
  console.log('');
}

async function main(): Promise<void> {
  const rootDir = process.cwd();
  const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));
  const topN = Number(argVal('--top', '20'));
  const substrateFilter = argVal('--substrate', '');
  const tagFilter = argVal('--tag', '');

  const ledger = await runWithLocalServices(loadImprovementLedger(paths), rootDir);
  let runs = ledger.runs;

  if (hasFlag('--accepted')) {
    runs = runs.filter((run) => run.accepted);
  }

  if (substrateFilter) {
    runs = runs.filter((run) => run.substrateContext.substrate === substrateFilter as ExperimentSubstrate);
  }

  if (tagFilter) {
    runs = runs.filter((run) => run.tags.includes(tagFilter));
  }

  const visibleRuns = runs.slice(-topN);
  console.log(`\n=== Recursive Improvement History (${visibleRuns.length} of ${runs.length} selected, ${ledger.runs.length} total) ===\n`);
  console.log('  Source: .tesseract/benchmarks/improvement-ledger.json');
  console.log('  Compatibility projection: .tesseract/benchmarks/experiments.json\n');

  if (visibleRuns.length === 0) {
    console.log('No recursive-improvement runs match the filter criteria.');
    process.exit(0);
  }

  visibleRuns.forEach(renderRun);
}

main().catch((error) => {
  console.error('Recursive-improvement history query failed:', error);
  process.exit(1);
});

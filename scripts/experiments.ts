/**
 * Experiment registry query tool.
 *
 * Usage: npx tsx scripts/experiments.ts [--accepted] [--tag X] [--substrate S] [--top N]
 */

import { loadExperimentRegistry } from '../lib/application/experiment-registry';
import type { ExperimentRecord, ExperimentSubstrate } from '../lib/domain/types';
import { acceptedExperiments, experimentsForSubstrate, experimentsWithTag } from '../lib/domain/types';

const args = process.argv.slice(2);
function hasFlag(name: string): boolean {
  return args.includes(name);
}
function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const rootDir = process.cwd();
const registry = loadExperimentRegistry(rootDir);
const topN = Number(argVal('--top', '20'));

let experiments: readonly ExperimentRecord[] = registry.experiments;

if (hasFlag('--accepted')) {
  experiments = acceptedExperiments({ ...registry, experiments });
}

const substrateFilter = argVal('--substrate', '');
if (substrateFilter) {
  experiments = experimentsForSubstrate(
    { ...registry, experiments },
    substrateFilter as ExperimentSubstrate,
  );
}

const tagFilter = argVal('--tag', '');
if (tagFilter) {
  experiments = experimentsWithTag({ ...registry, experiments }, tagFilter);
}

experiments = experiments.slice(-topN);

console.log(`\n=== Experiment Registry (${experiments.length} of ${registry.experiments.length} total) ===\n`);

if (experiments.length === 0) {
  console.log('No experiments match the filter criteria.');
  process.exit(0);
}

for (const exp of experiments) {
  const delta = Object.keys(exp.configDelta).length > 0
    ? Object.keys(exp.configDelta).join(', ')
    : 'baseline';
  const status = exp.accepted ? 'ACCEPTED' : 'rejected';
  console.log(`  ${exp.id}  [${status}]  substrate=${exp.substrateContext.substrate}  seed=${exp.substrateContext.seed}`);
  console.log(`    pipeline=${exp.pipelineVersion}  hitRate=${exp.fitnessReport.metrics.knowledgeHitRate}  delta=${exp.scorecardComparison.knowledgeHitRateDelta > 0 ? '+' : ''}${exp.scorecardComparison.knowledgeHitRateDelta}`);
  console.log(`    config: ${delta}`);
  if (exp.tags.length > 0) {
    console.log(`    tags: ${exp.tags.join(', ')}`);
  }
  console.log('');
}

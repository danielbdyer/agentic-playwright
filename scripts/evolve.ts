/**
 * Automatic Knob Search — CLI wrapper.
 *
 * Usage: npx tsx scripts/evolve.ts [--max-epochs N] [--seed S] [--count N]
 *        [--max-iterations N] [--substrate S]
 *
 * All orchestration lives in lib/application/evolve.ts. This script is a thin
 * CLI wrapper: parse args → call Effect program → print results.
 */

import * as path from 'path';
import { createProjectPaths } from '../lib/application/paths';
import { evolveProgram, type EvolveResult } from '../lib/application/improvement/evolve';
import { runWithLocalServices } from '../lib/composition/local-services';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/types';

// ─── CLI argument parsing ───

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

// ─── Display helpers ───

function printResult(result: EvolveResult): void {
  for (const epoch of result.epochs) {
    console.log(`\n--- Epoch ${epoch.epoch} ---`);
    console.log(`  Baseline hit rate: ${epoch.baseline.fitnessReport.metrics.knowledgeHitRate}`);
    console.log(`  Top failure: ${epoch.topFailureClass ?? '(none)'}`);
    console.log(`  Candidates tested: ${epoch.candidatesTested}`);

    if (epoch.accepted && epoch.bestCandidate) {
      console.log(`  ACCEPTED: ${epoch.bestCandidate.label}`);
      console.log(`    ${epoch.bestCandidate.rationale}`);
    } else if (epoch.candidatesTested > 0) {
      console.log('  No candidate beat the mark.');
    } else {
      console.log('  No tunable parameters or no failure modes.');
    }
  }

  console.log(`\n=== Evolution Complete ===`);
  console.log(`  Final config delta from baseline:`);
  const delta = result.configDelta;
  if (Object.keys(delta).length === 0) {
    console.log('    (no changes from default)');
  } else {
    for (const [key, value] of Object.entries(delta)) {
      console.log(`    ${key}: ${JSON.stringify(value)}`);
    }
  }
  console.log(`\n  Evolved config saved: ${result.evolvedConfigPath}`);
}

// ─── Main ───

async function main(): Promise<void> {
  console.log(`\n=== Automatic Knob Search ===`);
  console.log(`  Max epochs: ${maxEpochs}, Seed: ${seed}, Count: ${count}\n`);

  const result = await runWithLocalServices(
    evolveProgram({
      paths,
      maxEpochs,
      seed,
      count,
      maxIterations,
      substrate,
    }),
    rootDir,
    {
      posture: { interpreterMode: 'diagnostic', writeMode: 'persist', executionProfile: 'dogfood' },
      suiteRoot: paths.suiteRoot,
      pipelineConfig: DEFAULT_PIPELINE_CONFIG,
    },
  );

  printResult(result);
}

main().catch((error) => {
  console.error('Evolution failed:', error);
  process.exit(1);
});

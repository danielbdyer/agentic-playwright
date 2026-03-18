/**
 * Generate synthetic scenarios for dogfood testing.
 * Usage: npx tsx scripts/generate-synthetic.ts [--count N] [--seed S]
 */

import { createProjectPaths } from '../lib/application/paths';
import { generateSyntheticScenarios } from '../lib/application/synthesis/scenario-generator';
import { runWithLocalServices } from '../lib/composition/local-services';

const args = process.argv.slice(2);
const countArg = args.indexOf('--count');
const seedArg = args.indexOf('--seed');
const count = countArg >= 0 ? Number(args[countArg + 1]) : 50;
const seed = seedArg >= 0 ? args[seedArg + 1]! : 'moonshot-v1';

import * as path from 'path';

const rootDir = process.cwd();
const paths = createProjectPaths(rootDir, path.join(rootDir, 'dogfood'));

const program = generateSyntheticScenarios({
  paths,
  count,
  seed,
});

runWithLocalServices(program, paths.rootDir).then((result) => {
  console.log(`Generated ${result.scenariosGenerated} synthetic scenarios`);
  console.log(`Screens: ${result.screens.join(', ')}`);
  for (const file of result.files.slice(0, 10)) {
    console.log(`  ${file}`);
  }
  if (result.files.length > 10) {
    console.log(`  ... and ${result.files.length - 10} more`);
  }
}).catch((error) => {
  console.error('Failed to generate scenarios:', error);
  process.exit(1);
});

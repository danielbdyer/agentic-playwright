/**
 * Compounding-engine graduation drive-through.
 *
 * Reproduces the Z10a–Z10d wiring sequence end-to-end: cleans
 * workshop/logs/, authors the seed hypothesis, emits probe +
 * scenario receipts bound to that hypothesis, then invokes
 * compounding-scoreboard three times (trajectory depth needs
 * >= 3 cycles for the sustained-rate gate to evaluate).
 *
 * Asserts graduation.state === 'holds' on the third snapshot;
 * exits 1 otherwise.
 *
 * Usage:
 *   npm run graduate
 *   npx tsx scripts/graduate.ts [--skip-build] [--hypothesis <path>]
 *
 * The --skip-build flag is provided for inner-loop re-runs where
 * dist/ is already fresh; the default always rebuilds so the
 * sequence matches a fresh-clone reproduction.
 */
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const rootDir = process.cwd();
const args = process.argv.slice(2);

function argVal(name: string, fallback: string): string {
  const idx = args.indexOf(name);
  return idx >= 0 ? args[idx + 1]! : fallback;
}

const skipBuild = args.includes('--skip-build');
const hypothesisPath = argVal(
  '--hypothesis',
  path.join('workshop', 'observations', 'fixtures', 'verdict-10-hypothesis.json'),
);
const hypothesisId = readHypothesisId(path.resolve(rootDir, hypothesisPath));

const tesseractEntrypoint = path.join('dist', 'bin', 'tesseract.js');
const logsDir = path.join(rootDir, 'workshop', 'logs');

function readHypothesisId(absPath: string): string {
  const raw = fs.readFileSync(absPath, 'utf8');
  const parsed = JSON.parse(raw) as { readonly id?: string };
  if (!parsed.id) {
    throw new Error(`Hypothesis fixture ${absPath} is missing 'id' field.`);
  }
  return parsed.id;
}

function runStep(label: string, command: string, commandArgs: readonly string[]): string {
  process.stderr.write(`\n--- ${label} ---\n  $ ${command} ${commandArgs.join(' ')}\n`);
  const result = spawnSync(command, commandArgs, { cwd: rootDir, encoding: 'utf8' });
  if (result.error) {
    throw new Error(`${label} spawn error: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? '');
    process.stderr.write(result.stderr ?? '');
    throw new Error(`${label} exited ${result.status}`);
  }
  return result.stdout ?? '';
}

function runScoreboard(cycle: number): unknown {
  const stdout = runStep(
    `compounding-scoreboard cycle ${cycle}`,
    'node',
    [tesseractEntrypoint, 'compounding-scoreboard'],
  );
  return JSON.parse(stdout);
}

interface GraduationCondition {
  readonly name: string;
  readonly held: boolean;
  readonly detail: string;
}

interface Graduation {
  readonly state: 'holds' | 'not-yet';
  readonly missingConditions: readonly string[];
  readonly conditions: readonly GraduationCondition[];
}

function extractGraduation(scoreboardJson: unknown): Graduation {
  const envelope = scoreboardJson as { readonly result?: { readonly scoreboard?: { readonly graduation?: Graduation } } };
  const graduation = envelope.result?.scoreboard?.graduation;
  if (!graduation) {
    throw new Error(`Scoreboard JSON missing result.scoreboard.graduation`);
  }
  return graduation;
}

async function main(): Promise<void> {
  process.stderr.write('=== Compounding-engine graduation drive-through ===\n');
  process.stderr.write(`  rootDir:        ${rootDir}\n`);
  process.stderr.write(`  hypothesis:     ${hypothesisPath} (id: ${hypothesisId})\n`);
  process.stderr.write(`  skipBuild:      ${skipBuild}\n`);

  // Step 1: clean logs.
  if (fs.existsSync(logsDir)) {
    fs.rmSync(logsDir, { recursive: true, force: true });
    process.stderr.write(`\nCleaned ${logsDir}\n`);
  }

  // Step 2: build (unless skipped).
  if (!skipBuild) {
    runStep('npm run build', 'npm', ['run', 'build']);
  }

  // Step 3: author hypothesis.
  runStep('compounding-hypothesize', 'node', [
    tesseractEntrypoint,
    'compounding-hypothesize',
    '--input',
    hypothesisPath,
  ]);

  // Step 4: emit probe receipts bound to the hypothesis.
  runStep('probe-spike --emit-receipts', 'node', [
    tesseractEntrypoint,
    'probe-spike',
    '--emit-receipts',
    '--hypothesis-id',
    hypothesisId,
  ]);

  // Step 5: emit scenario receipts bound to the hypothesis.
  runStep('scenario-verify --emit-receipts', 'node', [
    tesseractEntrypoint,
    'scenario-verify',
    '--emit-receipts',
    '--hypothesis-id',
    hypothesisId,
  ]);

  // Step 6: three scoreboard cycles. The sustained-rate gate needs
  // deepestSampled >= 3 (see docs/v2-compounding-engine-plan.md §9.5
  // ZC23.d); each cycle stamps a distinct computedAt, so three
  // invocations produce three trajectory entries.
  runScoreboard(1);
  runScoreboard(2);
  const finalScoreboard = runScoreboard(3);

  const graduation = extractGraduation(finalScoreboard);

  process.stderr.write('\n=== Final graduation ===\n');
  process.stderr.write(JSON.stringify(graduation, null, 2) + '\n');

  if (graduation.state !== 'holds') {
    process.stderr.write(
      `\nFAILED: graduation.state = '${graduation.state}' (expected 'holds').\n` +
      `Missing: ${graduation.missingConditions.join(', ')}\n` +
      `Condition detail strings tell you which gate is failing and why.\n`,
    );
    process.exit(1);
  }

  process.stderr.write('\nPASS: graduation.state === \'holds\'; all four conditions satisfied.\n');
}

main().catch((error) => {
  process.stderr.write(`Graduate script failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

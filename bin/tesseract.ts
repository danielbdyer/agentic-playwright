#!/usr/bin/env node
import { TesseractError } from '../product/domain/kernel/errors';
import { runWithLocalServicesDetailed } from '../product/composition/local-services';
import { createCliPaths, parseCliInvocation, resolveExecutionPosture } from '../product/cli/registry';
import { composedCliCommandRegistry } from './cli-registry';

function logJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function logIncrementalStatus(command: string, result: unknown): void {
  if ((command !== 'graph' && command !== 'types' && command !== 'emit') || !result || typeof result !== 'object') {
    return;
  }

  const incremental = (result as { incremental?: { status?: string | undefined; changedInputs?: string[] } }).incremental;
  if (!incremental || typeof incremental.status !== 'string') {
    return;
  }

  const changedInputs = Array.isArray(incremental.changedInputs) ? incremental.changedInputs : [];
  const changedSummary = changedInputs.length > 0 ? changedInputs.join(', ') : 'none';
  process.stderr.write(`[${command}] ${incremental.status}; changedInputs=${changedSummary}\n`);
}

async function main(): Promise<void> {
  const invocation = parseCliInvocation(process.argv.slice(2), composedCliCommandRegistry);
  const posture = resolveExecutionPosture({ ...invocation.postureInput, isCI: Boolean(process.env.CI) });
  const rootDir = process.cwd();
  const paths = createCliPaths(rootDir);
  const baseProgram = invocation.execute(paths, posture);

  if (posture.interpreterMode) {
    process.env.TESSERACT_INTERPRETER_MODE = posture.interpreterMode;
  }
  if (invocation.environment) {
    for (const [key, value] of Object.entries(invocation.environment)) {
      if (value !== undefined) {
        process.env[key] = value;
      }
    }
  }
  process.env.TESSERACT_WRITE_MODE = posture.writeMode;
  if (posture.headed) {
    process.env.TESSERACT_HEADLESS = '0';
  }

  const execution = await runWithLocalServicesDetailed(baseProgram, rootDir, {
    posture,
    suiteRoot: paths.suiteRoot,
  });
  logIncrementalStatus(invocation.command, execution.result);
  logJson({
    result: execution.result,
    executionPosture: execution.posture,
    wouldWrite: execution.wouldWrite,
  });

  if (
    invocation.strictExitOnUnbound &&
    typeof execution.result === 'object' &&
    execution.result !== null &&
    'hasUnbound' in execution.result &&
    (execution.result as { hasUnbound: boolean }).hasUnbound
  ) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  const rendered = error instanceof TesseractError
    ? `${error.code}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
  process.stderr.write(`${rendered}\n`);
  process.exitCode = 1;
});

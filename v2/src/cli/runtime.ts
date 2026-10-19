import path from 'node:path';
import { loadWorkspace } from '../workspace/workspace.js';
import { createBrowserPool } from '../browser/pool.js';
import { createRuntime, type Runtime } from '../tools/runtime.js';
import { createHandlers } from '../tools/handlers/index.js';
import { releasePausedRuns } from '../run/index.js';

export interface CliRuntimeOptions {
  readonly root: string;
  readonly headed?: boolean;
  readonly env?: NodeJS.ProcessEnv;
  readonly log?: (message: string) => void;
}

export const defaultLog = (message: string): void => {
  process.stderr.write(`[tesseract-qa] ${message}\n`);
};

export const resolveRoot = (flag: string | undefined, env: NodeJS.ProcessEnv = process.env): string =>
  path.resolve(flag ?? env.TESSERACT_ROOT ?? process.cwd());

/** One runtime per process (CLI) or per MCP session (HTTP): its own browser pool, shared workspace. */
export const createCliRuntime = async (options: CliRuntimeOptions): Promise<Runtime> => {
  const env = options.env ?? process.env;
  const log = options.log ?? defaultLog;
  const workspace = await loadWorkspace(options.root, env);
  const browser = createBrowserPool({
    userAgentSuffix: workspace.config.userAgentSuffix,
    headless: !(options.headed ?? env.TESSERACT_HEADED === '1'),
    root: workspace.paths.root,
    log,
  });
  return createRuntime({
    workspace,
    browser,
    handlers: createHandlers(),
    env,
    log,
    closeHooks: [releasePausedRuns],
  });
};

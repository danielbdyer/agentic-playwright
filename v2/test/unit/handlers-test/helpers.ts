/**
 * Support for the handler tests: a customer-shaped workspace under the OS
 * temp directory (its node_modules/@playwright/test links to this package's
 * dependency, as an installed repository's would), a tool context over a
 * real browser pool, and an invoke() that validates input and output
 * against the contract the way the runtime does.
 */
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { findTool, type ToolInput, type ToolName, type ToolOutput } from '../../../src/contract/tools.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import { createBrowserPool } from '../../../src/browser/pool.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';
import type { ToolContext } from '../../../src/tools/types.js';
import { testHandlers } from '../../../src/tools/handlers/test.js';
import { adoHandlers } from '../../../src/tools/handlers/ado.js';
import { handoffHandlers } from '../../../src/tools/handlers/handoff.js';
import { reviewHandlers } from '../../../src/tools/handlers/review.js';

export const PLAYWRIGHT_TEST_DIR = path.dirname(createRequire(import.meta.url).resolve('@playwright/test/package.json'));

export interface TestWorkspace {
  readonly root: string;
  readonly workspace: Workspace;
  readonly dispose: () => Promise<void>;
}

export interface WorkspaceOptions {
  readonly baseURL?: string;
  readonly ado?: { readonly orgUrl: string; readonly project: string };
  readonly profile?: Readonly<Record<string, unknown>>;
  /** Link node_modules/@playwright/test into the workspace (default true). */
  readonly linkPlaywright?: boolean;
  readonly env?: NodeJS.ProcessEnv;
}

export const makeWorkspace = async (options: WorkspaceOptions = {}): Promise<TestWorkspace> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-runloop-'));
  await fs.mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
  if (options.linkPlaywright !== false) {
    await fs.mkdir(path.join(root, 'node_modules', '@playwright'), { recursive: true });
    await fs.symlink(PLAYWRIGHT_TEST_DIR, path.join(root, 'node_modules', '@playwright', 'test'), 'dir');
  }
  await fs.writeFile(
    path.join(root, '.tesseract', 'config.json'),
    JSON.stringify({ pii: 'standard', ...(options.ado !== undefined ? { ado: { ...options.ado, patEnv: 'AZURE_DEVOPS_PAT' } } : {}) }, null, 2),
  );
  if (options.baseURL !== undefined) {
    await fs.writeFile(path.join(root, '.tesseract', 'profiles', 'qa.json'), JSON.stringify({ name: 'qa', baseURL: options.baseURL, ...(options.profile ?? {}) }, null, 2));
  }
  const workspace = await loadWorkspace(root, options.env ?? {});
  return { root, workspace, dispose: () => fs.rm(root, { recursive: true, force: true }) };
};

export const makePool = (workspace: Workspace): BrowserPool =>
  createBrowserPool({ userAgentSuffix: workspace.config.userAgentSuffix, headless: true, root: workspace.paths.root });

export const makeContext = (workspace: Workspace, browser: BrowserPool, env: NodeJS.ProcessEnv = {}, logs: string[] = []): ToolContext => ({
  workspace,
  browser,
  env,
  now: () => new Date(),
  session: 's-handlers-test',
  log: (message) => {
    logs.push(message);
  },
  call: async (name) => {
    throw new Error(`ctx.call(${name}) is not wired in handler tests`);
  },
});

const handlers = { ...testHandlers, ...adoHandlers, ...handoffHandlers, ...reviewHandlers };
type Slice = keyof typeof handlers;

/** Parse the input with the tool's schema (defaults applied), run the handler, and check the output against the contract. */
export const invoke = async <N extends Slice & ToolName>(name: N, input: unknown, ctx: ToolContext): Promise<ToolOutput<N>> => {
  const declaration = findTool(name);
  if (declaration === undefined) throw new Error(`no tool ${name}`);
  const parsed = declaration.input.parse(input) as ToolInput<N>;
  const handler = handlers[name] as unknown as (input: ToolInput<N>, ctx: ToolContext) => Promise<ToolOutput<N>>;
  const output = await handler(parsed, ctx);
  const checked = declaration.output.safeParse(output);
  if (!checked.success) throw new Error(`${name} output violates the contract: ${JSON.stringify(checked.error.issues.slice(0, 5))}`);
  return output;
};

export const readLines = async (file: string): Promise<readonly Record<string, unknown>[]> => {
  const text = await fs.readFile(file, 'utf8').catch(() => '');
  return text
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
};

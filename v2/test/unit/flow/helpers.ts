/**
 * Shared fixtures for the flow tests: a temp workspace with a profile for
 * the fixture app, a runtime whose only real handlers are flow.record and
 * flow.run (so authoring receipts are written exactly as in production),
 * and a recursive grep over the workspace.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import { TOOLS } from '../../../src/contract/tools.js';
import { createBrowserPool } from '../../../src/browser/pool.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import type { ToolHandlers } from '../../../src/tools/types.js';
import { flowHandlers } from '../../../src/tools/handlers/flow.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';

export const tempWorkspace = async (prefix = 'tesseract-flow-'): Promise<Workspace> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return loadWorkspace(root, {});
};

export const removeWorkspace = async (workspace: Workspace): Promise<void> => {
  await fs.rm(workspace.paths.root, { recursive: true, force: true });
};

export const writeProfile = async (workspace: Workspace, name: string, profile: Readonly<Record<string, unknown>>): Promise<void> => {
  await fs.mkdir(workspace.paths.profiles, { recursive: true });
  await fs.writeFile(path.join(workspace.paths.profiles, `${name}.json`), `${JSON.stringify(profile, null, 2)}\n`);
};

/** Every handler but the flow ones refuses: these tests exercise flow.* alone. */
const stubHandlers = (): ToolHandlers =>
  Object.fromEntries(
    TOOLS.map((tool) => [
      tool.name,
      async (): Promise<never> => {
        throw new ToolError('unavailable', `${tool.name} is not part of the flow tests`);
      },
    ]),
  ) as unknown as ToolHandlers;

export const flowRuntime = (workspace: Workspace, env: NodeJS.ProcessEnv): Runtime =>
  createRuntime({
    workspace,
    browser: createBrowserPool({ userAgentSuffix: 'tesseract-qa-test', root: workspace.paths.root, headless: true }),
    handlers: { ...stubHandlers(), ...flowHandlers },
    env,
    session: 's-flow-test',
    log: () => undefined,
  });

/** Files under `dir` (recursively) whose bytes contain `needle`. */
export const grep = async (dir: string, needle: string): Promise<readonly string[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry): Promise<readonly string[]> => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return grep(full, needle);
      if (!entry.isFile()) return [];
      const content = await fs.readFile(full);
      return content.includes(Buffer.from(needle, 'utf8')) ? [full] : [];
    }),
  );
  return nested.flat();
};

/** Wait for a page the pool opened on its own (flow.record without pageId). */
export const pageOpenedBy = async (runtime: Runtime, urlPart: string, timeoutMs = 15_000): Promise<Page> => {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const handle = runtime.ctx.browser.list().find((h) => h.page.url().includes(urlPart));
    if (handle !== undefined) return handle.page;
    if (Date.now() > deadline) throw new Error(`no page with ${urlPart} opened`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
};

/**
 * Harness for the app.* and memory.* handler tests: a temp workspace with a
 * profile pointing at the fixture app, a real browser pool (headless
 * Chromium), and the runtime that validates every input and output against
 * the contract and writes authoring receipts. Tools outside this slice are
 * stubs; flow.run can be replaced to exercise app.open's login-flow path.
 */
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ToolError } from '../../../src/core/errors.js';
import { createBrowserPool } from '../../../src/browser/pool.js';
import type { ToolInput, ToolName, ToolOutput } from '../../../src/contract/tools.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import type { ToolHandler, ToolHandlers } from '../../../src/tools/types.js';
import { appHandlers } from '../../../src/tools/handlers/app.js';
import { memoryHandlers } from '../../../src/tools/handlers/memory.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';

export type Json = Record<string, unknown>;

const stub = (name: string): ToolHandler<ToolName> => async () => {
  throw new ToolError('unavailable', `${name} is not part of this test harness`);
};

export const handlersWith = (overrides: Partial<ToolHandlers> = {}): ToolHandlers =>
  ({
    'test.emit': stub('test.emit'),
    'test.run': stub('test.run'),
    'ado.fetch': stub('ado.fetch'),
    'ado.publish': stub('ado.publish'),
    'handoff.raise': stub('handoff.raise'),
    'review.record': stub('review.record'),
    'flow.record': stub('flow.record'),
    'flow.run': stub('flow.run'),
    ...appHandlers,
    ...memoryHandlers,
    ...overrides,
  }) as ToolHandlers;

export const makeWorkspace = async (profiles: Readonly<Record<string, Json>>): Promise<Workspace> => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tesseract-handlers-app-'));
  await fs.mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
  for (const [name, profile] of Object.entries(profiles)) {
    await fs.writeFile(path.join(root, '.tesseract', 'profiles', `${name}.json`), JSON.stringify({ name, ...profile }, null, 2));
  }
  return loadWorkspace(root, {});
};

export interface Harness {
  readonly workspace: Workspace;
  readonly runtime: Runtime;
  readonly call: <N extends ToolName>(name: N, input: ToolInput<N>) => Promise<ToolOutput<N>>;
  /** The error family of a call expected to fail. */
  readonly failure: (name: ToolName, input: unknown) => Promise<{ readonly family: string; readonly message: string }>;
  readonly close: () => Promise<void>;
}

export const makeHarness = (workspace: Workspace, overrides: Partial<ToolHandlers> = {}, env: NodeJS.ProcessEnv = {}): Harness => {
  const browser = createBrowserPool({ userAgentSuffix: workspace.config.userAgentSuffix, headless: true, root: workspace.paths.root });
  const runtime = createRuntime({ workspace, browser, handlers: handlersWith(overrides), env, session: 'test-session', log: () => undefined });
  return {
    workspace,
    runtime,
    call: (name, input) => runtime.ctx.call(name, input),
    failure: async (name, input) => {
      const result = await runtime.invoke(name, input);
      if (result.ok) throw new Error(`${name} was expected to fail but returned ${JSON.stringify(result.output).slice(0, 300)}`);
      return { family: result.error.family, message: result.error.message };
    },
    close: () => runtime.close(),
  };
};

export const readAuthoringReceipts = async (workspace: Workspace): Promise<string> =>
  fs.readFile(workspace.paths.authoringReceipts, 'utf8').catch(() => '');

export const removeWorkspace = async (workspace: Workspace): Promise<void> => {
  await fs.rm(workspace.paths.root, { recursive: true, force: true });
};

/** The ref of the candidate with this role and name; throws listing what is there. */
export const refOf = (snapshot: { readonly candidates: readonly { readonly ref: string; readonly role: string; readonly name: string }[] }, role: string, name: string | RegExp): string => {
  const found = snapshot.candidates.find((c) => c.role === role && (typeof name === 'string' ? c.name === name : name.test(c.name)));
  if (found === undefined) throw new Error(`no ${role} ${String(name)} in ${JSON.stringify(snapshot.candidates.map((c) => [c.ref, c.role, c.name]))}`);
  return found.ref;
};

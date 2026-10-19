/**
 * flow.record and flow.run end to end against the OutSystems-shaped fixture
 * app in real Chromium: a QA-style login is recorded while Playwright
 * drives the page, becomes three candidate facets on the login screen with
 * the recording as provenance, a secret parameter for the password (never
 * written anywhere), and flows/login.ts + pages/login.page.ts that compile;
 * the recording then replays with the password from the environment.
 */
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ToolOutput } from '../../../src/contract/tools.js';
import { readJson } from '../../../src/core/fsio.js';
import { waitForRecording, loadRecording } from '../../../src/flow/index.js';
import { findFacet, loadScreen } from '../../../src/memory/index.js';
import { awaitHydration } from '../../../src/observe/index.js';
import type { Runtime } from '../../../src/tools/runtime.js';
import { loadProfile } from '../../../src/workspace/profiles.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { flowRuntime, grep, pageOpenedBy, removeWorkspace, tempWorkspace, writeProfile } from './helpers.js';

const run = promisify(execFile);
const require = createRequire(import.meta.url);
const v2Root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const tscBin = require.resolve('typescript/bin/tsc');

const SECRET = 'correct-horse';

let app: FixtureApp;
let workspace: Workspace;
let runtime: Runtime;
const env: NodeJS.ProcessEnv = {};

beforeAll(async () => {
  app = await startFixtureApp();
  workspace = await tempWorkspace();
  await writeProfile(workspace, 'qa', { baseURL: app.baseURL });
  runtime = flowRuntime(workspace, env);
});

afterAll(async () => {
  await runtime.close();
  await app.close();
  await removeWorkspace(workspace);
});

const ok = <T>(result: Awaited<ReturnType<Runtime['invoke']>>): T => {
  if (!result.ok) throw new Error(`${result.error.family}: ${result.error.message}`);
  return result.output as T;
};

describe('flow.record: a login walked once', () => {
  let recorded: ToolOutput<'flow.record'>;

  it('records fills and the click until the URL changes', async () => {
    const profile = await loadProfile(workspace, 'qa', {});
    const handle = await runtime.ctx.browser.open({ url: `${app.baseURL}Login`, profile });
    await awaitHydration(handle.page, { budgetMs: 5_000 });
    const pending = runtime.invoke('flow.record', { name: 'login', pageId: handle.pageId, stopOn: 'urlChange', timeoutMs: 60_000 });
    await waitForRecording(handle.page);
    await handle.page.fill('#b2-Input_Username', 'qa.user');
    await handle.page.fill('#b2-Input_Password', SECRET);
    await handle.page.getByRole('button', { name: 'Log in' }).click();
    recorded = ok<ToolOutput<'flow.record'>>(await pending);

    expect(recorded.stoppedBy).toBe('urlChange');
    expect([...recorded.facetsMinted].sort()).toEqual(['login:log-in', 'login:password', 'login:username']);
    expect(recorded.params).toEqual(['username', 'password']);
    expect(recorded.steps.map((s) => [s.action, s.facetId ?? null, s.value ?? null])).toEqual([
      ['navigate', null, null],
      ['fill', 'login:username', '{username}'],
      ['fill', 'login:password', '{password}'],
      ['click', 'login:log-in', null],
    ]);
    expect(recorded.steps.every((s) => s.url === 'Login')).toBe(true);
    expect(recorded.flowPath).toBe('flows/login.ts');
    expect(recorded.recordingPath).toBe('.tesseract/flows/login.json');
  }, 90_000);

  it('writes the recording in the contract shape, the password as a secret parameter without a default', async () => {
    const recording = await loadRecording(workspace, 'login');
    expect(recording.startUrl).toBe('Login');
    expect(recording.session).toBe('s-flow-test');
    expect(recording.params).toEqual([
      { name: 'username', secret: false, default: 'qa.user' },
      { name: 'password', secret: true },
    ]);
    expect(recording.steps[2]?.value).toEqual({ param: 'password', secret: true });
    expect(recording.steps[0]).toMatchObject({ index: 1, action: 'navigate', screen: 'login', url: 'Login' });
    // The click on Log in navigated; replay must wait for PolicySearch instead of racing it.
    expect(recording.steps[recording.steps.length - 1]).toMatchObject({ action: 'click', navigatesTo: 'PolicySearch' });
    expect(recording.steps.slice(1).every((s) => s.snapshotId !== undefined)).toBe(true);
  });

  it('mints each control as a candidate facet with the recording as provenance', async () => {
    for (const id of ['login:username', 'login:password', 'login:log-in']) {
      const facet = await findFacet(workspace, id);
      expect(facet, id).not.toBeNull();
      expect(facet!.status).toBe('candidate');
      expect(facet!.provenance).toMatchObject({ instrument: 'flow.record', flow: 'login', session: 's-flow-test' });
      expect(facet!.provenance.snapshotId).toBeDefined();
      expect(facet!.locators.length).toBeGreaterThan(0);
    }
    expect((await findFacet(workspace, 'login:log-in'))!.role).toBe('button');
    const screen = await loadScreen(workspace, 'login');
    expect(screen.catalog.route?.url).toBe('Login');
    expect(screen.catalog.route?.summary?.landmarks).toContain('main');
  });

  it('emits flows/login.ts over the page object, reading the password from the environment', async () => {
    const flow = await fs.readFile(path.join(workspace.paths.root, 'flows/login.ts'), 'utf8');
    const page = await fs.readFile(path.join(workspace.paths.root, 'pages/login.page.ts'), 'utf8');
    expect(flow).toContain("import { LoginPage } from '../pages/login.page';");
    expect(flow).toContain('export async function login(page: Page, params: LoginParams)');
    expect(flow).toContain('await loginPage.goto();');
    expect(flow).toContain('await loginPage.username.fill(params.username);');
    expect(flow).toContain('await loginPage.password.fill(params.password);');
    expect(flow).toContain('await loginPage.logIn.click();');
    expect(page).toContain('export class LoginPage');
    expect(page).toContain("await this.page.goto('Login');");
    expect(page).toContain("await this.page.getByRole('main').waitFor();");
  });

  it('emits files that type-check under a strict customer tsconfig', async () => {
    await fs.mkdir(path.join(v2Root, '.tmp'), { recursive: true });
    const dir = await fs.mkdtemp(path.join(v2Root, '.tmp', 'flow-compile-'));
    try {
      await fs.cp(path.join(workspace.paths.root, 'flows'), path.join(dir, 'flows'), { recursive: true });
      await fs.cp(path.join(workspace.paths.root, 'pages'), path.join(dir, 'pages'), { recursive: true });
      await fs.writeFile(path.join(dir, 'package.json'), '{ "private": true, "type": "module" }\n');
      await fs.writeFile(
        path.join(dir, 'tsconfig.json'),
        `${JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'ESNext',
            moduleResolution: 'Bundler',
            strict: true,
            noUncheckedIndexedAccess: true,
            noUnusedLocals: true,
            noUnusedParameters: true,
            exactOptionalPropertyTypes: true,
            verbatimModuleSyntax: true,
            types: ['node'],
            skipLibCheck: true,
            noEmit: true,
          },
          include: ['flows/**/*.ts', 'pages/**/*.ts'],
        }, null, 2)}\n`,
      );
      const outcome = await run(process.execPath, [tscBin, '-p', path.join(dir, 'tsconfig.json')], { cwd: dir }).then(
        () => '',
        (error: { stdout?: string; stderr?: string }) => `${error.stdout ?? ''}${error.stderr ?? ''}`,
      );
      expect(outcome).toBe('');
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('flow.run: the login replayed with no model in the loop', () => {
  it('lands on PolicySearch with the password from TESSERACT_PARAM_PASSWORD', async () => {
    env['TESSERACT_PARAM_PASSWORD'] = SECRET;
    try {
      const out = ok<ToolOutput<'flow.run'>>(await runtime.invoke('flow.run', { name: 'login', profile: 'qa' }));
      expect(out.outcome).toBe('passed');
      expect(out.finalUrl).toBe(`${app.baseURL}PolicySearch`);
      expect(out.title).toBe('Policy Search');
      await runtime.ctx.browser.close(out.pageId);
    } finally {
      delete env['TESSERACT_PARAM_PASSWORD'];
    }
  }, 60_000);

  it('records the replay as evidence for each facet it used', async () => {
    const lines = (await fs.readFile(path.join(workspace.paths.evidence, 'login.jsonl'), 'utf8').catch(() => ''))
      .split('\n')
      .filter((line) => line.includes('"source":"flow"'));
    expect(lines.length).toBeGreaterThanOrEqual(3);
  });

  it('is not-configured when the secret has no value, naming the variable', async () => {
    const result = await runtime.invoke('flow.run', { name: 'login', profile: 'qa' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.family).toBe('not-configured');
    expect(result.error.message).toContain('TESSERACT_PARAM_PASSWORD');
  });

  it('takes the secret from params and keeps it out of the authoring receipt', async () => {
    const out = ok<ToolOutput<'flow.run'>>(await runtime.invoke('flow.run', { name: 'login', profile: 'qa', params: { password: SECRET } }));
    expect(out.outcome).toBe('passed');
    await runtime.ctx.browser.close(out.pageId);
    const receipts = await fs.readFile(workspace.paths.authoringReceipts, 'utf8');
    const last = JSON.parse(receipts.trim().split('\n').pop()!) as { readonly tool: string; readonly input: { readonly params: unknown } };
    expect(last.tool).toBe('flow.run');
    expect(last.input.params).toBe('<secret>');
  }, 60_000);

  it('fails at the step whose facet no longer resolves, with its family', async () => {
    const file = path.join(workspace.paths.recordings, 'login.json');
    const recording = (await readJson<Record<string, unknown>>(file))!;
    await fs.writeFile(path.join(workspace.paths.recordings, 'broken.json'), JSON.stringify({
      ...recording,
      name: 'broken',
      steps: [...(recording['steps'] as unknown[]), { index: 5, action: 'click', facetId: 'login:no-such-button', screen: 'login', url: 'Login' }],
    }));
    env['TESSERACT_PARAM_PASSWORD'] = SECRET;
    try {
      const out = ok<ToolOutput<'flow.run'>>(await runtime.invoke('flow.run', { name: 'broken', profile: 'qa' }));
      expect(out.outcome).toBe('failed');
      expect(out.failedStep).toBe(5);
      expect(out.errorFamily).toBe('not-found');
      await runtime.ctx.browser.close(out.pageId);
    } finally {
      delete env['TESSERACT_PARAM_PASSWORD'];
    }
  }, 60_000);

  it('is not-found for a flow that was never recorded', async () => {
    const result = await runtime.invoke('flow.run', { name: 'checkout', profile: 'qa' });
    expect(result.ok ? null : result.error.family).toBe('not-found');
  });
});

describe('flow.record: stopOn steps on a page it opens itself', () => {
  it('stops after maxSteps actions, reuses the facets it already knows, and closes its page', async () => {
    const pending = runtime.invoke('flow.record', { name: 'login-fields', url: 'Login', profile: 'qa', stopOn: 'steps', maxSteps: 2, timeoutMs: 60_000 });
    const page = await pageOpenedBy(runtime, '/PolicyApp/Login');
    await waitForRecording(page);
    await page.fill('#b2-Input_Username', 'qa.user');
    await page.fill('#b2-Input_Password', 'another-secret');
    // No blur, no click: the idle flush reports the password, which is the second action.
    const out = ok<ToolOutput<'flow.record'>>(await pending);
    expect(out.stoppedBy).toBe('steps');
    expect(out.steps.map((s) => s.action)).toEqual(['navigate', 'fill', 'fill']);
    expect(out.facetsMinted).toEqual([]);
    expect(out.steps.slice(1).map((s) => s.facetId)).toEqual(['login:username', 'login:password']);
    expect(page.isClosed()).toBe(true);
  }, 60_000);
});

describe('secrets', () => {
  it('are never written into the workspace', async () => {
    expect(await grep(workspace.paths.root, SECRET)).toEqual([]);
    expect(await grep(workspace.paths.root, 'another-secret')).toEqual([]);
  });
});

/**
 * The PII gate applies to recordings as to observations: a QA records a
 * login on a page whose URL carries a return address with an email, types
 * an email as the username and picks an email-labelled account, and lands
 * on a URL carrying a session token. None of that reaches the recording,
 * the emitted flow or page object, or any other file: URLs are kept
 * without query or fragment, and PII-shaped values become parameters
 * without a default, supplied at run time through TESSERACT_PARAM_<NAME>.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ToolOutput } from '../../../src/contract/tools.js';
import { loadRecording, waitForRecording } from '../../../src/flow/index.js';
import { awaitHydration } from '../../../src/observe/index.js';
import type { Runtime } from '../../../src/tools/runtime.js';
import { loadProfile } from '../../../src/workspace/profiles.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { html, startServer, type TestServer } from '../observe/helpers.js';
import { flowRuntime, grep, removeWorkspace, tempWorkspace, writeProfile } from './helpers.js';

const EMAIL = 'jane.roe@acme.com';
const TOKEN = 'Zx9kQ7';

const LOGIN = `<!doctype html><html lang="en"><head><title>Sign in</title></head><body>
<main><h1>Sign in</h1>
  <label for="u">Username</label><input id="u" type="text" autocomplete="username">
  <label for="p">Password</label><input id="p" type="password">
  <label for="a">Account</label><select id="a"><option>Choose</option><option>${EMAIL}</option><option>Shared</option></select>
  <button type="button" id="go">Sign in</button>
</main>
<script>
  document.getElementById('go').addEventListener('click', () => {
    setTimeout(() => { location.href = 'Home?sessionToken=${TOKEN}&email=' + encodeURIComponent(document.getElementById('u').value); }, 50);
  });
</script></body></html>`;

const HOME = `<!doctype html><html lang="en"><head><title>Home</title></head><body><main><h1>Home</h1></main></body></html>`;

describe('flow.record keeps PII and query strings out of recordings', () => {
  let server: TestServer;
  let workspace: Workspace;
  let runtime: Runtime;
  let recorded: ToolOutput<'flow.record'>;

  beforeAll(async () => {
    server = await startServer({ '/App/Login': html(LOGIN), '/App/Home': html(HOME) });
    workspace = await tempWorkspace('tesseract-flow-pii-');
    await writeProfile(workspace, 'qa', { baseURL: `${server.url}/App/` });
    runtime = flowRuntime(workspace, {});
  });

  afterAll(async () => {
    await runtime?.close();
    await server?.close();
    if (workspace !== undefined) await removeWorkspace(workspace);
  });

  it('records the login with URLs reduced to their routes and the email values as parameters without defaults', async () => {
    const profile = await loadProfile(workspace, 'qa', {});
    const handle = await runtime.ctx.browser.open({ url: `${server.url}/App/Login?returnUrl=Orders&email=${encodeURIComponent(EMAIL)}#top`, profile });
    await awaitHydration(handle.page, { budgetMs: 3_000 });
    const pending = runtime.invoke('flow.record', { name: 'login', pageId: handle.pageId, stopOn: 'urlChange', timeoutMs: 60_000 });
    await waitForRecording(handle.page);
    await handle.page.fill('#u', EMAIL);
    await handle.page.fill('#p', 'correct-horse');
    await handle.page.selectOption('#a', { label: EMAIL });
    await handle.page.getByRole('button', { name: 'Sign in' }).click();
    const result = await pending;
    if (!result.ok) throw new Error(`${result.error.family}: ${result.error.message}`);
    recorded = result.output as ToolOutput<'flow.record'>;
    expect(recorded.stoppedBy).toBe('urlChange');

    const recording = await loadRecording(workspace, 'login');
    expect(recording.startUrl).toBe('Login');
    expect(recording.steps.every((step) => !step.url.includes('?') && !step.url.includes('#'))).toBe(true);
    expect(recording.steps.find((step) => step.navigatesTo !== undefined)?.navigatesTo).toBe('Home');
    const username = recording.params.find((param) => param.name === 'username');
    expect(username).toEqual({ name: 'username', secret: false });
    const select = recording.steps.find((step) => step.action === 'select');
    expect(select?.value).toMatchObject({ param: expect.any(String) });
    const account = recording.params.find((param) => select?.value !== undefined && 'param' in select.value && param.name === select.value.param);
    expect(account).toEqual({ name: expect.any(String), secret: false });
    expect(recorded.steps.map((step) => step.value ?? null)).not.toContain(EMAIL);
  }, 90_000);

  it('writes the email and the token nowhere in the workspace', async () => {
    for (const needle of [EMAIL, 'jane.roe', encodeURIComponent(EMAIL), TOKEN]) {
      expect(await grep(workspace.paths.root, needle), needle).toEqual([]);
    }
    // Snapshots keep query keys with redacted values (the observe gate); the recording and the code keep no query at all.
    const files = [path.join(workspace.paths.recordings, 'login.json'), path.join(workspace.paths.root, 'flows/login.ts'), path.join(workspace.paths.root, 'pages/login.page.ts')];
    for (const file of files) expect(await fs.readFile(file, 'utf8'), file).not.toMatch(/returnUrl|sessionToken/);
    const flow = await fs.readFile(path.join(workspace.paths.root, 'flows/login.ts'), 'utf8');
    expect(flow).toContain('params.username');
  });

  it('replays only with the value supplied at run time, through TESSERACT_PARAM_USERNAME', async () => {
    const missing = await runtime.invoke('flow.run', { name: 'login', profile: 'qa' });
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.family).toBe('not-configured');
      expect(missing.error.message).toContain('TESSERACT_PARAM_USERNAME');
    }
  });
});

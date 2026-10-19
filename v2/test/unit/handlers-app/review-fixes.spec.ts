/**
 * Review fixes in the app.* and memory.* handlers, through the runtime (so
 * authoring receipts are written as in production), real Chromium, the
 * OutSystems-shaped fixture app, and a few purpose-built pages:
 *
 * - secrets: a password typed into a field that renders late, a password
 *   read back by app.assert, and values that came from params never reach
 *   a receipt, an output, or the evidence log;
 * - the evidence log's detail is PII-gated;
 * - app.open and flow.run gate the title and final URL, and a failed
 *   attach does not list the user's tabs;
 * - memory.mint's provenance instrument comes from what app.act did;
 * - app.open never reports the $TESSERACT_BASE_URL stand-in as a profile.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { flowHandlers } from '../../../src/tools/handlers/flow.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { freePort } from '../act/fixtures.js';
import { html, startServer, type TestServer } from '../observe/helpers.js';
import { makeHarness, makeWorkspace, readAuthoringReceipts, refOf, removeWorkspace, type Harness } from './helpers.js';

const SECRET = 'Hunter2-Secret';
const EMAIL = 'john.doe@acme.com';

const TWO_STEP = `<!doctype html><html lang="en"><head><title>Two-step sign in</title></head><body>
<main><h1>Sign in</h1>
  <label for="u">Username</label><input id="u" type="text">
  <button id="next" type="button">Next</button>
  <div id="step2"></div>
</main>
<script>
  document.getElementById('next').addEventListener('click', () => setTimeout(() => {
    document.getElementById('step2').innerHTML = '<label for="p">Password</label><input id="p" type="password">';
  }, 1500));
</script></body></html>`;

const OVERLAID = `<!doctype html><html lang="en"><head><title>Orders</title></head><body>
<main><h1>Orders</h1><button type="button">Save order</button></main>
<div style="position:fixed;inset:0;background:rgba(0,0,0,0.05)">Signed in as ${EMAIL}, card 4111 1111 1111 1111</div>
</body></html>`;

const ACCOUNT = `<!doctype html><html lang="en"><head><title>Account – ${EMAIL}</title></head><body><main><h1>Account</h1></main></body></html>`;

describe('handler review fixes', () => {
  let app: FixtureApp;
  let server: TestServer;
  let workspace: Workspace;
  let h: Harness;

  beforeAll(async () => {
    app = await startFixtureApp();
    server = await startServer({ '/App/TwoStep': html(TWO_STEP), '/App/Orders': html(OVERLAID), '/App/Account': html(ACCOUNT) });
    workspace = await makeWorkspace({ qa: { baseURL: app.baseURL }, site: { baseURL: `${server.url}/App/` } });
    h = makeHarness(workspace, { ...flowHandlers });
  });

  afterAll(async () => {
    await h?.close();
    await app?.close();
    await server?.close();
    if (workspace !== undefined) await removeWorkspace(workspace);
  });

  describe('secrets', () => {
    it('keeps a password typed into a field that renders after the target was resolved out of the receipts', async () => {
      const opened = await h.call('app.open', { url: 'TwoStep', profile: 'site' });
      await h.call('app.act', { pageId: opened.pageId, action: 'fill', target: { locator: { strategy: 'label', value: 'Username' } }, value: 'qa.user' });
      await h.call('app.act', { pageId: opened.pageId, action: 'click', target: { locator: { strategy: 'role-name', role: 'button', name: 'Next' } } });
      // The field is not there yet: the fill waits for it (up to its timeout); the secret check happens on the element it reached.
      const filled = await h.call('app.act', { pageId: opened.pageId, action: 'fill', target: { locator: { strategy: 'label', value: 'Password' } }, value: SECRET });
      expect(filled.outcome).toBe('succeeded');
      const receipts = await readAuthoringReceipts(workspace);
      expect(receipts).not.toContain(SECRET);
      expect(receipts).toContain('"value":"<secret>"');
      // A plain field's literal is kept.
      expect(receipts).toContain('"value":"qa.user"');
      await h.runtime.ctx.browser.close(opened.pageId);
    }, 60_000);

    it('never returns or records a password read back by app.assert, nor a value that came from params', async () => {
      const opened = await h.call('app.open', { url: 'Login', profile: 'qa' });
      const { pageId } = opened;
      const snap = await h.call('app.observe', { pageId });
      const password = { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Password') };
      const username = { snapshotId: snap.snapshotId, ref: refOf(snap, 'textbox', 'Username') };
      await h.call('app.act', { pageId, action: 'fill', target: password, value: '@password', params: { password: SECRET } });
      await h.call('app.act', { pageId, action: 'fill', target: username, value: '@user', params: { user: 'qa.person' } });

      const passed = await h.call('app.assert', { pageId, assertion: 'value', target: password, expected: '@password', params: { password: SECRET } });
      expect(passed).toMatchObject({ passed: true, observed: '<secret>' });

      const failed = await h.call('app.assert', { pageId, assertion: 'value', target: password, expected: '@password', params: { password: 'Wrong-Secret-1' }, timeoutMs: 300 });
      expect(failed.passed).toBe(false);
      expect(failed.observed).toBe('<secret>');
      expect(failed.message).toBeDefined();
      expect(failed.message).not.toContain(SECRET);
      expect(failed.message).not.toContain('Wrong-Secret-1');

      // A literal expected on a password field (the playbook says params; this one did not) is masked as well.
      const literal = await h.call('app.assert', { pageId, assertion: 'value', target: { locator: { strategy: 'label', value: 'Password' } }, expected: 'Other-Literal-9', timeoutMs: 300 });
      expect(literal.passed).toBe(false);
      expect(JSON.stringify(literal)).not.toContain('Other-Literal-9');
      expect(JSON.stringify(literal)).not.toContain(SECRET);

      // A plain field whose expected value came from params: the value is masked where it shows.
      const user = await h.call('app.assert', { pageId, assertion: 'value', target: username, expected: '@user', params: { user: 'qa.person' } });
      expect(user).toMatchObject({ passed: true, observed: '<secret>' });

      const receipts = await readAuthoringReceipts(workspace);
      for (const secret of [SECRET, 'Wrong-Secret-1', 'Other-Literal-9', 'qa.person']) expect(receipts, secret).not.toContain(secret);
      await h.runtime.ctx.browser.close(pageId);
    }, 60_000);
  });

  it('PII-gates the detail written to the evidence log', async () => {
    const opened = await h.call('app.open', { url: 'Orders', profile: 'site' });
    const snap = await h.call('app.observe', { pageId: opened.pageId });
    const minted = await h.call('memory.mint', {
      screen: 'orders', facet: { name: 'save', kind: 'element', displayName: 'Save order button' }, evidence: { snapshotId: snap.snapshotId, ref: refOf(snap, 'button', 'Save order') },
    });
    const clicked = await h.call('app.act', { pageId: opened.pageId, action: 'click', target: { facetId: minted.facet.id }, timeoutMs: 1_500 });
    expect(clicked).toMatchObject({ outcome: 'failed', errorFamily: 'not-visible' });
    const evidence = await fs.readFile(path.join(workspace.paths.evidence, 'orders.jsonl'), 'utf8');
    expect(evidence).toMatch(/intercepts pointer events/);
    expect(evidence).not.toContain(EMAIL);
    expect(evidence).not.toContain('4111 1111 1111');
    expect(evidence).toContain('<email>');
    await h.runtime.ctx.browser.close(opened.pageId);
  }, 60_000);

  describe('titles, final URLs and attach errors', () => {
    const landing = (): string => `${server.url}/App/Account?code=abc123def&email=${encodeURIComponent(EMAIL)}`;

    it('app.open gates the title and the final URL', async () => {
      const opened = await h.call('app.open', { url: landing() });
      expect(opened.title).toBe('Account – <email>');
      expect(opened.finalUrl).toBe(`${server.url}/App/Account?code=<redacted>&email=<redacted>`);
      expect(JSON.stringify(opened)).not.toContain('abc123def');
      await h.runtime.ctx.browser.close(opened.pageId);
    });

    it('flow.run gates the title and the final URL', async () => {
      await fs.mkdir(workspace.paths.recordings, { recursive: true });
      await fs.writeFile(
        path.join(workspace.paths.recordings, 'land.json'),
        JSON.stringify({ name: 'land', steps: [{ index: 1, action: 'navigate', screen: 'account-landing', url: landing() }], params: [] }),
      );
      const ran = await h.call('flow.run', { name: 'land' });
      expect(ran.outcome).toBe('passed');
      expect(ran.title).toBe('Account – <email>');
      expect(ran.finalUrl).toBe(`${server.url}/App/Account?code=<redacted>&email=<redacted>`);
      await h.runtime.ctx.browser.close(ran.pageId);
    });

    describe('attach', () => {
      let external: Browser;
      let endpoint = '';

      beforeAll(async () => {
        const port = await freePort();
        external = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
        const page = await (await external.newContext()).newPage();
        await page.goto(landing());
        endpoint = `http://127.0.0.1:${port}`;
      });

      afterAll(async () => {
        await external?.close();
      });

      it('reports how many tabs are open, never their URLs', async () => {
        const result = await h.runtime.invoke('app.open', { attach: { cdpEndpoint: endpoint, urlContains: 'NoSuchScreen' } });
        expect(result.ok).toBe(false);
        if (result.ok) return;
        expect(result.error.family).toBe('not-found');
        expect(result.error.detail).toMatchObject({ urlContains: 'NoSuchScreen', openPages: 1 });
        expect(JSON.stringify(result.error)).not.toContain('abc123def');
        expect(JSON.stringify(result.error)).not.toContain('Account?');
      });
    });
  });

  it('memory.mint records app.act as the instrument only for a candidate app.act acted on, whatever decision says', async () => {
    const opened = await h.call('app.open', { url: 'Login', profile: 'qa' });
    const snap = await h.call('app.observe', { pageId: opened.pageId });
    const username = refOf(snap, 'textbox', 'Username');
    const heading = refOf(snap, 'heading', 'Sign in');
    await h.call('app.act', { pageId: opened.pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: username }, value: 'qa.user' });

    const acted = await h.call('memory.mint', { screen: 'login', facet: { name: 'username', kind: 'element', displayName: 'Username field' }, evidence: { snapshotId: snap.snapshotId, ref: username } });
    expect(acted.facet.provenance.instrument).toBe('app.act');
    const observedOnly = await h.call('memory.mint', {
      screen: 'login', facet: { name: 'heading', kind: 'element', displayName: 'Sign in heading' }, evidence: { snapshotId: snap.snapshotId, ref: heading },
      decision: { reason: 'matches the step wording' },
    });
    expect(observedOnly.facet.provenance.instrument).toBe('app.observe');
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  describe('the $TESSERACT_BASE_URL stand-in profile', () => {
    it('is not reported as a profile name; a real profile called env is', async () => {
      const ci = makeHarness(workspace, {}, { TESSERACT_BASE_URL: app.baseURL });
      try {
        const opened = await ci.call('app.open', { url: 'Login' });
        expect(opened.finalUrl).toBe(`${app.baseURL}Login`);
        expect(opened).not.toHaveProperty('profile');
        const again = await ci.call('app.open', { pageId: opened.pageId, url: 'Login' });
        expect(again).not.toHaveProperty('profile');
      } finally {
        await ci.close();
      }
      await fs.writeFile(path.join(workspace.paths.profiles, 'env.json'), JSON.stringify({ name: 'env', baseURL: app.baseURL }));
      const named = makeHarness(workspace, {}, { TESSERACT_PROFILE: 'env' });
      try {
        expect((await named.call('app.open', { url: 'Login' })).profile).toBe('env');
      } finally {
        await named.close();
      }
    });
  });
});

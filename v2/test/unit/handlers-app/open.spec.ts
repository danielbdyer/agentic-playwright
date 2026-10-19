/**
 * app.open's authentication modes and attach, and memory.preflight opening
 * (and closing) its own page with the profile: real Chromium, the fixture
 * app, and a stub flow.run that logs in the way a recorded flow would.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { freePort } from '../act/fixtures.js';
import { mintFacet, setRoute } from '../../../src/memory/index.js';
import type { Candidate } from '../../../src/contract/schemas.js';
import type { ToolHandler } from '../../../src/tools/types.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { makeHarness, makeWorkspace, removeWorkspace, type Harness } from './helpers.js';

/** A stand-in for the flow library: logs in on the given page the way the recorded login flow does. */
const loginFlowRun: ToolHandler<'flow.run'> = async (input, ctx) => {
  const started = Date.now();
  const handle = ctx.browser.get(input.pageId!);
  const { page } = handle;
  if (input.name !== 'login') return { pageId: handle.pageId, outcome: 'failed', failedStep: 1, errorFamily: 'not-found', message: `no flow ${input.name}`, finalUrl: page.url(), title: '', durationMs: 0 };
  await page.goto(new URL('Login', page.url()).toString());
  await page.getByLabel('Username').fill(ctx.env.TESSERACT_PARAM_USERNAME ?? '');
  await page.getByLabel('Password').fill(ctx.env.TESSERACT_PARAM_PASSWORD ?? '');
  await page.getByRole('button', { name: 'Log in' }).click();
  return { pageId: handle.pageId, outcome: 'passed', finalUrl: page.url(), title: await page.title(), durationMs: Date.now() - started };
};

const failingFlowRun: ToolHandler<'flow.run'> = async (input, ctx) => {
  const handle = ctx.browser.get(input.pageId!);
  return { pageId: handle.pageId, outcome: 'failed', failedStep: 3, errorFamily: 'not-visible', message: 'button Log in is hidden', finalUrl: handle.page.url(), title: '', durationMs: 5 };
};

const RECORDING = { name: 'login', startUrl: 'Login', steps: [{ index: 1, action: 'fill', facetId: 'login:username', screen: 'login', url: 'Login', value: { param: 'username' } }], params: [{ name: 'username', secret: false }] };

const candidate = (overrides: Partial<Candidate>): Candidate => ({
  ref: 'c1', role: 'heading', name: 'Policy Search', namingSource: 'content', affordance: 'none', interactive: false, tag: 'h1', landmark: 'main',
  visible: true, enabled: true, inViewport: true, ...overrides,
});

describe('app.open authentication, attach, and preflight with its own page', () => {
  let app: FixtureApp;
  let workspace: Workspace;
  let h: Harness;
  const env = { TESSERACT_PARAM_USERNAME: 'qa.user', TESSERACT_PARAM_PASSWORD: 'correct-horse' };

  beforeAll(async () => {
    app = await startFixtureApp();
    workspace = await makeWorkspace({
      plain: { baseURL: '' },
      flowed: { baseURL: '', loginFlow: 'login' },
      stored: { baseURL: '', storageStatePath: '.tesseract/auth/stored.json' },
      broken: { baseURL: '', loginFlow: 'broken' },
    });
    // Profiles need the fixture's port: rewrite them now that it is known.
    for (const name of ['plain', 'flowed', 'stored', 'broken']) {
      const file = path.join(workspace.paths.profiles, `${name}.json`);
      const profile = JSON.parse(await fs.readFile(file, 'utf8')) as Record<string, unknown>;
      await fs.writeFile(file, JSON.stringify({ ...profile, baseURL: app.baseURL }));
    }
    await fs.mkdir(workspace.paths.recordings, { recursive: true });
    await fs.writeFile(path.join(workspace.paths.recordings, 'login.json'), JSON.stringify(RECORDING));
    await fs.writeFile(path.join(workspace.paths.recordings, 'broken.json'), JSON.stringify({ ...RECORDING, name: 'broken' }));
    h = makeHarness(workspace, { 'flow.run': loginFlowRun }, env);
  });

  afterAll(async () => {
    await h?.close();
    await app?.close();
    if (workspace !== undefined) await removeWorkspace(workspace);
  });

  it('defaults to the login flow when the profile names one, and lands on the asked-for url', async () => {
    const opened = await h.call('app.open', { profile: 'flowed', url: 'PolicySearch' });
    expect(opened.finalUrl).toBe(`${app.baseURL}PolicySearch`);
    expect(opened.title).toBe('Policy Search');
    expect(opened.hydration.settled).toBe(true);
    // The nested flow.run went through the receipts path.
    const receipts = await fs.readFile(workspace.paths.authoringReceipts, 'utf8');
    expect(receipts).toMatch(/"tool":"flow\.run"/);
    expect(receipts).not.toContain('correct-horse');

    // Save the signed-in session for the storage-state profile.
    const handle = h.runtime.ctx.browser.get(opened.pageId);
    await fs.mkdir(path.join(workspace.paths.root, '.tesseract', 'auth'), { recursive: true });
    await handle.context.storageState({ path: path.join(workspace.paths.root, '.tesseract', 'auth', 'stored.json') });
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  it('auth none on a protected route lands where the app sends it', async () => {
    const opened = await h.call('app.open', { profile: 'plain', url: 'PolicySearch', auth: 'none' });
    expect(opened.finalUrl).toBe(`${app.baseURL}Login`);
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  it('opens with the saved storage state', async () => {
    const opened = await h.call('app.open', { profile: 'stored', url: 'PolicySearch' });
    expect(opened.finalUrl).toBe(`${app.baseURL}PolicySearch`);
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  it('explains how to create a missing storage state, and how to configure a missing login flow', async () => {
    await fs.rename(path.join(workspace.paths.root, '.tesseract', 'auth', 'stored.json'), path.join(workspace.paths.root, '.tesseract', 'auth', 'moved.json'));
    try {
      const missing = await h.failure('app.open', { profile: 'stored', url: 'PolicySearch' });
      expect(missing.family).toBe('not-configured');
      expect(missing.message).toMatch(/codegen --save-storage=\.tesseract\/auth\/stored\.json/);
    } finally {
      await fs.rename(path.join(workspace.paths.root, '.tesseract', 'auth', 'moved.json'), path.join(workspace.paths.root, '.tesseract', 'auth', 'stored.json'));
    }
    const noFlow = await h.failure('app.open', { profile: 'plain', auth: 'flow' });
    expect(noFlow.family).toBe('not-configured');
    expect(noFlow.message).toMatch(/loginFlow/);
    const noStorage = await h.failure('app.open', { profile: 'plain', auth: 'storage-state' });
    expect(noStorage.family).toBe('not-configured');
    expect((await h.failure('app.open', { profile: 'nobody' })).family).toBe('not-configured');
    expect((await h.failure('app.open', {})).family).toBe('invalid-input');
    expect(h.runtime.ctx.browser.list()).toHaveLength(0);
  });

  it('a failing login flow closes its page and reports the failing step', async () => {
    const failing = makeHarness(workspace, { 'flow.run': failingFlowRun }, env);
    try {
      const failure = await failing.failure('app.open', { profile: 'flowed', url: 'PolicySearch' });
      expect(failure.family).toBe('unclassified');
      expect(failure.message).toMatch(/login flow "login" failed: button Log in is hidden at step 3/);
      expect(failing.runtime.ctx.browser.list()).toHaveLength(0);
    } finally {
      await failing.close();
    }
  });

  it('navigates an existing page by pageId', async () => {
    const opened = await h.call('app.open', { profile: 'stored', url: 'PolicySearch' });
    const moved = await h.call('app.open', { pageId: opened.pageId, url: 'Claims' });
    expect(moved).toMatchObject({ pageId: opened.pageId, finalUrl: `${app.baseURL}Claims`, title: 'Claims', profile: 'stored' });
    expect((await h.failure('app.open', { pageId: opened.pageId, url: 'Claims', auth: 'storage-state' })).family).toBe('invalid-input');
    await h.runtime.ctx.browser.close(opened.pageId);
  });

  describe('attach over CDP', () => {
    let external: Browser;
    let endpoint = '';

    beforeAll(async () => {
      const port = await freePort();
      external = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
      const page = await (await external.newContext()).newPage();
      await page.goto(`${app.baseURL}Login`);
      // A QA's browser shows a hydrated page; attach does not wait for one.
      await page.getByLabel('Username').waitFor();
      endpoint = `http://127.0.0.1:${port}`;
    });

    afterAll(async () => {
      await external?.close();
    });

    it('joins the running browser without navigating, and observes and acts on its page', async () => {
      const attached = await h.call('app.open', { attach: { cdpEndpoint: endpoint, urlContains: 'Login' } });
      expect(attached).toMatchObject({ attached: true, finalUrl: `${app.baseURL}Login`, hydration: { reason: 'attached', elapsedMs: 0 } });
      const snap = await h.call('app.observe', { pageId: attached.pageId });
      expect(snap.candidates.some((c) => c.role === 'textbox' && c.name === 'Username')).toBe(true);
      const filled = await h.call('app.act', { pageId: attached.pageId, action: 'fill', target: { locator: { strategy: 'label', value: 'Username' } }, value: 'someone' });
      expect(filled).toMatchObject({ outcome: 'succeeded', resolved: { verified: true } });
      expect(await external.contexts()[0]!.pages()[0]!.locator('#b2-Input_Username').inputValue()).toBe('someone');
      // Closing the attached page only disconnects: the QA's browser keeps running.
      await h.runtime.ctx.browser.close(attached.pageId);
      expect(external.isConnected()).toBe(true);
    });

    it('reports an attach with no matching page as not-found', async () => {
      expect((await h.failure('app.open', { attach: { cdpEndpoint: endpoint, urlContains: 'NoSuchScreen' } })).family).toBe('not-found');
    });
  });

  describe('memory.preflight with its own page', () => {
    beforeAll(async () => {
      const record = { snapshotId: 'snap-seed', pii: 'standard' } as const;
      await mintFacet(workspace, {
        screen: 'policy-search', draft: { name: 'heading', displayName: 'Policy Search heading', locator: { strategy: 'role-name', role: 'heading', name: 'Policy Search', scope: { landmark: 'main' } } },
        candidate: candidate({}), snapshotId: record.snapshotId, provenance: { instrument: 'human' },
      });
      await mintFacet(workspace, {
        screen: 'policy-search', draft: { name: 'search-button', displayName: 'Search button', locator: { strategy: 'role-name', role: 'button', name: 'Search' } },
        candidate: candidate({ ref: 'c2', role: 'button', name: 'Search', tag: 'button', interactive: true, landmark: 'search' }), snapshotId: record.snapshotId, provenance: { instrument: 'human' },
      });
      await setRoute(workspace, 'policy-search', { url: 'PolicySearch' });
      await mintFacet(workspace, {
        screen: 'claims', draft: { name: 'status', displayName: 'Claim status', locator: { strategy: 'label', value: 'Claim status' } },
        candidate: candidate({ role: 'combobox', name: 'Claim status', tag: 'select', interactive: true }), snapshotId: record.snapshotId, provenance: { instrument: 'human' },
      });
      await setRoute(workspace, 'claims', { url: 'Claims' });
      await mintFacet(workspace, {
        screen: 'dashboard', draft: { name: 'title', displayName: 'Dashboard title', locator: { strategy: 'role-name', role: 'heading', name: 'Dashboard' } },
        candidate: candidate({ name: 'Dashboard' }), snapshotId: record.snapshotId, provenance: { instrument: 'human' },
      });
    });

    it('checks every screen with a route on one page it opens with the profile, then closes it', async () => {
      const before = h.runtime.ctx.browser.list().length;
      const result = await h.call('memory.preflight', { profile: 'stored' });
      expect(result.screens.map((s) => [s.screen, s.status])).toEqual([
        ['claims', 'ok'],
        ['policy-search', 'ok'],
      ]);
      expect(result.summary).toMatchObject({ ok: 3, stale: 0, missing: 0 });
      expect(h.runtime.ctx.browser.list().length).toBe(before);
    });

    it('reports a screen without a route, and a redirect to login as unreachable', async () => {
      const noRoute = await h.call('memory.preflight', { screen: 'dashboard', profile: 'stored' });
      expect(noRoute.screens[0]).toMatchObject({ screen: 'dashboard', status: 'no-route', facets: [{ id: 'dashboard:title', status: 'unchecked' }] });

      const unauthenticated = await h.call('memory.preflight', { screen: 'claims', profile: 'plain' });
      expect(unauthenticated.screens[0]).toMatchObject({ screen: 'claims', status: 'unreachable', facets: [{ id: 'claims:status', status: 'unchecked' }] });
      expect(unauthenticated.screens[0]?.detail).toMatch(/redirected to .*\/PolicyApp\/Login/);
      expect(unauthenticated.summary.unchecked).toBe(1);

      expect((await h.failure('memory.preflight', { screen: 'never-seen', profile: 'stored' })).family).toBe('not-found');
    });

    it('judges a named flow by the facets it references', async () => {
      await fs.writeFile(
        path.join(workspace.paths.recordings, 'search.json'),
        JSON.stringify({ name: 'search', steps: [{ index: 1, action: 'click', facetId: 'policy-search:search-button', screen: 'policy-search', url: 'PolicySearch' }], params: [] }),
      );
      const result = await h.call('memory.preflight', { screen: 'policy-search', profile: 'stored', flows: ['search', 'login', 'ghost'] });
      expect(result.flows).toEqual([
        { id: 'search', status: 'ok' },
        expect.objectContaining({ id: 'login', status: 'unchecked' }),
        expect.objectContaining({ id: 'ghost', status: 'missing' }),
      ]);
    });

    it('unreachable when the app is down', async () => {
      const down = await makeWorkspace({ gone: { baseURL: `http://127.0.0.1:${await freePort()}/PolicyApp/` } });
      const dh = makeHarness(down);
      try {
        await setRoute(down, 'claims', { url: 'Claims' });
        await mintFacet(down, {
          screen: 'claims', draft: { name: 'status', displayName: 'Claim status', locator: { strategy: 'label', value: 'Claim status' } },
          candidate: candidate({ role: 'combobox', name: 'Claim status', tag: 'select', interactive: true }), snapshotId: 'snap-seed', provenance: { instrument: 'human' },
        });
        const result = await dh.call('memory.preflight', { profile: 'gone' });
        expect(result.screens[0]).toMatchObject({ screen: 'claims', status: 'unreachable' });
        expect(result.screens[0]?.detail).toMatch(/ERR_CONNECTION_REFUSED|unreachable/);
      } finally {
        await dh.close();
        await removeWorkspace(down);
      }
    });
  });
});

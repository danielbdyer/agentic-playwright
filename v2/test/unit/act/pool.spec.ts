import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from '@playwright/test';
import { ToolError } from '../../../src/core/errors.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import type { Profile } from '../../../src/workspace/profiles.js';
import { createBrowserPool } from '../../../src/browser/pool.js';
import { freePort, hang, html, startServer, type FixtureServer } from './fixtures.js';

const SUFFIX = 'tesseract-qa/2 (+qa-authoring)';

let server: FixtureServer;
let pool: BrowserPool;
let tmp: string;

const familyOf = async (call: () => unknown): Promise<string> => {
  try {
    await call();
  } catch (error) {
    if (error instanceof ToolError) return error.family;
    throw error;
  }
  throw new Error('expected a ToolError');
};

beforeAll(async () => {
  server = await startServer({
    '/': html('<h1>Home</h1>', 'Home'),
    '/app/home': html('<h1>App home</h1>', 'App home'),
    '/app/policies': html('<h1>Policies</h1>', 'Policies'),
    '/set': (_request, response) => {
      response.setHeader('set-cookie', 'sid=abc123; Path=/');
      response.setHeader('content-type', 'text/html');
      response.end(html('<p>cookie set</p>', 'Set'));
    },
    '/read': (request, response) => {
      response.setHeader('content-type', 'text/html');
      response.end(html(`<p id="cookie">${request.headers.cookie ?? '(none)'}</p><p id="ua">${request.headers['user-agent'] ?? ''}</p>`, 'Read'));
    },
    '/hang': hang,
    '/redirect': html('<script>location.replace("/app/home")</script>', 'Redirecting'),
  });
  tmp = await mkdtemp(path.join(os.tmpdir(), 'tesseract-pool-'));
});

afterAll(async () => {
  await server.close();
  await rm(tmp, { recursive: true, force: true });
});

beforeEach(() => {
  pool = createBrowserPool({ userAgentSuffix: SUFFIX, root: tmp, now: () => new Date('2026-10-19T12:00:00Z') });
});

afterEach(async () => {
  await pool.closeAll();
});

const profile = (fields: Partial<Profile> = {}): Profile => ({ name: 'qa', baseURL: server.url, ...fields });

describe('createBrowserPool: launched pages', () => {
  it('opens, gets, lists, and closes pages with ids p1, p2, …', async () => {
    const first = await pool.open({});
    const second = await pool.open({ url: `${server.url}/app/home` });
    expect(first.pageId).toBe('p1');
    expect(second.pageId).toBe('p2');
    expect(first.attached).toBe(false);
    expect(first.openedAt).toBe('2026-10-19T12:00:00.000Z');
    expect(first.page.url()).toBe('about:blank');
    expect(await second.page.title()).toBe('App home');
    expect(pool.get('p2')).toBe(second);
    expect(pool.list().map((handle) => handle.pageId)).toEqual(['p1', 'p2']);
    // One browser for both, one context each.
    expect(first.browser).toBe(second.browser);
    expect(first.context).not.toBe(second.context);

    await pool.close('p1');
    expect(first.page.isClosed()).toBe(true);
    expect(await familyOf(() => pool.get('p1'))).toBe('not-found');
    await pool.close('p1'); // closing twice is fine
    expect(pool.list().map((handle) => handle.pageId)).toEqual(['p2']);
    const third = await pool.open({});
    expect(third.pageId).toBe('p3'); // ids are never reused
  });

  it('launches one browser even when the first opens race', async () => {
    const handles = await Promise.all([pool.open({}), pool.open({}), pool.open({})]);
    expect(new Set(handles.map((handle) => handle.browser)).size).toBe(1);
    expect(new Set(handles.map((handle) => handle.pageId))).toEqual(new Set(['p1', 'p2', 'p3']));
  });

  it('throws not-found for unknown page ids, on get and on close', async () => {
    expect(await familyOf(() => pool.get('p99'))).toBe('not-found');
    expect(await familyOf(() => pool.get('nonsense'))).toBe('not-found');
    expect(await familyOf(() => pool.close('p42'))).toBe('not-found');
  });

  it('detects a page the user closed', async () => {
    const handle = await pool.open({ url: `${server.url}/` });
    await handle.page.close();
    expect(await familyOf(() => pool.get(handle.pageId))).toBe('not-found');
    expect(pool.list()).toEqual([]);
  });

  it('discloses itself in the user agent', async () => {
    const handle = await pool.open({ url: `${server.url}/read` });
    const ua = await handle.page.locator('#ua').textContent();
    expect(ua?.endsWith(` ${SUFFIX}`)).toBe(true);
    expect(ua).toMatch(/Chrome\/\d+/);
  });

  it('applies the default viewport, or the profile viewport, locale, and timezone', async () => {
    const plain = await pool.open({});
    expect(plain.page.viewportSize()).toEqual({ width: 1280, height: 800 });
    const tuned = await pool.open({ profile: profile({ viewport: { width: 1024, height: 700 }, locale: 'pt-PT', timezoneId: 'Europe/Lisbon' }) });
    expect(tuned.page.viewportSize()).toEqual({ width: 1024, height: 700 });
    expect(await tuned.page.evaluate(() => navigator.language)).toBe('pt-PT');
    expect(await tuned.page.evaluate(() => Intl.DateTimeFormat().resolvedOptions().timeZone)).toBe('Europe/Lisbon');
    expect(tuned.profile?.name).toBe('qa');
  });

  it('gives every page its own context: cookies are not shared', async () => {
    const setter = await pool.open({ url: `${server.url}/set` });
    const other = await pool.open({ url: `${server.url}/read` });
    expect(await other.page.locator('#cookie').textContent()).toBe('(none)');
    await pool.navigate(setter.pageId, `${server.url}/read`);
    expect(await setter.page.locator('#cookie').textContent()).toBe('sid=abc123');
  });

  it('loads a storage state: relative to root, or absolute', async () => {
    const state = {
      cookies: [{ name: 'token', value: 'xyz', domain: '127.0.0.1', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Lax' }],
      origins: [],
    };
    await writeFile(path.join(tmp, 'state.json'), JSON.stringify(state));
    const relative = await pool.open({ url: `${server.url}/read`, profile: profile({ storageStatePath: 'state.json' }), useStorageState: true });
    expect(await relative.page.locator('#cookie').textContent()).toBe('token=xyz');
    const absolute = await pool.open({
      url: `${server.url}/read`,
      profile: profile({ storageStatePath: path.join(tmp, 'state.json') }),
      useStorageState: true,
    });
    expect(await absolute.page.locator('#cookie').textContent()).toBe('token=xyz');
    const without = await pool.open({ url: `${server.url}/read`, profile: profile({ storageStatePath: 'state.json' }) });
    expect(await without.page.locator('#cookie').textContent()).toBe('(none)');
  });

  it('not-configured when the storage state is missing or malformed', async () => {
    expect(await familyOf(() => pool.open({ profile: profile({ storageStatePath: 'missing.json' }), useStorageState: true }))).toBe('not-configured');
    expect(await familyOf(() => pool.open({ profile: profile(), useStorageState: true }))).toBe('not-configured');
    expect(await familyOf(() => pool.open({ useStorageState: true }))).toBe('not-configured');
    await writeFile(path.join(tmp, 'broken.json'), '{ not json');
    expect(await familyOf(() => pool.open({ profile: profile({ storageStatePath: 'broken.json' }), useStorageState: true }))).toBe('not-configured');
    expect(pool.list()).toEqual([]);
  });

  it('maps navigation failures and leaves no handle behind', async () => {
    const deadPort = await freePort();
    expect(await familyOf(() => pool.open({ url: `http://127.0.0.1:${deadPort}/` }))).toBe('unavailable');
    expect(await familyOf(() => pool.open({ url: `${server.url}/hang`, navigationTimeoutMs: 500 }))).toBe('timeout');
    expect(await familyOf(() => pool.open({ url: 'PolicySearch' }))).toBe('invalid-input');
    expect(pool.list()).toEqual([]);
    const handle = await pool.open({});
    expect(await familyOf(() => pool.navigate(handle.pageId, `${server.url}/hang`, 500))).toBe('timeout');
    expect(await familyOf(() => pool.navigate('p999', `${server.url}/`))).toBe('not-found');
  });

  it('follows a script redirect (a login bounce) to where the page lands', async () => {
    const handle = await pool.open({ url: `${server.url}/redirect` });
    await handle.page.waitForURL('**/app/home');
    expect(await handle.page.title()).toBe('App home');
  });

  it('logs an HTTP error status without failing the open (observe decides what the page is)', async () => {
    const lines: string[] = [];
    const logged = createBrowserPool({ userAgentSuffix: SUFFIX, log: (line) => lines.push(line) });
    try {
      const handle = await logged.open({ url: `${server.url}/no-such-page` });
      expect(await handle.page.title()).toBe('Not found');
      expect(lines.some((line) => line.includes('HTTP 404'))).toBe(true);
      expect(lines.some((line) => line.includes('launching chromium (headless)'))).toBe(true);
    } finally {
      await logged.closeAll();
    }
  });

  it('navigates an existing page', async () => {
    const handle = await pool.open({ url: `${server.url}/app/home` });
    const same = await pool.navigate(handle.pageId, `${server.url}/app/policies`);
    expect(same).toBe(handle);
    expect(await handle.page.title()).toBe('Policies');
  });

  it('drops handles when the browser dies, and relaunches on the next open', async () => {
    const handle = await pool.open({});
    await handle.browser.close();
    expect(await familyOf(() => pool.get(handle.pageId))).toBe('not-found');
    expect(pool.list()).toEqual([]);
    const next = await pool.open({ url: `${server.url}/` });
    expect(next.browser).not.toBe(handle.browser);
    expect(await next.page.title()).toBe('Home');
  });

  it('closeAll closes launched browsers', async () => {
    const handle = await pool.open({});
    await pool.closeAll();
    expect(handle.browser.isConnected()).toBe(false);
    expect(pool.list()).toEqual([]);
    expect(await familyOf(() => pool.get(handle.pageId))).toBe('not-found');
  });

  it('a headed launch without a display fails as unavailable and does not poison headless', async () => {
    if (process.env.DISPLAY !== undefined && process.env.DISPLAY.length > 0) return; // a display exists; nothing to prove here
    expect(await familyOf(() => pool.open({ headed: true }))).toBe('unavailable');
    expect((await pool.open({})).attached).toBe(false);
  });
});

describe('createBrowserPool: attaching over CDP', () => {
  let external: Browser;
  let endpoint: string;

  beforeAll(async () => {
    const port = await freePort();
    external = await chromium.launch({ args: [`--remote-debugging-port=${port}`] });
    endpoint = `http://127.0.0.1:${port}`;
    const context = await external.newContext();
    await (await context.newPage()).goto(`${server.url}/app/home`);
    await (await context.newPage()).goto(`${server.url}/app/policies`);
  });

  afterAll(async () => {
    await external.close();
  });

  it('attaches to the page whose URL contains urlContains', async () => {
    const handle = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: '/app/home' } });
    expect(handle.attached).toBe(true);
    expect(handle.pageId).toBe('p1');
    expect(handle.page.url()).toBe(`${server.url}/app/home`);
    expect(await handle.page.title()).toBe('App home');
    expect(pool.get('p1')).toBe(handle);
  });

  it('without urlContains, picks the newest non-blank page', async () => {
    const handle = await pool.open({ attach: { cdpEndpoint: endpoint } });
    expect(handle.page.url()).toBe(`${server.url}/app/policies`);
  });

  it('attaching twice to the same page returns the same pageId', async () => {
    const first = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: 'policies' } });
    const second = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: 'policies' } });
    expect(second.pageId).toBe(first.pageId);
  });

  it('not-found when no page matches, with the URLs it saw', async () => {
    try {
      await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: '/nowhere' } });
      throw new Error('expected not-found');
    } catch (error) {
      expect(error).toBeInstanceOf(ToolError);
      expect((error as ToolError).family).toBe('not-found');
      expect(JSON.stringify((error as ToolError).detail)).toContain('/app/home');
    }
    expect(pool.list()).toEqual([]);
  });

  it('closing an attached page or the whole pool only disconnects', async () => {
    const handle = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: '/app/home' } });
    await pool.close(handle.pageId);
    expect(external.isConnected()).toBe(true);
    const again = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: '/app/home' } });
    expect(again.pageId).not.toBe(handle.pageId);
    await pool.closeAll();
    expect(again.browser.isConnected()).toBe(false); // our connection is gone…
    expect(external.isConnected()).toBe(true); // …the browser is not
    const pages = external.contexts().flatMap((context) => context.pages());
    expect(pages.map((page) => page.url())).toEqual([`${server.url}/app/home`, `${server.url}/app/policies`]);
    expect(await pages[0]!.title()).toBe('App home');
  });

  it('can navigate the attached page when a url is given', async () => {
    const handle = await pool.open({ attach: { cdpEndpoint: endpoint, urlContains: '/app/policies' }, url: `${server.url}/app/policies?tab=2` });
    expect(handle.page.url()).toBe(`${server.url}/app/policies?tab=2`);
    await pool.navigate(handle.pageId, `${server.url}/app/policies`);
  });

  it('unavailable for an endpoint nobody listens on; invalid-input for a malformed one', async () => {
    const deadPort = await freePort();
    expect(await familyOf(() => pool.open({ attach: { cdpEndpoint: `http://127.0.0.1:${deadPort}` } }))).toBe('unavailable');
    expect(await familyOf(() => pool.open({ attach: { cdpEndpoint: 'localhost:9222' } }))).toBe('invalid-input');
  });
});

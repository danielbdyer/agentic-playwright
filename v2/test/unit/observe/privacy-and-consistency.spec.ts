/**
 * Review fixes in observation:
 * - a password's value never appears in ARIA text, whatever the PII mode;
 * - an ARIA snapshot that fails is reported (comment line, truncated), not
 *   silently empty;
 * - a client-side route change during an observation does not produce a
 *   record with one screen's candidates under another screen's URL.
 */
import type { Browser, Page } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { captureAria } from '../../../src/observe/aria.js';
import { observePage } from '../../../src/observe/observe.js';
import { html, launch, startServer, type TestServer } from './helpers.js';

const SECRET = 'Hunter2!pass';

const LOGIN = `<!doctype html><html><head><title>Sign in</title></head><body>
<main><h1>Sign in</h1>
<label for="u">Username</label><input id="u" type="text">
<label for="p">Password</label><input id="p" type="password" autocomplete="current-password">
<button type="button">Log in</button></main></body></html>`;

const ROWS = (n: number): string =>
  `<!doctype html><html><head><title>Big</title></head><body><main><h1>Big</h1><table>${Array.from(
    { length: n },
    (_v, i) => `<tr><td>Row ${i}</td><td><a href="#r${i}">Edit ${i}</a></td></tr>`,
  ).join('')}</table></main></body></html>`;

/**
 * Screen A whose router moves to screen B (pushState, no new document) right
 * after the next walk reads styles: the walk sees A, everything after sees B.
 * `always` keeps moving between A and B on every walk.
 */
const ROUTER = (always: boolean): string => `<!doctype html><html><head><title>Router</title></head><body>
<main id="screen"><h1>Screen A</h1><button type="button">Alpha</button></main>
<script>
  const screens = {
    A: '<h1>Screen A</h1><button type="button">Alpha</button>',
    B: '<h1>Screen B</h1><button type="button">Bravo</button>',
  };
  let armed = false;
  window.armRoute = () => { armed = true; };
  const original = window.getComputedStyle;
  window.getComputedStyle = function (...args) {
    if (armed) {
      armed = ${always ? 'true' : 'false'};
      queueMicrotask(() => {
        const next = location.pathname.endsWith('/B') ? 'A' : 'B';
        history.pushState({}, '', next);
        document.getElementById('screen').innerHTML = screens[next];
      });
    }
    return original.apply(this, args);
  };
</script></body></html>`;

describe('observation privacy and consistency', () => {
  let browser: Browser;
  let server: TestServer;

  beforeAll(async () => {
    browser = await launch();
    server = await startServer({
      '/login': html(LOGIN),
      '/big': html(ROWS(400)),
      '/app/A': html(ROUTER(false)),
      '/app/B': html(ROUTER(false)),
      '/loop/A': html(ROUTER(true)),
      '/loop/B': html(ROUTER(true)),
    });
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  const open = async (path: string): Promise<Page> => {
    const page = await browser.newPage();
    await page.goto(`${server.url}${path}`);
    return page;
  };

  it('masks a typed password in the ARIA text even with PII "off", in the record and in the snapshot', async () => {
    const page = await open('/login');
    try {
      await page.getByLabel('Password').fill(SECRET);
      await page.getByLabel('Username').fill('qa.user');
      const { snapshot, record } = await observePage(page, { pageId: 'p1', pii: 'off' });
      expect(record.aria).not.toContain(SECRET);
      expect(snapshot.aria).not.toContain(SECRET);
      expect(record.aria).toMatch(/textbox "Password": <value>/);
      // Values are never needed in ARIA text: a plain field is masked as well; its label is kept.
      expect(record.aria).toMatch(/textbox "Username": <value>/);
      expect(JSON.stringify(record)).not.toContain(SECRET);
    } finally {
      await page.close();
    }
  });

  it('says when an ARIA snapshot could not be taken, instead of returning nothing as complete', async () => {
    const page = await open('/big');
    try {
      const capture = await captureAria(page, { kind: 'page' }, { maxBytes: 100_000, pii: 'standard', timeoutMs: 1 });
      expect(capture.truncated).toBe(true);
      expect(capture.text).toMatch(/^# aria snapshot unavailable: timeout after 1 ms$/m);

      const { snapshot, record } = await observePage(page, { pageId: 'p2', pii: 'standard', ariaTimeoutMs: 1 });
      expect(record.ariaTruncated).toBe(true);
      expect(snapshot.truncated).toBe(true);
      expect(snapshot.aria).toContain('# aria snapshot unavailable');

      const complete = await observePage(page, { pageId: 'p2', pii: 'standard', maxAriaBytes: 1_000_000 });
      expect(complete.record.ariaTruncated).toBe(false);
      expect(complete.record.aria).not.toContain('unavailable');
    } finally {
      await page.close();
    }
  });

  it('never saves one screen\'s candidates under another screen\'s URL when the route changes mid-observation', async () => {
    const page = await open('/app/A');
    try {
      await page.evaluate('window.armRoute()');
      const { record, snapshot } = await observePage(page, { pageId: 'p3', pii: 'standard' });
      const names = record.candidates.map((c) => c.name);
      expect(record.url).toBe(`${server.url}/app/B`);
      expect(names).toContain('Bravo');
      expect(names).not.toContain('Alpha');
      expect(record.title).toBe('Router');
      expect(record.aria).toContain('Bravo');
      expect(snapshot.url).toBe(record.url);
    } finally {
      await page.close();
    }
  });

  it('fails with a timeout, saving nothing mixed, when the page keeps navigating', async () => {
    const page = await open('/loop/A');
    try {
      await page.evaluate('window.armRoute()');
      await expect(observePage(page, { pageId: 'p4', pii: 'standard' })).rejects.toMatchObject({
        family: 'timeout',
        message: expect.stringMatching(/kept navigating/),
      });
    } finally {
      await page.close();
    }
  });
});

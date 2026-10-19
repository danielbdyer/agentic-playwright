import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Browser } from '@playwright/test';
import { isToolError } from '../../../src/core/errors.js';
import { HydrationSchema } from '../../../src/contract/schemas.js';
import { awaitHydration, classifyNavigationError, navigate, settle } from '../../../src/observe/hydration.js';
import { html, launch, startServer, type TestServer } from './helpers.js';

const DELAYED_PAGE = `<!doctype html><html><head><title>Delayed</title></head><body>
<main data-block="Screen"><div id="loading">Loading…</div><table><tbody id="rows"></tbody></table></main>
<script>
  // A screen action: fetch data, then render rows. Nothing mutates while the request is in flight.
  fetch('/api/policies').then((r) => r.json()).then((rows) => {
    document.getElementById('loading').remove();
    const body = document.getElementById('rows');
    rows.forEach((id) => {
      const tr = document.createElement('tr');
      tr.innerHTML = '<td>' + id + '</td><td><a href="#">Edit</a></td>';
      body.appendChild(tr);
    });
  });
</script></body></html>`;

const STORM_PAGE = `<!doctype html><html><body><main><span id="clock"></span></main>
<script>setInterval(() => { document.getElementById('clock').textContent = String(Date.now()); }, 40);</script>
</body></html>`;

const LONG_POLL_PAGE = `<!doctype html><html><body><main><h1>Live dashboard</h1><button>Refresh</button></main>
<script>fetch('/api/poll').catch(() => undefined);</script></body></html>`;

/** The long-poll starts after the wait begins, so the grace period (not ignorance of it) is what lets the wait settle. */
const LATE_LONG_POLL_PAGE = `<!doctype html><html><body><main><h1>Live dashboard</h1></main>
<script>setTimeout(() => fetch('/api/poll').catch(() => undefined), 400);</script></body></html>`;

const NAVIGATING_PAGE = `<!doctype html><html><body><main>Redirecting</main>
<script>setTimeout(() => { location.href = '/delayed'; }, 300);</script></body></html>`;

let browser: Browser;
let server: TestServer;

beforeAll(async () => {
  browser = await launch();
  server = await startServer({
    '/delayed': html(DELAYED_PAGE),
    '/api/policies': (_req, res) => {
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(['POL-001', 'POL-002', 'POL-003']));
      }, 1_200);
    },
    '/storm': html(STORM_PAGE),
    '/longpoll': html(LONG_POLL_PAGE),
    '/late-longpoll': html(LATE_LONG_POLL_PAGE),
    '/api/poll': () => {
      // Never answers: a long-poll / SignalR-style connection.
    },
    '/navigating': html(NAVIGATING_PAGE),
    '/missing': (_req, res) => {
      res.writeHead(404, { 'content-type': 'text/html' });
      res.end('<h1>Not here</h1>');
    },
  });
});

afterAll(async () => {
  await browser.close();
  await server.close();
});

describe('navigate', () => {
  it('loads a page and returns the final URL and status', async () => {
    const page = await browser.newPage();
    try {
      const result = await navigate(page, `${server.url}/delayed`, { timeoutMs: 10_000 });
      expect(result.status).toBe(200);
      expect(result.finalUrl).toBe(`${server.url}/delayed`);
      expect(result.loaded).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('does not fail on a long-polling app that never reaches networkidle', async () => {
    const page = await browser.newPage();
    try {
      const start = Date.now();
      const result = await navigate(page, `${server.url}/longpoll`, { timeoutMs: 10_000, networkIdleMs: 800 });
      expect(result.networkIdle).toBe(false);
      expect(result.loaded).toBe(true);
      expect(Date.now() - start).toBeLessThan(5_000);
    } finally {
      await page.close();
    }
  });

  it('returns an HTTP error status instead of throwing, and classifies unreachable hosts', async () => {
    const page = await browser.newPage();
    try {
      expect((await navigate(page, `${server.url}/missing`)).status).toBe(404);
      const refused = await navigate(page, 'http://127.0.0.1:1/', { timeoutMs: 5_000 }).catch((e: unknown) => e);
      expect(isToolError(refused) && refused.family).toBe('unavailable');
      expect(classifyNavigationError(Object.assign(new Error('Timeout 30000ms exceeded.'), { name: 'TimeoutError' }), 'x').family).toBe('timeout');
      expect(classifyNavigationError(new Error('Protocol error (Page.navigate): Cannot navigate to invalid URL'), 'x').family).toBe('invalid-input');
    } finally {
      await page.close();
    }
  });
});

describe('awaitHydration', () => {
  it('waits for content that a screen action renders after a delay', async () => {
    const page = await browser.newPage();
    try {
      await navigate(page, `${server.url}/delayed`);
      const hydration = await awaitHydration(page, { budgetMs: 10_000 });
      expect(HydrationSchema.parse(hydration)).toEqual(hydration);
      expect(hydration).toMatchObject({ settled: true, reason: 'settled' });
      // The rows arrived before the wait ended: nothing had to wait for them after.
      expect(await page.locator('#rows tr').count()).toBe(3);
      expect(await page.locator('#loading').count()).toBe(0);
    } finally {
      await page.close();
    }
  });

  it('gives up on a page that mutates forever, within the budget', async () => {
    const page = await browser.newPage();
    try {
      await navigate(page, `${server.url}/storm`);
      const hydration = await awaitHydration(page, { budgetMs: 1_500 });
      expect(hydration.settled).toBe(false);
      expect(hydration.reason).toBe('budget-exhausted');
      expect(hydration.elapsedMs).toBeGreaterThanOrEqual(1_400);
      expect(hydration.elapsedMs).toBeLessThan(2_200);
    } finally {
      await page.close();
    }
  });

  it('settles despite a long-poll request that never completes', async () => {
    const page = await browser.newPage();
    try {
      await navigate(page, `${server.url}/longpoll`, { networkIdleMs: 200 });
      const hydration = await awaitHydration(page, { budgetMs: 8_000 });
      expect(hydration.settled).toBe(true);
    } finally {
      await page.close();
    }
  });

  it('stops counting a request as data once it outlives the long-poll grace period', async () => {
    const page = await browser.newPage();
    try {
      await page.goto(`${server.url}/late-longpoll`);
      const hydration = await awaitHydration(page, { budgetMs: 8_000, longPollGraceMs: 1_500 });
      expect(hydration.settled).toBe(true);
      // Quiet could only begin once the late request (started at ~400ms) passed the 1.5s grace.
      expect(hydration.elapsedMs).toBeGreaterThanOrEqual(1_800);
    } finally {
      await page.close();
    }
  });

  it('survives a client-side navigation during the wait', async () => {
    const page = await browser.newPage();
    try {
      await navigate(page, `${server.url}/navigating`, { networkIdleMs: 100 });
      const hydration = await awaitHydration(page, { budgetMs: 10_000 });
      expect(hydration.settled).toBe(true);
      expect(page.url()).toBe(`${server.url}/delayed`);
      expect(await page.locator('#rows tr').count()).toBe(3);
    } finally {
      await page.close();
    }
  });

  it('leaves no observer or counter behind', async () => {
    const page = await browser.newPage();
    try {
      await navigate(page, `${server.url}/longpoll`, { networkIdleMs: 100 });
      const before = await page.evaluate(() => Object.getOwnPropertyNames(window).length);
      await awaitHydration(page, { budgetMs: 5_000 });
      const after = await page.evaluate(() => ({
        count: Object.getOwnPropertyNames(window).length,
        counter: Object.prototype.hasOwnProperty.call(window, '__tesseractMutations'),
      }));
      expect(after).toEqual({ count: before, counter: false });
    } finally {
      await page.close();
    }
  });

  it('reports a navigation error, without throwing, when the page closes', async () => {
    const page = await browser.newPage();
    await navigate(page, `${server.url}/storm`);
    const pending = awaitHydration(page, { budgetMs: 5_000 });
    setTimeout(() => void page.close(), 300);
    const hydration = await pending;
    expect(hydration.settled).toBe(false);
    expect(hydration.reason).toMatch(/^navigation-error: /);
  });
});

describe('settle', () => {
  it('is a short wait after an action', async () => {
    const page = await browser.newPage();
    try {
      await page.setContent('<main><button onclick="setTimeout(() => document.body.append(Object.assign(document.createElement(\'p\'), { textContent: \'Saved\' })), 100)">Save</button></main>');
      await page.getByRole('button', { name: 'Save' }).click();
      const hydration = await settle(page);
      expect(hydration.settled).toBe(true);
      expect(hydration.elapsedMs).toBeLessThan(3_000);
      expect(await page.getByText('Saved').count()).toBe(1);
      const storm = await browser.newPage();
      await storm.goto(`${server.url}/storm`);
      const capped = await settle(storm, { budgetMs: 800 });
      expect(capped).toMatchObject({ settled: false, reason: 'budget-exhausted' });
      expect(capped.elapsedMs).toBeLessThan(1_600);
      await storm.close();
    } finally {
      await page.close();
    }
  });
});

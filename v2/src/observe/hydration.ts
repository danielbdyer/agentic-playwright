/**
 * Navigation and hydration, split so the same wait serves app.open, an
 * attach to a running browser, and the settle after app.act.
 *
 * Lifted from workshop/substrate-study/application/hydration-detector.ts
 * with its hazards fixed: networkidle is a short soft wait, never required
 * (long-polling and SignalR apps never reach it); there is one overall
 * budget instead of one per phase; the mutation counter is reinstalled for
 * every wait and disconnected afterwards, and a navigation that drops it is
 * noticed instead of reading as "quiet"; the stability check compares a
 * cheap structural signature instead of re-walking the page.
 */
import type { Page, Request } from '@playwright/test';
import { ToolError } from '../core/errors.js';
import type { Hydration } from '../contract/schemas.js';
import { inPage } from './in-page/runtime.js';

const COUNTER_KEY = '__tesseractMutations';

export interface NavigationResult {
  readonly finalUrl: string;
  /** HTTP status of the main document, when there was a response. */
  readonly status: number | null;
  readonly elapsedMs: number;
  /** The load event fired within the budget. */
  readonly loaded: boolean;
  /** The network went idle within the soft wait. Informational only. */
  readonly networkIdle: boolean;
}

export interface NavigateOptions {
  readonly timeoutMs?: number;
  /** Soft cap on waiting for networkidle after load. */
  readonly networkIdleMs?: number;
}

const isTimeout = (error: unknown): boolean => {
  const name = (error as { name?: unknown } | null)?.name;
  const message = error instanceof Error ? error.message : String(error);
  return name === 'TimeoutError' || /Timeout \d+ms exceeded/i.test(message);
};

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? '';

/** Map a goto failure onto an error family: timeouts, unreachable hosts, malformed URLs. */
export const classifyNavigationError = (error: unknown, url: string): ToolError => {
  const message = firstLine(error);
  if (isTimeout(error)) return new ToolError('timeout', `navigation to ${url} timed out: ${message}`, { url });
  if (/invalid url|Cannot navigate to invalid URL/i.test(message)) {
    return new ToolError('invalid-input', `cannot navigate to ${url}: ${message}`, { url });
  }
  if (/net::ERR_|NS_ERROR_|ECONNREFUSED|ENOTFOUND|Could not connect|could not resolve/i.test(message)) {
    return new ToolError('unavailable', `${url} is unreachable: ${message}`, { url });
  }
  if (/Target page, context or browser has been closed|Target closed/i.test(message)) {
    return new ToolError('unavailable', `the browser page closed during navigation to ${url}`, { url });
  }
  return new ToolError('unclassified', `navigation to ${url} failed: ${message}`, { url });
};

/**
 * goto with waitUntil 'domcontentloaded', then 'load' best-effort, then a
 * short soft networkidle. Throws ToolError only when the document itself
 * could not be reached; an HTTP error status is returned, not thrown.
 */
export const navigate = async (page: Page, url: string, options: NavigateOptions = {}): Promise<NavigationResult> => {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const networkIdleMs = options.networkIdleMs ?? 1_500;
  const start = Date.now();
  const remaining = (): number => Math.max(1, timeoutMs - (Date.now() - start));
  let status: number | null = null;
  try {
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    status = response?.status() ?? null;
  } catch (error) {
    throw classifyNavigationError(error, url);
  }
  const loaded = await page.waitForLoadState('load', { timeout: remaining() }).then(() => true, () => false);
  const networkIdle = await page
    .waitForLoadState('networkidle', { timeout: Math.min(networkIdleMs, remaining()) })
    .then(() => true, () => false);
  return { finalUrl: page.url(), status, elapsedMs: Date.now() - start, loaded, networkIdle };
};

export interface HydrationOptions {
  /** One overall budget for the whole wait. */
  readonly budgetMs?: number;
  /** Consecutive quiet polls (no mutations, document parsed, no fresh requests) required. */
  readonly quietPolls?: number;
  readonly pollMs?: number;
  /** Delay between the two structural signatures that must agree. */
  readonly signatureDelayMs?: number;
  /** A request in flight longer than this is presumed a long-poll and stops counting against quiet. */
  readonly longPollGraceMs?: number;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));

interface NetworkTracker {
  readonly quiet: () => boolean;
  readonly dispose: () => void;
}

/** Requests started during the wait; one younger than the grace period means data is still arriving. */
const trackNetwork = (page: Page, graceMs: number): NetworkTracker => {
  const inFlight = new Map<Request, number>();
  const onRequest = (request: Request): void => {
    inFlight.set(request, Date.now());
  };
  const onDone = (request: Request): void => {
    inFlight.delete(request);
  };
  page.on('request', onRequest);
  page.on('requestfinished', onDone);
  page.on('requestfailed', onDone);
  return {
    quiet: () => {
      const now = Date.now();
      for (const startedAt of inFlight.values()) if (now - startedAt < graceMs) return false;
      return true;
    },
    dispose: () => {
      page.off('request', onRequest);
      page.off('requestfinished', onDone);
      page.off('requestfailed', onDone);
    },
  };
};

const isContextGone = (error: unknown): boolean =>
  /Execution context was destroyed|Cannot find context|navigat|frame was detached/i.test(firstLine(error));

type QuietOutcome = { readonly kind: 'quiet' } | { readonly kind: 'budget' } | { readonly kind: 'error'; readonly message: string };

const result = (settled: boolean, start: number, reason: string): Hydration => ({ settled, elapsedMs: Date.now() - start, reason });

/**
 * Wait until the page has hydrated: mutation quiet (with the document
 * parsed and no fresh requests in flight) and then a structural signature
 * that holds still across a short delay, retried within one budget. Never
 * throws; the reason says why the wait ended: "settled",
 * "budget-exhausted", or "navigation-error: …" when the page went away.
 */
/**
 * Something a person could see or use has mounted: visible text, an OutSystems block, a landmark,
 * or a control. A string expression, so no host transpiler can inject helpers into it.
 */
const MOUNTED_EXPRESSION = `(() => {
  const body = document.body;
  if (body === null) return false;
  if ((body.innerText || '').trim().length > 0) return true;
  return document.querySelector('[data-block], [role=main], main, input, select, textarea, button, a[href], img, canvas, svg, iframe') !== null;
})()`;

export const awaitHydration = async (page: Page, options: HydrationOptions = {}): Promise<Hydration> => {
  const budgetMs = options.budgetMs ?? 20_000;
  const quietPolls = options.quietPolls ?? 3;
  const pollMs = options.pollMs ?? 200;
  const signatureDelayMs = options.signatureDelayMs ?? 400;
  const start = Date.now();
  const deadline = start + budgetMs;
  const left = (): number => deadline - Date.now();
  const network = trackNetwork(page, options.longPollGraceMs ?? 2_000);
  let errors = 0;

  /** Evaluate in the page, absorbing the context loss a navigation causes. Null means "try again". */
  const attempt = async <T>(run: () => Promise<T>): Promise<T | { readonly failed: string } | null> => {
    try {
      const value = await run();
      errors = 0;
      return value;
    } catch (error) {
      if (page.isClosed()) return { failed: 'page closed' };
      errors += 1;
      if (errors >= 8) return { failed: firstLine(error) };
      if (isContextGone(error)) {
        await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, Math.min(left(), 2_000)) }).catch(() => undefined);
      }
      return null;
    }
  };
  const failed = (value: unknown): value is { readonly failed: string } =>
    value !== null && typeof value === 'object' && 'failed' in value;

  const waitForQuiet = async (): Promise<QuietOutcome> => {
    let installed = false;
    let last = 0;
    let quietRun = 0;
    while (left() > 0) {
      if (!installed) {
        const ok = await attempt(() => inPage(page, 'installMutationCounter', COUNTER_KEY));
        if (failed(ok)) return { kind: 'error', message: ok.failed };
        installed = ok === true;
        // A fresh counter starts at zero, so the first poll already measures a quiet interval.
        last = 0;
        quietRun = 0;
      }
      await sleep(Math.min(pollMs, left()));
      if (left() <= 0) break;
      const poll = await attempt(() => inPage(page, 'pollHydration', COUNTER_KEY));
      if (failed(poll)) return { kind: 'error', message: poll.failed };
      if (poll === null || poll.count < 0) {
        // The counter vanished with the old document: reinstall and start counting again.
        installed = false;
        continue;
      }
      if (poll.count === last && poll.readyState !== 'loading' && network.quiet()) {
        quietRun += 1;
        if (quietRun >= quietPolls) return { kind: 'quiet' };
      } else {
        quietRun = 0;
      }
      last = poll.count;
    }
    return { kind: 'budget' };
  };

  try {
    while (left() > 0) {
      const quiet = await waitForQuiet();
      if (quiet.kind === 'error') return result(false, start, `navigation-error: ${quiet.message}`);
      if (quiet.kind === 'budget') break;
      const before = await attempt(() => inPage(page, 'structuralSignature'));
      if (failed(before)) return result(false, start, `navigation-error: ${before.failed}`);
      await sleep(Math.min(signatureDelayMs, left()));
      const after = await attempt(() => inPage(page, 'structuralSignature'));
      if (failed(after)) return result(false, start, `navigation-error: ${after.failed}`);
      if (before !== null && before === after) {
        // A quiet, stable, EMPTY document is a runtime still fetching its bundles (seen on a cold
        // load of a real Reactive app), not a hydrated screen: keep waiting for something to mount.
        const mounted = await attempt(() => page.evaluate(MOUNTED_EXPRESSION) as Promise<boolean>);
        if (failed(mounted)) return result(false, start, `navigation-error: ${mounted.failed}`);
        if (mounted === true) return result(true, start, 'settled');
        await sleep(Math.min(pollMs, left()));
      }
    }
    return result(false, start, 'budget-exhausted');
  } finally {
    network.dispose();
    if (!page.isClosed()) await inPage(page, 'disconnectMutationCounter', COUNTER_KEY).catch(() => undefined);
  }
};

/**
 * The shorter wait after an action: whatever the click started (a screen
 * action's fetch, a client-side route change) gets a few seconds to land
 * before the post-action snapshot is taken.
 */
export const settle = async (page: Page, options: { readonly budgetMs?: number } = {}): Promise<Hydration> => {
  const budgetMs = options.budgetMs ?? 3_000;
  const start = Date.now();
  await page.waitForLoadState('domcontentloaded', { timeout: Math.max(1, Math.min(budgetMs, 1_000)) }).catch(() => undefined);
  const hydration = await awaitHydration(page, {
    budgetMs: Math.max(1, budgetMs - (Date.now() - start)),
    quietPolls: 2,
    pollMs: 150,
    signatureDelayMs: 250,
    longPollGraceMs: 1_000,
  });
  return { ...hydration, elapsedMs: Date.now() - start };
};

/**
 * The browser pool: the one piece of process state the server keeps.
 *
 * - One Chromium per mode (headless / headed), launched on first use and
 *   relaunched if it dies.
 * - One BrowserContext per open() call, so cookies, storage, and profile
 *   settings never leak from one page to another.
 * - Attached browsers (a QA's Chrome, a paused test) are joined over CDP and
 *   are never closed: closing an attached page or the pool only drops the
 *   connection. For a CDP-connected Browser, Playwright's close() closes the
 *   transport and leaves the remote browser running.
 *
 * Storage state: `profile.storageStatePath` is used as given when absolute;
 * a relative path (as profiles store it, "relative to root") resolves
 * against the pool's `root` option, which the server sets to the workspace
 * root (default: process.cwd()).
 */
import path from 'node:path';
import { access } from 'node:fs/promises';
import { chromium, type Browser, type BrowserContext, type BrowserContextOptions, type Page } from '@playwright/test';
import { ToolError, isToolError, type ErrorFamily } from '../core/errors.js';
import type { Profile } from '../workspace/profiles.js';
import { classifyPlaywrightError } from '../act/classify.js';
import type { BrowserPool, OpenPageOptions, PageHandle } from './types.js';

export interface BrowserPoolOptions {
  /** Appended to Chromium's own user agent so site owners can see who is visiting. */
  readonly userAgentSuffix: string;
  /** Mode used when neither the open() call nor the profile says; default true. */
  readonly headless?: boolean;
  readonly log?: (message: string) => void;
  readonly now?: () => Date;
  /** Base for a relative profile.storageStatePath (the workspace root). Default: process.cwd(). */
  readonly root?: string;
  /** Extra command-line switches for launched browsers (never applied to attached ones). */
  readonly launchArgs?: readonly string[];
  /** Accept self-signed certificates (QA environments behind an internal CA). Default false. */
  readonly ignoreHTTPSErrors?: boolean;
}

export const DEFAULT_VIEWPORT = { width: 1280, height: 800 } as const;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
export const DEFAULT_ATTACH_TIMEOUT_MS = 15_000;

interface Launched {
  readonly browser: Browser;
  /** Chromium's default UA for this browser plus the suffix. */
  readonly userAgent: string;
}

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:/i;

const isBlankUrl = (url: string): boolean =>
  url === '' ||
  url === 'about:blank' ||
  url.startsWith('chrome://newtab') ||
  url.startsWith('chrome://new-tab-page') ||
  url.startsWith('chrome-search://');

const firstLine = (error: unknown): string => {
  const text = error instanceof Error ? error.message : String(error);
  return text.split('\n').map((line) => line.trim()).find((line) => line.length > 0) ?? text;
};

/** Pages are addressed by pageIds the pool mints: p1, p2, … */
const PAGE_ID = /^p([1-9][0-9]*)$/;

/** Navigation failures keep the families app.open declares; anything else is unclassified. */
const NAVIGATION_FAMILIES: ReadonlySet<ErrorFamily> = new Set(['timeout', 'unavailable', 'invalid-input', 'not-configured']);

const navigationError = (url: string, error: unknown): ToolError => {
  if (isToolError(error)) return error;
  const { family, message } = classifyPlaywrightError(error);
  return new ToolError(NAVIGATION_FAMILIES.has(family) ? family : 'unclassified', message, { url });
};

/**
 * Navigate and wait for DOMContentLoaded. Hydration (the OutSystems runtime
 * mounting) is observe/'s job; this only gets the document there.
 */
const gotoUrl = async (page: Page, url: string, timeoutMs: number, log: (message: string) => void): Promise<void> => {
  if (!ABSOLUTE_URL.test(url)) {
    throw new ToolError('invalid-input', `navigation needs an absolute URL, got ${JSON.stringify(url)}`, { url });
  }
  try {
    // Server and script redirects are followed; page.url() is where it landed.
    const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    if (response !== null && response.status() >= 400) log(`navigation to ${url} returned HTTP ${response.status()}`);
  } catch (error) {
    throw navigationError(url, error);
  }
};

/** Chromium's own UA string (headless and headed differ), read over CDP without opening a page. */
const defaultUserAgent = async (browser: Browser): Promise<string> => {
  try {
    const session = await browser.newBrowserCDPSession();
    try {
      const version = await session.send('Browser.getVersion');
      return version.userAgent;
    } finally {
      await session.detach().catch(() => undefined);
    }
  } catch {
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      return await page.evaluate(() => navigator.userAgent);
    } finally {
      await context.close().catch(() => undefined);
    }
  }
};

/** How long a page in an attached browser gets to say when its document started. */
const DOCUMENT_START_PROBE_MS = 1_000;

/**
 * When the page's current document started loading, or -Infinity if the page
 * does not answer in time (a modal dialog blocks script, a tab is frozen).
 */
const documentStart = (page: Page): Promise<number> =>
  new Promise((resolve) => {
    const timer = setTimeout(() => resolve(Number.NEGATIVE_INFINITY), DOCUMENT_START_PROBE_MS);
    timer.unref();
    page.evaluate(() => performance.timeOrigin).then(
      (origin) => {
        clearTimeout(timer);
        resolve(origin);
      },
      () => {
        clearTimeout(timer);
        resolve(Number.NEGATIVE_INFINITY);
      },
    );
  });

/**
 * The page whose current document started most recently. Over CDP,
 * `context.pages()` is in target-attach order, which is not creation order,
 * so "the newest page" has to be asked of the pages themselves.
 */
const newestOf = async (pages: readonly Page[]): Promise<Page | undefined> => {
  if (pages.length <= 1) return pages[0];
  const starts = await Promise.all(pages.map(documentStart));
  return pages.reduce<{ readonly page: Page | undefined; readonly start: number }>(
    (best, page, index) => {
      const start = starts[index] ?? Number.NEGATIVE_INFINITY;
      return best.page === undefined || start > best.start ? { page, start } : best;
    },
    { page: undefined, start: Number.NEGATIVE_INFINITY },
  ).page;
};

const fileExists = async (file: string): Promise<boolean> =>
  access(file).then(
    () => true,
    () => false,
  );

export const createBrowserPool = (options: BrowserPoolOptions): BrowserPool => {
  const log = options.log ?? ((): void => undefined);
  const now = options.now ?? ((): Date => new Date());
  const root = options.root ?? process.cwd();

  // The pool's state. Everything else Tesseract keeps is on disk.
  const handles = new Map<string, PageHandle>();
  const launched = new Map<boolean, Promise<Launched>>();
  const attachedByEndpoint = new Map<string, Promise<Browser>>();
  const endpointOf = new Map<Browser, string>();
  /** In-flight attach calls per endpoint, so a release never pulls a connection out from under one. */
  const attaching = new Map<string, number>();
  let issued = 0;

  const forget = (pageId: string): void => {
    handles.delete(pageId);
  };

  const dropHandlesOf = (browser: Browser): void => {
    for (const [pageId, handle] of handles) if (handle.browser === browser) handles.delete(pageId);
  };

  const notFound = (pageId: string, why: string): ToolError =>
    new ToolError('not-found', `${why}; open pages: ${[...handles.keys()].join(', ') || 'none'}`, { pageId });

  const wasIssued = (pageId: string): boolean => {
    const match = PAGE_ID.exec(pageId);
    return match !== null && Number(match[1]) <= issued;
  };

  // ─── launched browsers ───────────────────────────────────────────────────

  const launch = async (headless: boolean): Promise<Launched> => {
    log(`launching chromium (${headless ? 'headless' : 'headed'})`);
    // The server owns shutdown (it closes sessions, releases paused runs, then browsers); Playwright's
    // own signal handlers would race it and exit first.
    const browser = await chromium.launch({
      headless,
      args: [...(options.launchArgs ?? [])],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false,
    });
    const userAgent = await defaultUserAgent(browser);
    return { browser, userAgent: `${userAgent} ${options.userAgentSuffix}`.trim() };
  };

  const ensureLaunched = (headless: boolean): Promise<Launched> => {
    const existing = launched.get(headless);
    if (existing !== undefined) return existing;
    const pending: Promise<Launched> = launch(headless).then(
      (result) => {
        result.browser.once('disconnected', () => {
          log(`chromium (${headless ? 'headless' : 'headed'}) disconnected`);
          if (launched.get(headless) === pending) launched.delete(headless);
          dropHandlesOf(result.browser);
        });
        return result;
      },
      (error: unknown) => {
        if (launched.get(headless) === pending) launched.delete(headless);
        throw new ToolError('unavailable', `could not launch chromium: ${firstLine(error)}`, { headless });
      },
    );
    launched.set(headless, pending);
    return pending;
  };

  const storageStateFor = async (profile: Profile | null): Promise<string> => {
    if (profile === null || profile.storageStatePath === undefined || profile.storageStatePath.length === 0) {
      throw new ToolError('not-configured', `profile ${profile?.name ?? '(none)'} has no storageStatePath`, { profile: profile?.name });
    }
    const file = path.resolve(root, profile.storageStatePath);
    if (!(await fileExists(file))) {
      throw new ToolError('not-configured', `storage state not found: ${profile.storageStatePath}`, { profile: profile.name, path: file });
    }
    return file;
  };

  const contextOptions = (profile: Profile | null, userAgent: string, storageState: string | undefined): BrowserContextOptions => ({
    userAgent,
    viewport: profile?.viewport ?? DEFAULT_VIEWPORT,
    ...(profile?.locale !== undefined ? { locale: profile.locale } : {}),
    ...(profile?.timezoneId !== undefined ? { timezoneId: profile.timezoneId } : {}),
    ...(storageState !== undefined ? { storageState } : {}),
    ...(options.ignoreHTTPSErrors === true ? { ignoreHTTPSErrors: true } : {}),
  });

  const register = (fields: Omit<PageHandle, 'pageId' | 'openedAt'>): PageHandle => {
    issued += 1;
    const handle: PageHandle = { ...fields, pageId: `p${issued}`, openedAt: now().toISOString() };
    handles.set(handle.pageId, handle);
    // A page closed from outside (a QA closing the tab) must not leave a
    // handle behind. A launched page's context goes with it; an attached
    // page's connection goes once nothing else uses it.
    handle.page.once('close', () => {
      if (handles.get(handle.pageId) === handle) forget(handle.pageId);
      if (handle.attached) void releaseIfUnused(handle.browser);
      else void handle.context.close().catch(() => undefined);
    });
    return handle;
  };

  const openLaunched = async (open: OpenPageOptions): Promise<PageHandle> => {
    const profile = open.profile ?? null;
    const headless = open.headed !== undefined ? !open.headed : profile?.headed !== undefined ? !profile.headed : options.headless ?? true;
    const storageState = open.useStorageState === true ? await storageStateFor(profile) : undefined;
    const { browser, userAgent } = await ensureLaunched(headless);
    let context: BrowserContext;
    try {
      context = await browser.newContext(contextOptions(profile, userAgent, storageState));
    } catch (error) {
      const family: ErrorFamily = /storage state/i.test(firstLine(error)) ? 'not-configured' : 'unavailable';
      throw new ToolError(family, `could not create a browser context: ${firstLine(error)}`, { profile: profile?.name });
    }
    try {
      const page = await context.newPage();
      if (open.url !== undefined) await gotoUrl(page, open.url, open.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS, log);
      return register({ page, context, browser, attached: false, profile });
    } catch (error) {
      await context.close().catch(() => undefined);
      throw navigationError(open.url ?? '', error);
    }
  };

  // ─── attached browsers ───────────────────────────────────────────────────

  const connect = (endpoint: string, timeoutMs: number): Promise<Browser> => {
    const existing = attachedByEndpoint.get(endpoint);
    if (existing !== undefined) return existing;
    log(`attaching over CDP to ${endpoint}`);
    const pending: Promise<Browser> = chromium.connectOverCDP(endpoint, { timeout: timeoutMs }).then(
      (browser) => {
        endpointOf.set(browser, endpoint);
        browser.once('disconnected', () => {
          if (attachedByEndpoint.get(endpoint) === pending) attachedByEndpoint.delete(endpoint);
          endpointOf.delete(browser);
          dropHandlesOf(browser);
        });
        return browser;
      },
      (error: unknown) => {
        if (attachedByEndpoint.get(endpoint) === pending) attachedByEndpoint.delete(endpoint);
        const family: ErrorFamily = classifyPlaywrightError(error).family === 'timeout' ? 'timeout' : 'unavailable';
        throw new ToolError(family, `could not attach to ${endpoint}: ${firstLine(error)}`, { cdpEndpoint: endpoint });
      },
    );
    attachedByEndpoint.set(endpoint, pending);
    return pending;
  };

  /** Drop the CDP connection once no handle uses it. Never closes the remote browser. */
  const releaseIfUnused = async (browser: Browser): Promise<void> => {
    if ([...handles.values()].some((handle) => handle.browser === browser)) return;
    const endpoint = endpointOf.get(browser);
    // Another open() is attaching through this connection right now.
    if (endpoint !== undefined && (attaching.get(endpoint) ?? 0) > 0) return;
    if (endpoint !== undefined) attachedByEndpoint.delete(endpoint);
    endpointOf.delete(browser);
    await browser.close().catch((error: unknown) => log(`disconnect failed: ${firstLine(error)}`));
  };

  /**
   * The page to attach to: the newest page whose URL contains urlContains;
   * without it, the newest non-blank page of the first context (the one a
   * QA is looking at), then any non-blank page, then a blank one, then a
   * new page in the first context.
   */
  const pickPage = async (browser: Browser, urlContains: string | undefined): Promise<Page> => {
    const contexts = browser.contexts();
    const all = contexts.flatMap((context) => context.pages());
    if (urlContains !== undefined && urlContains.length > 0) {
      const page = await newestOf(all.filter((candidate) => candidate.url().includes(urlContains)));
      if (page === undefined) {
        throw new ToolError('not-found', `no page in the attached browser has a URL containing ${JSON.stringify(urlContains)}`, {
          urlContains,
          urls: all.map((candidate) => candidate.url()),
        });
      }
      return page;
    }
    const first = contexts[0];
    const firstPages = first?.pages() ?? [];
    const page =
      (await newestOf(firstPages.filter((candidate) => !isBlankUrl(candidate.url())))) ??
      (await newestOf(all.filter((candidate) => !isBlankUrl(candidate.url())))) ??
      firstPages.at(-1) ??
      all.at(-1);
    if (page !== undefined) return page;
    if (first !== undefined) return first.newPage();
    throw new ToolError('unavailable', 'the attached browser has no context to open a page in');
  };

  const openAttached = async (open: OpenPageOptions, attach: NonNullable<OpenPageOptions['attach']>): Promise<PageHandle> => {
    if (!/^(https?|wss?):\/\//i.test(attach.cdpEndpoint)) {
      throw new ToolError('invalid-input', `cdpEndpoint must be an http(s):// or ws(s):// URL, got ${JSON.stringify(attach.cdpEndpoint)}`);
    }
    const endpoint = attach.cdpEndpoint;
    attaching.set(endpoint, (attaching.get(endpoint) ?? 0) + 1);
    const settled = (): void => {
      const left = (attaching.get(endpoint) ?? 1) - 1;
      if (left > 0) attaching.set(endpoint, left);
      else attaching.delete(endpoint);
    };
    let browser: Browser;
    try {
      browser = await connect(endpoint, open.navigationTimeoutMs ?? DEFAULT_ATTACH_TIMEOUT_MS);
    } catch (error) {
      settled();
      throw error;
    }
    try {
      const page = await pickPage(browser, attach.urlContains);
      if (open.url !== undefined) await gotoUrl(page, open.url, open.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS, log);
      // Attaching twice to the same page yields the same pageId.
      const existing = [...handles.values()].find((handle) => handle.page === page);
      const handle = existing ?? register({ page, context: page.context(), browser, attached: true, profile: open.profile ?? null });
      settled();
      return handle;
    } catch (error) {
      settled();
      await releaseIfUnused(browser);
      throw navigationError(open.url ?? '', error);
    }
  };

  // ─── the pool ────────────────────────────────────────────────────────────

  const get = (pageId: string): PageHandle => {
    const handle = handles.get(pageId);
    if (handle === undefined) {
      throw notFound(pageId, wasIssued(pageId) ? `page ${pageId} has been closed` : `no page with id ${JSON.stringify(pageId)}`);
    }
    if (handle.page.isClosed() || !handle.browser.isConnected()) {
      forget(pageId);
      throw notFound(pageId, `page ${pageId} has been closed`);
    }
    return handle;
  };

  const list = (): readonly PageHandle[] =>
    [...handles.keys()].flatMap((pageId) => {
      try {
        return [get(pageId)];
      } catch {
        return [];
      }
    });

  const open = (request: OpenPageOptions): Promise<PageHandle> =>
    request.attach !== undefined ? openAttached(request, request.attach) : openLaunched(request);

  const navigate = async (pageId: string, url: string, timeoutMs?: number): Promise<PageHandle> => {
    const handle = get(pageId);
    await gotoUrl(handle.page, url, timeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS, log);
    return get(pageId);
  };

  const close = async (pageId: string): Promise<void> => {
    const handle = handles.get(pageId);
    if (handle === undefined) {
      // Closing twice is fine; closing something that never existed is a mistake worth reporting.
      if (wasIssued(pageId)) return;
      throw notFound(pageId, `no page with id ${JSON.stringify(pageId)}`);
    }
    forget(pageId);
    if (handle.attached) {
      await releaseIfUnused(handle.browser);
      return;
    }
    await handle.context.close().catch((error: unknown) => log(`closing ${pageId} failed: ${firstLine(error)}`));
  };

  const closeAll = async (): Promise<void> => {
    const launchedNow = [...launched.values()];
    const attachedNow = [...attachedByEndpoint.values()];
    launched.clear();
    attachedByEndpoint.clear();
    endpointOf.clear();
    handles.clear();
    await Promise.all([
      ...launchedNow.map((pending) =>
        pending.then(
          ({ browser }) => browser.close().catch((error: unknown) => log(`closing chromium failed: ${firstLine(error)}`)),
          () => undefined,
        ),
      ),
      // Disconnect only: the attached browser belongs to someone else.
      ...attachedNow.map((pending) =>
        pending.then(
          (browser) => browser.close().catch((error: unknown) => log(`disconnect failed: ${firstLine(error)}`)),
          () => undefined,
        ),
      ),
    ]);
  };

  return { open, navigate, get, list, close, closeAll };
};

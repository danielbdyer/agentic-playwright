/**
 * Playwright Browser Pool — reuses browser contexts and pages across
 * scenario runs within a single dogfood iteration.
 *
 * Instead of creating a new browser + context + page per scenario
 * (200-400ms overhead), the pool maintains warm pages and resets
 * state between scenarios using lightweight operations (clear cookies
 * + storage ≈ 10ms).
 *
 * Uses the BrowserPoolPort interface from lib/application/browser-pool.ts.
 */

import type {
  BrowserPoolPort,
  BrowserPoolConfig,
  BrowserPoolStats,
  PageHandle,
  ResetStrategy,
} from '../application/browser-pool';
import { DEFAULT_BROWSER_POOL_CONFIG } from '../application/browser-pool';

interface PooledPage {
  readonly id: string;
  readonly page: unknown;
  readonly context: unknown;
  readonly createdAt: number;
  inUse: boolean;
}

interface PlaywrightBrowserPoolOptions {
  readonly config?: Partial<BrowserPoolConfig>;
  /** Browser type to use. Default: 'chromium'. */
  readonly browserType?: 'chromium' | 'firefox' | 'webkit';
  /** Launch headless. Default: true. */
  readonly headless?: boolean;
  /** Viewport dimensions. Default: 1280x720. */
  readonly viewport?: { readonly width: number; readonly height: number };
}

/**
 * Create a real Playwright-backed browser pool.
 *
 * Launches a single browser instance and creates multiple contexts/pages
 * up to the configured pool size. Pages are acquired/released by the
 * scenario runner, with lightweight state resets between uses.
 */
export async function createPlaywrightBrowserPool(
  options: PlaywrightBrowserPoolOptions = {},
): Promise<BrowserPoolPort> {
  const config: BrowserPoolConfig = {
    ...DEFAULT_BROWSER_POOL_CONFIG,
    ...options.config,
  };

  const pw = await import('@playwright/test');
  const browserType = options.browserType === 'firefox'
    ? pw.firefox
    : options.browserType === 'webkit'
      ? pw.webkit
      : pw.chromium;

  const browser = await browserType.launch({
    headless: options.headless ?? true,
  });

  const viewport = options.viewport ?? { width: 1280, height: 720 };
  const pool: PooledPage[] = [];
  let nextId = 0;
  let totalAcquired = 0;
  let totalReleased = 0;
  let totalOverflow = 0;
  let totalResets = 0;

  async function createPage(): Promise<PooledPage> {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    const id = `pool-${++nextId}`;
    return { id, page, context, createdAt: Date.now(), inUse: false };
  }

  // Pre-warm the pool
  if (config.preWarm) {
    for (let i = 0; i < config.poolSize; i++) {
      pool.push(await createPage());
    }
  }

  async function resetPage(entry: PooledPage, strategy: ResetStrategy): Promise<void> {
    const ctx = entry.context as { clearCookies: () => Promise<void>; clearPermissions: () => void };
    const pg = entry.page as { goto: (url: string) => Promise<unknown>; evaluate: (fn: () => void) => Promise<void> };

    if (strategy === 'none') return;

    totalResets++;
    await ctx.clearCookies();

    if (strategy === 'full') {
      await pg.evaluate(() => {
        try { localStorage.clear(); } catch { /* noop */ }
        try { sessionStorage.clear(); } catch { /* noop */ }
      });
      await pg.goto('about:blank');
    }
  }

  function isStale(entry: PooledPage): boolean {
    return Date.now() - entry.createdAt > config.maxPageAgeMs;
  }

  async function recycleStaleEntry(entry: PooledPage): Promise<PooledPage> {
    const ctx = entry.context as { close: () => Promise<void> };
    await ctx.close();
    const idx = pool.indexOf(entry);
    const fresh = await createPage();
    if (idx >= 0) pool[idx] = fresh;
    return fresh;
  }

  return {
    async acquire(): Promise<PageHandle> {
      totalAcquired++;

      // Find an idle page
      let entry = pool.find((p) => !p.inUse);

      if (entry && isStale(entry)) {
        entry = await recycleStaleEntry(entry);
      }

      if (entry) {
        entry.inUse = true;
        return { id: entry.id, page: entry.page, overflow: false };
      }

      // Pool exhausted — create overflow page
      totalOverflow++;
      const overflow = await createPage();
      overflow.inUse = true;
      return { id: overflow.id, page: overflow.page, overflow: true };
    },

    async release(handle: PageHandle, resetStrategy: ResetStrategy = 'full'): Promise<void> {
      totalReleased++;
      const entry = pool.find((p) => p.id === handle.id);

      if (entry) {
        await resetPage(entry, resetStrategy);
        entry.inUse = false;
        return;
      }

      // Overflow page — close it
      if (handle.overflow && handle.page) {
        const pg = handle.page as { context: () => { close: () => Promise<void> } };
        try {
          await pg.context().close();
        } catch { /* page may already be closed */ }
      }
    },

    async warmUp(urls: readonly string[]): Promise<void> {
      const idle = pool.filter((p) => !p.inUse);
      for (let i = 0; i < Math.min(urls.length, idle.length); i++) {
        const pg = idle[i]!.page as { goto: (url: string) => Promise<unknown> };
        try {
          await pg.goto(urls[i]!);
        } catch { /* warm-up is best-effort */ }
      }
    },

    async close(): Promise<void> {
      for (const entry of pool) {
        try {
          const ctx = entry.context as { close: () => Promise<void> };
          await ctx.close();
        } catch { /* cleanup is best-effort */ }
      }
      pool.length = 0;
      await browser.close();
    },

    get stats(): BrowserPoolStats {
      return {
        totalAcquired,
        totalReleased,
        totalOverflow,
        totalResets,
        poolSize: pool.length,
        available: pool.filter((p) => !p.inUse).length,
      };
    },
  };
}

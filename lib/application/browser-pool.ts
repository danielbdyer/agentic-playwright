/**
 * Browser Pool — reuses Playwright browser contexts and pages across
 * scenario runs within a single dogfood iteration.
 *
 * Instead of creating a new browser context per scenario (50-200ms overhead),
 * the pool maintains a set of warm pages and resets state between scenarios
 * using lightweight operations (clear cookies + clear storage ≈ 10ms).
 *
 * Design:
 *   - Fixed pool size (default: CPU count, max 8)
 *   - Acquire/release semantics (no concurrent use of same page)
 *   - State reset between scenarios: cookies, storage, cache
 *   - URL pre-warming for common entry points
 *   - Graceful degradation: if pool is exhausted, create overflow page
 *
 * All orchestration functions are pure where possible.
 * Side effects (browser I/O) are confined to the BrowserPoolPort interface.
 */

// ─── Types ───

export interface PageHandle {
  /** Opaque identifier for this pooled page. */
  readonly id: string;
  /** The underlying page object (Playwright Page or equivalent). */
  readonly page: unknown;
  /** Whether this page was created as overflow (not from the pool). */
  readonly overflow: boolean;
}

export interface BrowserPoolConfig {
  /** Maximum number of warm pages to maintain. Default: 4. */
  readonly poolSize: number;
  /** Whether to pre-warm pages by navigating to about:blank. Default: true. */
  readonly preWarm: boolean;
  /** Maximum age (ms) of a pooled page before it's recycled. Default: 300_000 (5 min). */
  readonly maxPageAgeMs: number;
}

export const DEFAULT_BROWSER_POOL_CONFIG: BrowserPoolConfig = {
  poolSize: 4,
  preWarm: true,
  maxPageAgeMs: 300_000,
};

export interface BrowserPoolStats {
  readonly totalAcquired: number;
  readonly totalReleased: number;
  readonly totalOverflow: number;
  readonly totalResets: number;
  readonly poolSize: number;
  readonly available: number;
}

// ─── State Reset Policy ───

/**
 * Determine the reset strategy for a page between scenarios.
 *
 * Full reset: clear cookies + storage + reload (50ms).
 * Light reset: clear cookies only (10ms) — when staying on the same domain.
 *
 * Pure function: previous URL + next URL → reset strategy.
 */
export type ResetStrategy = 'full' | 'light' | 'none';

export function determineResetStrategy(
  previousUrl: string | null,
  nextUrl: string | null,
): ResetStrategy {
  if (!previousUrl || !nextUrl) return 'full';

  try {
    const prevOrigin = new URL(previousUrl).origin;
    const nextOrigin = new URL(nextUrl).origin;
    return prevOrigin === nextOrigin ? 'light' : 'full';
  } catch {
    return 'full';
  }
}

// ─── URL Pre-Warming Policy ───

/**
 * Extract unique entry-point URLs from scenario metadata for pre-warming.
 * Pure function: scenarios → URLs to warm.
 */
export function extractWarmUpUrls(
  scenarios: readonly { readonly url?: string | null }[],
  maxUrls: number = 8,
): readonly string[] {
  const seen = new Set<string>();
  const urls: string[] = [];

  for (const scenario of scenarios) {
    if (scenario.url && !seen.has(scenario.url)) {
      seen.add(scenario.url);
      urls.push(scenario.url);
      if (urls.length >= maxUrls) break;
    }
  }

  return urls;
}

// ─── Pool Interface ───

/**
 * Browser pool port — implemented by infrastructure layer.
 *
 * Application code acquires/releases page handles. The pool manages
 * the lifecycle of the underlying browser contexts and pages.
 */
export interface BrowserPoolPort {
  /** Acquire a warm page from the pool. May create overflow if pool is exhausted. */
  acquire(): Promise<PageHandle>;
  /** Release a page back to the pool, resetting state for next use. */
  release(handle: PageHandle, resetStrategy?: ResetStrategy): Promise<void>;
  /** Pre-warm the pool with initial navigations. */
  warmUp(urls: readonly string[]): Promise<void>;
  /** Shut down the pool and close all pages. */
  close(): Promise<void>;
  /** Current pool diagnostics. */
  readonly stats: BrowserPoolStats;
}

/**
 * Create a no-op browser pool for testing or when no browser is available.
 * All operations succeed immediately with null pages.
 */
export function createNoOpBrowserPool(): BrowserPoolPort {
  let totalAcquired = 0;

  return {
    async acquire(): Promise<PageHandle> {
      totalAcquired++;
      return { id: `noop-${totalAcquired}`, page: null, overflow: true };
    },
    async release(): Promise<void> {},
    async warmUp(): Promise<void> {},
    async close(): Promise<void> {},
    get stats(): BrowserPoolStats {
      return {
        totalAcquired,
        totalReleased: totalAcquired,
        totalOverflow: totalAcquired,
        totalResets: 0,
        poolSize: 0,
        available: 0,
      };
    },
  };
}

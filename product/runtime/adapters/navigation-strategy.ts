/**
 * Route-Aware Navigation Strategy — chooses the optimal Playwright
 * `waitUntil` option based on route characteristics.
 *
 * SPAs load in 200-400ms but Playwright's default `'load'` waits for all
 * assets (3-5s). For SPA routes, `'domcontentloaded'` is sufficient and
 * 2-4× faster. For traditional multi-page routes, `'load'` ensures CSS
 * and images are ready.
 *
 * This module provides:
 *   1. Route classification (SPA vs. traditional)
 *   2. Navigation options builder (waitUntil + timeout)
 *   3. Post-navigation readiness check (targeted element wait)
 *
 * All classification functions are pure.
 */

// ─── Route Classification ───

export type RouteType = 'spa' | 'traditional' | 'unknown';

export type WaitUntilOption = 'load' | 'domcontentloaded' | 'networkidle' | 'commit';

export interface NavigationOptions {
  readonly waitUntil: WaitUntilOption;
  readonly timeout: number;
}

/**
 * SPA indicators: URL patterns that strongly suggest a single-page application.
 * If ANY pattern matches the route URL, classify as SPA.
 */
const SPA_INDICATORS: readonly RegExp[] = [
  /\/#\//,            // Hash-based routing (#/)
  /\.(html|htm)$/i,   // Static HTML files (typical SPA shells)
  /\/app\//i,          // /app/ prefix common in SPAs
  /\/dashboard/i,      // Dashboards are almost always SPAs
  /\/portal/i,         // Portals are almost always SPAs
];

/**
 * Traditional indicators: URL patterns that suggest server-rendered pages.
 */
const TRADITIONAL_INDICATORS: readonly RegExp[] = [
  /\.(php|jsp|aspx?|cfm|cgi)$/i,   // Server-rendered extensions
  /\/api\//i,                         // API endpoints (shouldn't navigate, but if so, treat as traditional)
  /\.(pdf|doc|xls)/i,                // Document downloads
];

/**
 * Classify a route URL as SPA or traditional.
 *
 * Priority:
 *   1. Explicit route metadata (if available)
 *   2. URL pattern matching
 *   3. Default to 'unknown' (uses conservative strategy)
 *
 * Pure function: URL + optional metadata → route type.
 */
export function classifyRoute(
  url: string,
  metadata?: { readonly routeType?: RouteType },
): RouteType {
  // Explicit metadata takes priority
  if (metadata?.routeType) return metadata.routeType;

  // Pattern-based classification
  for (const pattern of TRADITIONAL_INDICATORS) {
    if (pattern.test(url)) return 'traditional';
  }
  for (const pattern of SPA_INDICATORS) {
    if (pattern.test(url)) return 'spa';
  }

  return 'unknown';
}

/**
 * Build navigation options based on route classification.
 *
 * SPA routes: `domcontentloaded` (fast, DOM is ready)
 * Traditional routes: `load` (wait for all assets)
 * Unknown routes: `domcontentloaded` with longer timeout (balanced)
 *
 * Pure function: route type → navigation options.
 */
export function navigationOptionsForRoute(routeType: RouteType): NavigationOptions {
  switch (routeType) {
    case 'spa':
      return { waitUntil: 'domcontentloaded', timeout: 10_000 };
    case 'traditional':
      return { waitUntil: 'load', timeout: 30_000 };
    case 'unknown':
      return { waitUntil: 'domcontentloaded', timeout: 15_000 };
  }
}

/**
 * Convenience: classify a URL and return navigation options in one call.
 * Pure function: URL + optional metadata → navigation options.
 */
export function navigationOptionsForUrl(
  url: string,
  metadata?: { readonly routeType?: RouteType },
): NavigationOptions {
  return navigationOptionsForRoute(classifyRoute(url, metadata));
}

/**
 * Determine whether a post-navigation readiness check is needed.
 *
 * For SPA routes, we should wait for a content selector after navigation
 * since `domcontentloaded` fires before the SPA framework renders.
 * For traditional routes, `load` already ensures content is ready.
 *
 * Pure function: route type → boolean.
 */
export function needsPostNavigationCheck(routeType: RouteType): boolean {
  return routeType === 'spa' || routeType === 'unknown';
}

// ─── Navigation envelope ───

/**
 * Classification of a navigation outcome. Driven by the page.url()
 * idempotence check that v2 §3.2 adds before page.goto():
 *
 *   - `skipped-idempotent`: the page is already at the target URL;
 *     no goto was issued. Zero network cost, zero risk of re-rendering
 *     mid-flight state the caller depends on.
 *   - `navigated`: a goto was issued and completed within the timeout.
 *   - `navigated-with-error`: a goto was issued and threw or returned
 *     a non-2xx response; the envelope carries the thrown-message.
 */
export type NavigationClassification = 'skipped-idempotent' | 'navigated' | 'navigated-with-error';

export interface NavigationReceipt {
  /** The URL the page actually reached after the operation. */
  readonly reachedUrl: string;
  /** The status from the response (null when idempotent skip or on
   *  error before response arrived). Playwright's `response.status()`
   *  is captured where available. */
  readonly status: number | null;
  /** Wall-clock time from the first page.url() read until the envelope
   *  is built. Includes the cost of the idempotence check itself. */
  readonly timingMs: number;
  /** Three-valued classification — see NavigationClassification. */
  readonly classification: NavigationClassification;
  /** Route-type classification of the target URL (for workshop metric
   *  stratification). */
  readonly routeType: RouteType;
  /** Populated when classification === 'navigated-with-error'. */
  readonly errorMessage?: string;
}

/** Minimal Playwright Page surface needed for navigation. The observe-
 *  side aria/state modules already import Page from @playwright/test; we
 *  keep this module dependency-light by structurally typing what we use. */
export interface NavigableSurface {
  url(): string;
  goto(url: string, options?: { waitUntil?: WaitUntilOption; timeout?: number }): Promise<{ status(): number } | null>;
}

/** True when the two URLs refer to the same page (including query string
 *  and hash equality). Absolute / relative URL differences are normalized
 *  via URL when both parse; otherwise a plain string compare is used as
 *  a fallback. */
function sameUrl(current: string, target: string): boolean {
  if (current === target) return true;
  try {
    return new URL(current).toString() === new URL(target, current).toString();
  } catch {
    return false;
  }
}

/**
 * Perform an idempotent navigation.
 *
 * The v2 shape adjustment: `page.url()` is read BEFORE `page.goto()`
 * to short-circuit when the page is already at the target URL.
 * This matters for two v2 workflows:
 *
 *   1. `scenario.ts` pre-navigation. When multiple steps on the same
 *      scenario stay on the same screen, the pre-nav fired before every
 *      non-navigate action would re-goto the same URL — discarding the
 *      in-flight form state and the post-action screen.
 *   2. test-compose's regenerated facade. A facade that emits a
 *      pre-goto per step becomes self-defeating when multiple steps
 *      target the same screen; the idempotent check makes repeated
 *      pre-navs free.
 *
 * Returns a NavigationReceipt envelope that callers can log or route
 * to the workshop's metric surface.
 */
export async function performNavigation(
  page: NavigableSurface,
  url: string,
  metadata?: { readonly routeType?: RouteType },
): Promise<NavigationReceipt> {
  const start = Date.now();
  const currentUrl = page.url();
  const routeType = classifyRoute(url, metadata);
  if (sameUrl(currentUrl, url)) {
    return {
      reachedUrl: currentUrl,
      status: null,
      timingMs: Date.now() - start,
      classification: 'skipped-idempotent',
      routeType,
    };
  }

  const navOpts = navigationOptionsForRoute(routeType);
  try {
    const response = await page.goto(url, {
      waitUntil: navOpts.waitUntil,
      timeout: navOpts.timeout,
    });
    const status = response ? response.status() : null;
    return {
      reachedUrl: page.url(),
      status,
      timingMs: Date.now() - start,
      classification: 'navigated',
      routeType,
    };
  } catch (error) {
    return {
      reachedUrl: page.url(),
      status: null,
      timingMs: Date.now() - start,
      classification: 'navigated-with-error',
      routeType,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

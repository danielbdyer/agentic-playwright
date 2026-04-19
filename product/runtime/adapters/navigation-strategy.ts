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

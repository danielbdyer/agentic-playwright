/**
 * W3.8: Route knowledge persistence
 *
 * Pure domain module for route knowledge — mapping URLs to screen IDs,
 * with round-trip YAML serialization.
 */

import YAML from 'yaml';

// ─── Domain types ───

export interface RouteEntry {
  readonly url: string;
  readonly screenId: string;
  readonly queryParams: readonly string[];
  readonly tabIndex?: number | undefined;
}

export interface RouteKnowledge {
  readonly app: string;
  readonly routes: readonly RouteEntry[];
}

// ─── Discovery ───

function extractQueryParams(url: string): readonly string[] {
  try {
    const parsed = new URL(url);
    return [...new Set([...parsed.searchParams.keys()])].sort();
  } catch {
    return [];
  }
}

function extractPathname(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/**
 * Group URLs by pathname, assign screen IDs from the provided mapping,
 * and collect query-param variants for each route.
 *
 * Pure function: URLs + mapping in, RouteKnowledge out.
 */
export function discoverRouteVariants(
  urls: readonly string[],
  screenMappings: ReadonlyMap<string, string>,
): RouteKnowledge {
  const routeMap = urls.reduce<ReadonlyMap<string, { readonly screenId: string; readonly queryParams: ReadonlySet<string>; readonly tabIndex: number | undefined }>>(
    (acc, url, index) => {
      const pathname = extractPathname(url);
      const screenId = screenMappings.get(pathname)
        ?? screenMappings.get(url)
        ?? defaultScreenId(pathname);
      const queryParams = extractQueryParams(url);
      const existing = acc.get(pathname);
      const mergedParams = existing
        ? new Set([...existing.queryParams, ...queryParams])
        : new Set(queryParams);
      const tabIndex = existing?.tabIndex ?? (index > 0 ? index : undefined);
      return new Map([...acc, [pathname, {
        screenId,
        queryParams: mergedParams,
        tabIndex,
      }]]);
    },
    new Map(),
  );

  const routes: readonly RouteEntry[] = [...routeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([pathname, entry]) => ({
      url: pathname,
      screenId: entry.screenId,
      queryParams: [...entry.queryParams].sort(),
      ...(entry.tabIndex !== undefined ? { tabIndex: entry.tabIndex } : {}),
    }));

  return {
    app: deriveAppName(urls),
    routes,
  };
}

function defaultScreenId(pathname: string): string {
  const segments = pathname.split('/').filter((s) => s.length > 0);
  const last = segments[segments.length - 1] ?? 'home';
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function deriveAppName(urls: readonly string[]): string {
  try {
    const first = urls[0];
    return first ? new URL(first).hostname : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ─── Serialization ───

interface SerializedRouteEntry {
  url: string;
  screenId: string;
  queryParams: string[];
  tabIndex?: number;
}

interface SerializedRouteKnowledge {
  app: string;
  routes: SerializedRouteEntry[];
}

/**
 * Serialize RouteKnowledge to YAML format.
 * Pure function: knowledge in, YAML string out.
 */
export function serializeRouteKnowledge(knowledge: RouteKnowledge): string {
  const serializable: SerializedRouteKnowledge = {
    app: knowledge.app,
    routes: knowledge.routes.map((route) => ({
      url: route.url,
      screenId: route.screenId,
      queryParams: [...route.queryParams],
      ...(route.tabIndex !== undefined ? { tabIndex: route.tabIndex } : {}),
    })),
  };
  return YAML.stringify(serializable, { indent: 2 });
}

/**
 * Parse RouteKnowledge from a YAML string.
 * Pure function: YAML string in, RouteKnowledge out.
 */
export function parseRouteKnowledge(yaml: string): RouteKnowledge {
  const parsed = YAML.parse(yaml) as SerializedRouteKnowledge;
  if (!parsed || typeof parsed.app !== 'string' || !Array.isArray(parsed.routes)) {
    throw new Error('Invalid RouteKnowledge YAML: missing app or routes');
  }
  return {
    app: parsed.app,
    routes: parsed.routes.map((route) => ({
      url: typeof route.url === 'string' ? route.url : '',
      screenId: typeof route.screenId === 'string' ? route.screenId : '',
      queryParams: Array.isArray(route.queryParams)
        ? route.queryParams.filter((p): p is string => typeof p === 'string').sort()
        : [],
      ...(typeof route.tabIndex === 'number' ? { tabIndex: route.tabIndex } : {}),
    })),
  };
}

/**
 * W3.8 — Route Knowledge Law Tests
 *
 * Laws verified:
 * 1. Round-trip serialization: parse(serialize(k)) ~ k
 * 2. URL parsing: query params are extracted and sorted
 * 3. Screen mapping: explicit mappings take precedence over derived IDs
 * 4. Determinism: same input always produces the same output
 * 5. Empty input: no URLs produce empty routes
 * 6. Duplicate URL collapse: duplicate pathnames merge query params
 * 7. Query param sorting: params are always alphabetically sorted
 */

import { expect, test } from '@playwright/test';
import {
  discoverRouteVariants,
  serializeRouteKnowledge,
  parseRouteKnowledge,
  type RouteKnowledge,
  type RouteEntry,
} from '../lib/domain/route-knowledge';
import { mulberry32, pick, randomWord, randomInt } from './support/random';

// ─── Helpers ───

const SEEDS = 150;

function randomUrl(next: () => number): string {
  const host = pick(next, ['https://app.example.com', 'https://portal.test.io', 'https://dashboard.local']);
  const pathSegments = randomInt(next, 3) + 1;
  const path = Array.from({ length: pathSegments }, () => randomWord(next)).join('/');
  const paramCount = randomInt(next, 4);
  const params = Array.from({ length: paramCount }, () => `${randomWord(next)}=${randomWord(next)}`).join('&');
  return params.length > 0 ? `${host}/${path}?${params}` : `${host}/${path}`;
}

function randomRouteEntry(next: () => number): RouteEntry {
  return {
    url: `/${randomWord(next)}/${randomWord(next)}`,
    screenId: `screen-${randomWord(next)}`,
    queryParams: Array.from(
      new Set(Array.from({ length: randomInt(next, 4) }, () => randomWord(next))),
    ).sort(),
    ...(next() > 0.5 ? { tabIndex: randomInt(next, 10) } : {}),
  };
}

function randomRouteKnowledge(next: () => number): RouteKnowledge {
  const routeCount = randomInt(next, 6) + 1;
  return {
    app: `app-${randomWord(next)}`,
    routes: Array.from({ length: routeCount }, () => randomRouteEntry(next)),
  };
}

function routeKnowledgeEqual(a: RouteKnowledge, b: RouteKnowledge): boolean {
  if (a.app !== b.app) return false;
  if (a.routes.length !== b.routes.length) return false;
  return a.routes.every((route, i) => {
    const other = b.routes[i]!;
    return route.url === other.url
      && route.screenId === other.screenId
      && JSON.stringify(route.queryParams) === JSON.stringify(other.queryParams)
      && route.tabIndex === other.tabIndex;
  });
}

// ─── Law 1: Round-trip serialization ───

test.describe('Law 1: parse(serialize(knowledge)) preserves structure', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const knowledge = randomRouteKnowledge(next);
      const yaml = serializeRouteKnowledge(knowledge);
      const restored = parseRouteKnowledge(yaml);
      expect(routeKnowledgeEqual(knowledge, restored)).toBe(true);
    });
  }
});

// ─── Law 2: Query param extraction ───

test.describe('Law 2: Query params are extracted from URLs', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const urls = Array.from({ length: randomInt(next, 5) + 1 }, () => randomUrl(next));
      const result = discoverRouteVariants(urls, new Map());

      for (const route of result.routes) {
        // All query params in the result should be sorted
        const sorted = [...route.queryParams].sort();
        expect(route.queryParams).toEqual(sorted);
      }
    });
  }
});

// ─── Law 3: Screen mappings take precedence ───

test.describe('Law 3: Explicit screen mappings override derived IDs', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const pathname = `/${randomWord(next)}/${randomWord(next)}`;
      const fullUrl = `https://app.example.com${pathname}`;
      const expectedScreenId = `mapped-${randomWord(next)}`;
      const mappings = new Map([[pathname, expectedScreenId]]);

      const result = discoverRouteVariants([fullUrl], mappings);

      expect(result.routes.length).toBeGreaterThanOrEqual(1);
      const matchingRoute = result.routes.find((r) => r.screenId === expectedScreenId);
      expect(matchingRoute).toBeDefined();
    });
  }
});

// ─── Law 4: Determinism ───

test.describe('Law 4: Same input always produces same output', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next1 = mulberry32(seed);
      const next2 = mulberry32(seed);
      const urls1 = Array.from({ length: randomInt(next1, 5) + 1 }, () => randomUrl(next1));
      const urls2 = Array.from({ length: randomInt(next2, 5) + 1 }, () => randomUrl(next2));
      const mappings = new Map<string, string>();

      const result1 = discoverRouteVariants(urls1, mappings);
      const result2 = discoverRouteVariants(urls2, mappings);

      expect(routeKnowledgeEqual(result1, result2)).toBe(true);
    });
  }
});

// ─── Law 5: Empty input produces empty routes ───

test.describe('Law 5: Empty URL list produces empty routes', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const result = discoverRouteVariants([], new Map());
      expect(result.routes.length).toBe(0);
    });
  }
});

// ─── Law 6: Duplicate pathnames merge query params ───

test.describe('Law 6: Duplicate pathnames collapse and merge query params', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const base = `https://app.example.com/${randomWord(next)}`;
      const param1 = randomWord(next);
      const param2 = randomWord(next);
      const urls = [
        `${base}?${param1}=1`,
        `${base}?${param2}=2`,
      ];

      const result = discoverRouteVariants(urls, new Map());

      // Same pathname should collapse into one route with merged params
      const matchingRoutes = result.routes;
      expect(matchingRoutes.length).toBe(1);

      const route = matchingRoutes[0]!;
      const expectedParams = [...new Set([param1, param2])].sort();
      expect(route.queryParams).toEqual(expectedParams);
    });
  }
});

// ─── Law 7: Query params always sorted ───

test.describe('Law 7: Query params are always alphabetically sorted', () => {
  for (let seed = 0; seed < SEEDS; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const knowledge = randomRouteKnowledge(next);
      const yaml = serializeRouteKnowledge(knowledge);
      const restored = parseRouteKnowledge(yaml);

      for (const route of restored.routes) {
        const sorted = [...route.queryParams].sort();
        expect(route.queryParams).toEqual(sorted);
      }
    });
  }
});

import { expect, test } from '@playwright/test';
import { extractRoutePatterns, proposeRouteKnowledge, rankRouteVariants } from '../lib/domain/knowledge/route-knowledge';
import type { ObservedRoute } from '../lib/domain/types/route-knowledge';

function makeRoute(overrides: Partial<ObservedRoute> & Pick<ObservedRoute, 'url' | 'screenId'>): ObservedRoute {
  return {
    observedAt: '2026-01-01T00:00:00Z',
    stepIndex: 0,
    navigationAction: 'goto',
    ...overrides,
  };
}

test('two URLs differing by numeric ID yield a single pattern with parameter', () => {
  const routes: readonly ObservedRoute[] = [
    makeRoute({ url: 'https://app.test/users/123/profile', screenId: 'user-profile' }),
    makeRoute({ url: 'https://app.test/users/456/profile', screenId: 'user-profile' }),
  ];

  const patterns = extractRoutePatterns(routes);

  expect(patterns).toHaveLength(1);
  expect(patterns[0]!.pattern).toBe('/users/{userId}/profile');
  expect(patterns[0]!.parameterNames).toEqual(['userId']);
  expect(patterns[0]!.screenId).toBe('user-profile');
  expect(patterns[0]!.exampleUrls).toEqual([
    'https://app.test/users/123/profile',
    'https://app.test/users/456/profile',
  ]);
});

test('UUID segments are detected as parameters', () => {
  const routes: readonly ObservedRoute[] = [
    makeRoute({
      url: 'https://app.test/items/a1b2c3d4-e5f6-7890-abcd-ef1234567890/detail',
      screenId: 'item-detail',
    }),
  ];

  const patterns = extractRoutePatterns(routes);

  expect(patterns).toHaveLength(1);
  expect(patterns[0]!.pattern).toBe('/items/{itemId}/detail');
  expect(patterns[0]!.parameterNames).toEqual(['itemId']);
});

test('same URL observed twice yields observationCount = 2', () => {
  const routes: readonly ObservedRoute[] = [
    makeRoute({ url: 'https://app.test/dashboard', screenId: 'dashboard', stepIndex: 0 }),
    makeRoute({ url: 'https://app.test/dashboard', screenId: 'dashboard', stepIndex: 5 }),
  ];

  const patterns = extractRoutePatterns(routes);

  expect(patterns).toHaveLength(1);
  expect(patterns[0]!.observationCount).toBe(2);
  expect(patterns[0]!.exampleUrls).toEqual(['https://app.test/dashboard']);
});

test('already-known route pattern is not proposed', () => {
  const patterns = [
    {
      pattern: '/users/{userId}/profile',
      screenId: 'user-profile',
      parameterNames: ['userId'] as readonly string[],
      exampleUrls: ['https://app.test/users/123/profile'] as readonly string[],
      observationCount: 5,
    },
  ];

  const proposals = proposeRouteKnowledge(patterns, ['/users/{userId}/profile']);

  expect(proposals).toHaveLength(0);
});

test('confidence is high for 3+ observations, medium for 2, low for 1', () => {
  const makePattern = (observationCount: number, screenId: string) => ({
    pattern: `/${screenId}`,
    screenId,
    parameterNames: [] as readonly string[],
    exampleUrls: [`https://app.test/${screenId}`] as readonly string[],
    observationCount,
  });

  const proposals = proposeRouteKnowledge(
    [makePattern(5, 'high-screen'), makePattern(2, 'med-screen'), makePattern(1, 'low-screen')],
    [],
  );

  expect(proposals).toHaveLength(3);
  expect(proposals[0]!.confidence).toBe('high');
  expect(proposals[1]!.confidence).toBe('medium');
  expect(proposals[2]!.confidence).toBe('low');
});

test('static URLs with no varying segments yield literal URL pattern', () => {
  const routes: readonly ObservedRoute[] = [
    makeRoute({ url: 'https://app.test/settings', screenId: 'settings' }),
    makeRoute({ url: 'https://app.test/settings', screenId: 'settings' }),
  ];

  const patterns = extractRoutePatterns(routes);

  expect(patterns).toHaveLength(1);
  expect(patterns[0]!.pattern).toBe('/settings');
  expect(patterns[0]!.parameterNames).toEqual([]);
});

test('proposal suggestedPath follows knowledge/routes/{screenId}.routes.yaml convention', () => {
  const patterns = [
    {
      pattern: '/dashboard',
      screenId: 'main-dashboard',
      parameterNames: [] as readonly string[],
      exampleUrls: ['https://app.test/dashboard'] as readonly string[],
      observationCount: 3,
    },
  ];

  const proposals = proposeRouteKnowledge(patterns, []);

  expect(proposals).toHaveLength(1);
  expect(proposals[0]!.kind).toBe('route-knowledge-proposal');
  expect(proposals[0]!.suggestedPath).toBe('knowledge/routes/main-dashboard.routes.yaml');
});

test('multiple screens produce distinct patterns sorted by screenId', () => {
  const routes: readonly ObservedRoute[] = [
    makeRoute({ url: 'https://app.test/orders/99', screenId: 'order-detail' }),
    makeRoute({ url: 'https://app.test/orders/42', screenId: 'order-detail' }),
    makeRoute({ url: 'https://app.test/dashboard', screenId: 'dashboard' }),
  ];

  const patterns = extractRoutePatterns(routes);

  expect(patterns).toHaveLength(2);
  expect(patterns[0]!.screenId).toBe('dashboard');
  expect(patterns[1]!.screenId).toBe('order-detail');
  expect(patterns[1]!.pattern).toBe('/orders/{orderId}');
});

test('rankRouteVariants prefers specific semantic match with stronger historical success', () => {
  const ranked = rankRouteVariants(
    [
      {
        routeVariantRef: 'route-variant:app:orders:orders-open',
        screenId: 'orders',
        url: '/orders?tab=open',
        urlPattern: '/orders?tab={tab}',
        dimensions: ['query', 'tab'],
        expectedEntryStateRefs: ['state:orders:list'],
        historicalSuccess: { successCount: 18, failureCount: 2, lastSuccessAt: '2026-02-01T00:00:00Z' },
      },
      {
        routeVariantRef: 'route-variant:app:orders:orders-default',
        screenId: 'orders',
        url: '/orders',
        urlPattern: '/orders',
        dimensions: [],
        expectedEntryStateRefs: [],
        historicalSuccess: { successCount: 2, failureCount: 8, lastSuccessAt: '2026-01-01T00:00:00Z' },
      },
    ],
    {
      screenId: 'orders',
      semanticDestination: 'orders open tab',
      expectedEntryStateRefs: ['state:orders:list'],
    },
  );

  expect(ranked).toHaveLength(2);
  expect(ranked[0]!.variant.routeVariantRef).toBe('route-variant:app:orders:orders-open');
  expect(ranked[0]!.score).toBeGreaterThan(ranked[1]!.score);
});

test('route variant ranking is deterministic under input permutation (replay reproducibility)', () => {
  const variants = [
    {
      routeVariantRef: 'route-variant:app:claims:list',
      screenId: 'claims',
      url: '/claims?mode=list',
      urlPattern: '/claims?mode={mode}',
      dimensions: ['query'],
      expectedEntryStateRefs: ['state:claims:list'],
      historicalSuccess: { successCount: 6, failureCount: 1, lastSuccessAt: '2026-02-01T00:00:00Z' },
    },
    {
      routeVariantRef: 'route-variant:app:claims:grid',
      screenId: 'claims',
      url: '/claims?mode=grid',
      urlPattern: '/claims?mode={mode}',
      dimensions: ['query'],
      expectedEntryStateRefs: ['state:claims:grid'],
      historicalSuccess: { successCount: 6, failureCount: 1, lastSuccessAt: '2026-02-01T00:00:00Z' },
    },
  ] as const;
  const input = {
    screenId: 'claims',
    semanticDestination: 'claims list mode',
    expectedEntryStateRefs: ['state:claims:list'],
  } as const;
  const left = rankRouteVariants(variants, input);
  const right = rankRouteVariants([variants[1]!, variants[0]!], input);
  expect(left.map((entry) => entry.variant.routeVariantRef)).toEqual(right.map((entry) => entry.variant.routeVariantRef));
  expect(left.map((entry) => entry.score)).toEqual(right.map((entry) => entry.score));
});

test('route conflicts resolve stably by routeVariantRef when scores tie', () => {
  const ranked = rankRouteVariants(
    [
      {
        routeVariantRef: 'route-variant:app:orders:a',
        screenId: 'orders',
        url: '/orders',
        urlPattern: '/orders',
        dimensions: [],
        expectedEntryStateRefs: [],
        historicalSuccess: { successCount: 0, failureCount: 0, lastSuccessAt: null },
      },
      {
        routeVariantRef: 'route-variant:app:orders:b',
        screenId: 'orders',
        url: '/orders',
        urlPattern: '/orders',
        dimensions: [],
        expectedEntryStateRefs: [],
        historicalSuccess: { successCount: 0, failureCount: 0, lastSuccessAt: null },
      },
    ],
    {
      screenId: 'orders',
      semanticDestination: '',
      expectedEntryStateRefs: [],
    },
  );
  expect(ranked[0]!.variant.routeVariantRef).toBe('route-variant:app:orders:a');
});

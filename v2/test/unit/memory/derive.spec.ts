import { describe, expect, it } from 'vitest';
import type { Facet, FacetLocator, FacetStatus } from '../../../src/contract/schemas.js';
import {
  applyGating,
  emptyStats,
  facetHealth,
  facetHealthWindow,
  foldEvents,
  healthFromCounts,
  locatorHealth,
  nextStatus,
  orderLocators,
  projectFacet,
  reconcileHumanEdits,
  type FacetStats,
} from '../../../src/memory/derive.js';
import { parseEvidence } from '../../../src/memory/evidence.js';
import { locatorKeyOf } from '../../../src/memory/ids.js';
import type { EvidenceEvent, GatingConfig, ResolveOutcome, ResolutionSource } from '../../../src/memory/types.js';
import { counterFactory, facet, thrown } from './helpers.js';

const CONFIG: GatingConfig = { promoteAfterPasses: 3, staleHealthFloor: 0.5, staleMinAttempts: 4 };
const BUTTON: FacetLocator = { strategy: 'role-name', role: 'button', name: 'Search' };
const CSS: FacetLocator = { strategy: 'css', value: '#b3-Search' };
const ID = 'policy-search:search-button';

const resolvedEvents = (make: ReturnType<typeof counterFactory>, outcomes: readonly ResolveOutcome[], source: ResolutionSource = 'act', locator = BUTTON): EvidenceEvent[] =>
  outcomes.map((outcome) => make({ kind: 'resolved', facetId: ID, locatorKey: locatorKeyOf(locator), outcome, source }));

const minted = (make: ReturnType<typeof counterFactory>): EvidenceEvent =>
  make({
    kind: 'minted',
    facetId: ID,
    facetKind: 'element',
    displayName: 'Search',
    provenance: { mintedAt: '2026-09-20T14:00:00.000Z', instrument: 'app.act' },
    locatorKeys: [locatorKeyOf(BUTTON)],
    locators: [BUTTON],
    verified: true,
  });

describe('health counts (laws lifted from v1)', () => {
  it('computes rate and flakiness', () => {
    expect(healthFromCounts(8, 10)).toMatchObject({ rate: 0.8 });
    expect(healthFromCounts(8, 10).flakiness).toBeCloseTo(0.64, 10);
    expect(healthFromCounts(10, 10).flakiness).toBe(0);
    expect(healthFromCounts(0, 10).flakiness).toBe(0);
    expect(healthFromCounts(5, 10).flakiness).toBe(1);
  });

  it('counts zero attempts as healthy', () => {
    expect(healthFromCounts(0, 0)).toEqual({ successes: 0, attempts: 0, rate: 1, flakiness: 0 });
  });

  it('rejects negative counts and successes above attempts', () => {
    expect(thrown(() => healthFromCounts(-1, 3)).family).toBe('invalid-input');
    expect(thrown(() => healthFromCounts(4, 3)).family).toBe('invalid-input');
  });
});

describe('evidence fold', () => {
  it('is deterministic: the same events give the same stats, also after a JSONL round trip', () => {
    const make = counterFactory();
    const events = [
      minted(make),
      ...resolvedEvents(make, ['ok', 'ok', 'not-found']),
      make({ kind: 'test-run', facetIds: [ID], testCaseId: '10001', runId: 'r1', outcome: 'passed' }),
      make({ kind: 'accepted', facetIds: [ID], testCaseId: '10001', reviewer: 'qa', decision: 'accept' }),
    ];
    const once = foldEvents(events);
    expect(foldEvents(events)).toEqual(once);
    const replayed = parseEvidence(events.map((e) => JSON.stringify(e)).join('\n'));
    expect(replayed.skipped).toBe(0);
    expect(foldEvents(replayed.events)).toEqual(once);
    expect(once[ID]).toMatchObject({ passesSinceChange: 1, acceptedSinceChange: true, lastStatus: 'candidate', runs: 1, passes: 1 });
  });

  it('keeps a sliding window of the last 20 attempts per locator', () => {
    const make = counterFactory();
    const events = [minted(make), ...resolvedEvents(make, Array<ResolveOutcome>(5).fill('not-found')), ...resolvedEvents(make, Array<ResolveOutcome>(20).fill('ok'))];
    const stats = foldEvents(events)[ID];
    expect(locatorHealth(stats, BUTTON)).toMatchObject({ successes: 20, attempts: 20, rate: 1 });
  });

  it('treats not-enabled as neutral (the element was found; it was disabled)', () => {
    const make = counterFactory();
    const stats = foldEvents([minted(make), ...resolvedEvents(make, ['ok', 'not-enabled', 'not-enabled'])])[ID];
    expect(locatorHealth(stats, BUTTON)).toMatchObject({ successes: 1, attempts: 1 });
  });

  it('ignores preflight misses until preflight has seen the facet resolve', () => {
    const make = counterFactory();
    const unseen = foldEvents([minted(make), ...resolvedEvents(make, ['not-found', 'not-found'], 'preflight')])[ID];
    expect(locatorHealth(unseen, BUTTON).attempts).toBe(0);
    const seen = foldEvents([minted(make), ...resolvedEvents(make, ['ok', 'not-found', 'not-found'], 'preflight')])[ID];
    expect(locatorHealth(seen, BUTTON)).toMatchObject({ successes: 1, attempts: 3 });
  });

  it('resets the since-change counters when a locator is added or the status changes', () => {
    const make = counterFactory();
    const base = [minted(make), make({ kind: 'test-run', facetIds: [ID], testCaseId: '1', runId: 'r1', outcome: 'passed' })];
    expect(foldEvents(base)[ID]?.passesSinceChange).toBe(1);
    const enriched = make({ kind: 'enriched', facetId: ID, via: 'enrich', aliasesAdded: [], locatorAdded: { key: locatorKeyOf(CSS), locator: CSS, verified: false }, snapshotId: 's', candidateRef: 'c' });
    expect(foldEvents([...base, enriched])[ID]?.passesSinceChange).toBe(0);
    const aliasOnly = make({ kind: 'enriched', facetId: ID, via: 'enrich', aliasesAdded: ['find'], snapshotId: 's', candidateRef: 'c' });
    expect(foldEvents([...base, aliasOnly])[ID]?.passesSinceChange).toBe(1);
  });

  it('a human status edit clears the health window (the human looked)', () => {
    const make = counterFactory();
    const events = [minted(make), ...resolvedEvents(make, ['not-found', 'not-found'])];
    const human = make({ kind: 'status', facetId: ID, from: 'candidate', to: 'trusted', reason: 'human', by: 'human' });
    const stats = foldEvents([...events, human])[ID];
    expect(locatorHealth(stats, BUTTON).attempts).toBe(0);
    expect(stats?.lastStatus).toBe('trusted');
  });

  it('counts only locator-family failures against the failing facet', () => {
    const make = counterFactory();
    const run = (family?: string): FacetStats | undefined =>
      foldEvents([minted(make), make({ kind: 'test-run', facetIds: [ID], testCaseId: '1', runId: 'r', outcome: 'failed', failedFacet: ID, ...(family !== undefined ? { failureFamily: family } : {}) })])[ID];
    expect(run('not-found')?.failuresSinceChange).toBe(1);
    expect(run('assertion-like')?.failuresSinceChange).toBe(0);
    expect(run('timeout')?.failuresSinceChange).toBe(0);
    expect(run(undefined)?.failuresSinceChange).toBe(1);
  });

  it('moves stats on an id migration', () => {
    const make = counterFactory();
    const events = [minted(make), ...resolvedEvents(make, ['ok']), make({ kind: 'id-migration', from: ID, to: 'policy-search:find-button', reason: 'element-renamed-upstream', rationale: 'renamed', by: 'human' })];
    const stats = foldEvents(events);
    expect(stats[ID]).toBeUndefined();
    expect(stats['policy-search:find-button']?.facetId).toBe('policy-search:find-button');
  });
});

describe('facet health', () => {
  it('is the best locator rate, ties broken by more attempts; no locators is healthy', () => {
    const make = counterFactory();
    const f = facet({ id: ID, locators: [BUTTON, CSS] });
    const stats = foldEvents([...resolvedEvents(make, ['not-found', 'not-found', 'not-found', 'not-found']), ...resolvedEvents(make, ['not-found'], 'act', CSS)])[ID];
    expect(facetHealthWindow(f, stats)).toMatchObject({ rate: 0, attempts: 4 });
    expect(facetHealth(f, stats)).toBe(0);
    expect(facetHealth(facet({ id: ID }), undefined)).toBe(1);
    // An untried fallback is healthy until it fails.
    expect(facetHealth(facet({ id: ID, locators: [BUTTON, { strategy: 'text', value: 'Search' }] }), stats)).toBe(1);
  });
});

describe('locator order', () => {
  const ladder: FacetLocator[] = [
    { strategy: 'css', value: '#x' },
    { strategy: 'test-id', value: 'x' },
    { strategy: 'text', value: 'X' },
    { strategy: 'placeholder', value: 'X' },
    { strategy: 'label', value: 'X' },
    { strategy: 'role-name', role: 'button', name: 'X' },
  ];

  it('orders healthy locators by ladder rank', () => {
    expect(orderLocators(ladder, () => 1, 0.5).map((l) => l.strategy)).toEqual(['role-name', 'label', 'placeholder', 'text', 'test-id', 'css']);
  });

  it('puts healthy locators before unhealthy ones whatever their rank', () => {
    const rate = (l: FacetLocator): number => (l.strategy === 'role-name' ? 0.2 : 1);
    expect(orderLocators(ladder, rate, 0.5).map((l) => l.strategy)).toEqual(['label', 'placeholder', 'text', 'test-id', 'css', 'role-name']);
  });

  it('is stable: among equals the earlier locator stays first', () => {
    const a: FacetLocator = { strategy: 'role-name', role: 'button', name: 'Find' };
    const b: FacetLocator = { strategy: 'role-name', role: 'button', name: 'Search' };
    expect(orderLocators([a, b], () => 1, 0.5)).toEqual([a, b]);
    expect(orderLocators([b, a], () => 1, 0.5)).toEqual([b, a]);
  });

  it('projectFacet writes health strings and orders by evidence', () => {
    const make = counterFactory();
    const stats = foldEvents(resolvedEvents(make, ['not-found', 'not-found', 'ok']))[ID];
    const projected = projectFacet(facet({ id: ID, locators: [BUTTON, CSS] }), stats, 0.5);
    expect(projected.locators.map((l) => [l.strategy, l.health])).toEqual([['css', '0/0'], ['role-name', '1/3']]);
  });
});

describe('nextStatus transition table', () => {
  const failing = (n: number): FacetStats => {
    const make = counterFactory();
    return foldEvents(resolvedEvents(make, Array<ResolveOutcome>(n).fill('not-found')))[ID] ?? emptyStats(ID);
  };
  const withStatus = (status: FacetStatus): Facet => facet({ id: ID, status, locators: [BUTTON] });
  const passes = (n: number, failures = 0): FacetStats => ({ ...emptyStats(ID), passesSinceChange: n, failuresSinceChange: failures });

  const table: ReadonlyArray<readonly [string, FacetStatus, FacetStats, ReturnType<typeof nextStatus>]> = [
    ['fresh candidate stays', 'candidate', emptyStats(ID), null],
    ['candidate accepted → trusted', 'candidate', { ...emptyStats(ID), acceptedSinceChange: true }, { to: 'trusted', reason: 'accepted' }],
    ['candidate after 3 clean passes → trusted', 'candidate', passes(3), { to: 'trusted', reason: 'passes' }],
    ['candidate after 2 passes stays', 'candidate', passes(2), null],
    ['candidate with a failure since change stays', 'candidate', passes(5, 1), null],
    ['candidate below the floor with 4 attempts → stale', 'candidate', failing(4), { to: 'stale', reason: 'health-floor' }],
    ['candidate below the floor with 3 attempts stays', 'candidate', failing(3), null],
    ['trusted below the floor → stale', 'trusted', failing(4), { to: 'stale', reason: 'health-floor' }],
    ['trusted accepted stays trusted', 'trusted', { ...emptyStats(ID), acceptedSinceChange: true }, null],
    ['stale stays stale even when accepted', 'stale', { ...emptyStats(ID), acceptedSinceChange: true }, null],
    ['stale below the floor stays (no repeat)', 'stale', failing(10), null],
    ['retired never moves', 'retired', failing(10), null],
    ['staleness wins over promotion', 'candidate', { ...failing(4), acceptedSinceChange: true }, { to: 'stale', reason: 'health-floor' }],
  ];

  it.each(table)('%s', (_name, status, stats, expected) => {
    expect(nextStatus(withStatus(status), stats, CONFIG)).toEqual(expected);
  });

  it('reads its thresholds from the config', () => {
    expect(nextStatus(withStatus('candidate'), passes(1), { ...CONFIG, promoteAfterPasses: 1 })).toEqual({ to: 'trusted', reason: 'passes' });
    expect(nextStatus(withStatus('candidate'), failing(2), { ...CONFIG, staleMinAttempts: 2 })).toEqual({ to: 'stale', reason: 'health-floor' });
  });
});

describe('gating and reconciliation', () => {
  it('applyGating emits a status event per transition and resets the counters it consumed', () => {
    const make = counterFactory();
    const catalog = { screen: 'policy-search', facets: [facet({ id: ID, locators: [BUTTON] })] };
    const stats = { [ID]: { ...emptyStats(ID), passesSinceChange: 3 } };
    const gated = applyGating(catalog, stats, CONFIG, make);
    expect(gated.changes).toEqual([{ facetId: ID, from: 'candidate', to: 'trusted', reason: 'passes' }]);
    expect(gated.events).toHaveLength(1);
    expect(gated.events[0]).toMatchObject({ kind: 'status', by: 'tool', from: 'candidate', to: 'trusted' });
    expect(gated.catalog.facets[0]?.status).toBe('trusted');
    expect(gated.stats[ID]?.passesSinceChange).toBe(0);
    // A second pass is a fixpoint.
    expect(applyGating(gated.catalog, gated.stats, CONFIG, make).events).toHaveLength(0);
  });

  it('reconcileHumanEdits records a YAML status that differs from the log as a human edit', () => {
    const make = counterFactory();
    const stats = foldEvents([minted(make)]);
    const edited = { screen: 'policy-search', facets: [facet({ id: ID, status: 'trusted' }), facet({ id: 'policy-search:other', status: 'candidate' })] };
    const events = reconcileHumanEdits(edited, stats, make);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ kind: 'status', facetId: ID, from: 'candidate', to: 'trusted', reason: 'human', by: 'human' });
    expect(reconcileHumanEdits(edited, foldEvents(events, stats), make)).toHaveLength(0);
  });
});

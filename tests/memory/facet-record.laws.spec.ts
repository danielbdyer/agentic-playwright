/**
 * FacetRecord laws — Step 3.
 *
 * Verifies the unified facet-record shape, stable-ID discipline,
 * provenance atomicity, locator-strategy health co-location, and
 * the kind-extension fold.
 *
 * @see docs/v2-direction.md §6 Step 3
 */

import { describe, test, expect } from 'vitest';
import {
  facetIdFrom,
  parseFacetId,
  unsafeCastFacetId,
  type FacetId,
} from '../../product/domain/memory/stable-id';
import {
  mintFacetProvenance,
  type FacetProvenance,
} from '../../product/domain/memory/provenance';
import {
  emptyStrategyHealth,
  healthFromCounts,
  type LocatorStrategyEntry,
} from '../../product/domain/memory/locator-health';
import {
  foldFacetExtension,
  type ElementFacetExtension,
  type StateFacetExtension,
  type VocabularyFacetExtension,
  type RouteFacetExtension,
  type FacetExtension,
} from '../../product/domain/memory/kind-extensions';
import {
  isFacetOfKind,
  type FacetRecord,
} from '../../product/domain/memory/facet-record';

const DEFAULT_PROVENANCE: FacetProvenance = mintFacetProvenance({
  mintedAt: '2026-04-19T00:00:00.000Z',
  instrument: 'observe',
  agentSessionId: 'session-42',
  runId: 'run-001',
  mintedByVerb: 'facet-mint',
});

describe('stable-id laws', () => {
  test('facetIdFrom roundtrips through parseFacetId', () => {
    const id = facetIdFrom('policy-search', 'policyNumberInput');
    expect(parseFacetId(id)).toEqual({
      screen: 'policy-search',
      elementOrConcept: 'policyNumberInput',
    });
  });

  test('facetIdFrom rejects empty segments', () => {
    expect(() => facetIdFrom('', 'x')).toThrow();
    expect(() => facetIdFrom('x', '')).toThrow();
  });

  test('facetIdFrom rejects stray colons in either segment', () => {
    expect(() => facetIdFrom('a:b', 'c')).toThrow();
    expect(() => facetIdFrom('a', 'b:c')).toThrow();
  });

  test('parseFacetId returns null on malformed input', () => {
    expect(parseFacetId('no-colon')).toBeNull();
    expect(parseFacetId('too:many:colons')).toBeNull();
    expect(parseFacetId(':missing-left')).toBeNull();
    expect(parseFacetId('missing-right:')).toBeNull();
  });

  test('unsafeCastFacetId does not validate — callers own discipline', () => {
    const id: FacetId = unsafeCastFacetId('arbitrary-not-validated');
    expect(id).toBe('arbitrary-not-validated');
  });
});

describe('provenance laws', () => {
  test('mintFacetProvenance requires non-empty mintedAt / runId / mintedByVerb', () => {
    expect(() =>
      mintFacetProvenance({ ...DEFAULT_PROVENANCE, mintedAt: '' }),
    ).toThrow();
    expect(() =>
      mintFacetProvenance({ ...DEFAULT_PROVENANCE, runId: '' }),
    ).toThrow();
    expect(() =>
      mintFacetProvenance({ ...DEFAULT_PROVENANCE, mintedByVerb: '' }),
    ).toThrow();
  });

  test('mintFacetProvenance accepts null agentSessionId', () => {
    const p = mintFacetProvenance({
      ...DEFAULT_PROVENANCE,
      agentSessionId: null,
    });
    expect(p.agentSessionId).toBeNull();
  });
});

describe('locator-strategy health laws', () => {
  test('empty strategy has zero counts and stable trend', () => {
    const h = emptyStrategyHealth('role');
    expect(h.kind).toBe('role');
    expect(h.attempts).toBe(0);
    expect(h.successes).toBe(0);
    expect(h.successRate).toBe(0);
    expect(h.flakiness).toBe(0);
    expect(h.trend).toBe('stable');
  });

  test('healthFromCounts computes success rate and flakiness correctly', () => {
    // 10 attempts, 8 successes → rate 0.8, flakiness 4*0.8*0.2 = 0.64.
    const h = healthFromCounts('role', 10, 8, '2026-04-19T00:00:00Z');
    expect(h.successRate).toBeCloseTo(0.8);
    expect(h.flakiness).toBeCloseTo(0.64);
  });

  test('healthFromCounts rejects negative counts and success > attempts', () => {
    expect(() => healthFromCounts('role', -1, 0, null)).toThrow();
    expect(() => healthFromCounts('role', 0, -1, null)).toThrow();
    expect(() => healthFromCounts('role', 5, 10, null)).toThrow();
  });

  test('deterministic paths (all success or all fail) have zero flakiness', () => {
    expect(healthFromCounts('role', 10, 10, null).flakiness).toBe(0);
    expect(healthFromCounts('role', 10, 0, null).flakiness).toBe(0);
  });

  test('50/50 split yields maximum flakiness of 1', () => {
    const h = healthFromCounts('role', 10, 5, null);
    expect(h.flakiness).toBeCloseTo(1);
  });
});

describe('kind-extension fold', () => {
  test('foldFacetExtension dispatches each variant exhaustively', () => {
    const element: ElementFacetExtension = {
      kind: 'element',
      role: 'button',
      locatorStrategies: [],
      interactive: true,
    };
    const state: StateFacetExtension = {
      kind: 'state',
      predicate: 'results-visible',
      dependsOn: [],
    };
    const vocab: VocabularyFacetExtension = {
      kind: 'vocabulary',
      concept: 'policy-number',
      aliases: [{ phrase: 'Policy Number', evidenceCount: 5 }],
    };
    const route: RouteFacetExtension = {
      kind: 'route',
      urlPattern: '/policy-search',
      classification: 'spa',
      variants: [],
    };

    const cases = {
      element: () => 'E',
      state: () => 'S',
      vocabulary: () => 'V',
      route: () => 'R',
    } as const;
    expect(foldFacetExtension(element, cases)).toBe('E');
    expect(foldFacetExtension(state, cases)).toBe('S');
    expect(foldFacetExtension(vocab, cases)).toBe('V');
    expect(foldFacetExtension(route, cases)).toBe('R');
  });
});

describe('FacetRecord type guards', () => {
  function makeRecord(extension: FacetExtension): FacetRecord {
    return {
      id: facetIdFrom('policy-search', 'sample'),
      kind: extension.kind,
      displayName: 'Sample',
      aliases: [],
      scope: 'screen-local',
      extension,
      confidence: 0.5,
      provenance: DEFAULT_PROVENANCE,
      evidenceLogPath: 'product/logs/evidence/policy-search/sample.jsonl',
    };
  }

  test('isFacetOfKind narrows by the extension kind', () => {
    const strategyEntry: LocatorStrategyEntry = {
      kind: 'role',
      expression: 'button[name="Search"]',
      health: emptyStrategyHealth('role'),
    };
    const elementRecord = makeRecord({
      kind: 'element',
      role: 'button',
      locatorStrategies: [strategyEntry],
      interactive: true,
    });

    expect(isFacetOfKind(elementRecord, 'element')).toBe(true);
    expect(isFacetOfKind(elementRecord, 'state')).toBe(false);

    // Narrowed to ElementFacetExtension — this would fail to
    // compile if the narrowing didn't hold.
    if (isFacetOfKind(elementRecord, 'element')) {
      const entries: readonly LocatorStrategyEntry[] = elementRecord.extension.locatorStrategies;
      expect(entries).toHaveLength(1);
    }
  });
});

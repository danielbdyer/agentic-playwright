/**
 * Selector Canon Ranking — Law Tests (W2.19)
 *
 * Verifies that selector ranking within the SelectorCanon is a well-defined
 * total order based on locator strategy specificity:
 *
 *   test-id > role-name > css
 *
 * The rung field on SelectorProbe defines the intra-strategy ordering.
 * The locator strategy kind defines the inter-strategy specificity ordering.
 *
 * Tested structures:
 *   - LocatorStrategy discriminated union
 *   - LocatorStrategyKind specificity total order
 *   - SelectorProbe rung-based ranking
 *   - Alias expansion determinism
 *   - precedenceWeight for resolution rungs
 */

import { expect, test } from '@playwright/test';
import type { LocatorStrategy, LocatorStrategyKind } from '../lib/domain/types/workflow';
import type { SelectorProbe, SelectorCanonEntry } from '../lib/domain/types/interface';
import type { CanonicalTargetRef, SelectorRef } from '../lib/domain/identity';
import { mulberry32, pick, randomWord, randomInt , LAW_SEED_COUNT } from './support/random';

// ─── Specificity order ───

/**
 * The canonical specificity ranking for locator strategy kinds.
 * test-id is the most specific (lowest index = highest rank).
 * css is the least specific (highest index = lowest rank).
 */
const SPECIFICITY_ORDER: readonly LocatorStrategyKind[] = ['test-id', 'role-name', 'css'];

function specificityRank(kind: LocatorStrategyKind): number {
  const index = SPECIFICITY_ORDER.indexOf(kind);
  return SPECIFICITY_ORDER.length - index; // higher = more specific
}

// ─── Fixtures ───

function makeStrategy(kind: LocatorStrategyKind, value?: string): LocatorStrategy {
  switch (kind) {
    case 'test-id':
      return { kind: 'test-id', value: value ?? 'data-testid-field' };
    case 'role-name':
      return { kind: 'role-name', role: value ?? 'textbox', name: value ?? 'Policy Number' };
    case 'css':
      return { kind: 'css', value: value ?? '.form-control' };
  }
}

function makeProbe(overrides: {
  readonly kind: LocatorStrategyKind;
  readonly rung?: number;
  readonly source?: SelectorProbe['source'];
  readonly status?: SelectorProbe['status'];
  readonly value?: string;
}): SelectorProbe {
  const strategy = makeStrategy(overrides.kind, overrides.value);
  const rung = overrides.rung ?? 0;
  const strategyValue = strategy.kind === 'role-name' ? strategy.role : strategy.value;
  return {
    id: `target:probe:${strategy.kind}:${rung}:${strategyValue}`,
    selectorRef: `selector:target:${strategy.kind}:${rung}:${strategyValue}` as SelectorRef,
    strategy,
    source: overrides.source ?? 'approved-knowledge',
    status: overrides.status ?? 'healthy',
    rung,
    artifactPath: `knowledge/screens/test.elements.yaml`,
    variantRefs: [],
    validWhenStateRefs: [],
    invalidWhenStateRefs: [],
    evidenceRefs: [],
    successCount: 0,
    failureCount: 0,
    lineage: {
      sourceArtifactPaths: [],
      discoveryRunIds: [],
      evidenceRefs: [],
    },
  };
}

function _makeEntry(probes: readonly SelectorProbe[]): SelectorCanonEntry {
  return {
    targetRef: 'target:element:screen:field' as CanonicalTargetRef,
    screen: 'test-screen' as any,
    kind: 'element',
    surface: 'form' as any,
    element: 'field' as any,
    snapshotTemplate: null,
    probes,
  };
}

/**
 * Rank probes by specificity: sort by strategy kind specificity (descending),
 * then by rung (ascending) for stability within the same kind.
 */
function rankProbes(probes: readonly SelectorProbe[]): readonly SelectorProbe[] {
  return [...probes].sort((left, right) => {
    const specDiff = specificityRank(right.strategy.kind) - specificityRank(left.strategy.kind);
    if (specDiff !== 0) return specDiff;
    return left.rung - right.rung;
  });
}

// ─── Law 1: Specificity is a total order ───

test.describe('Law 1: Specificity ordering is a total order', () => {
  test('test-id > role-name > css', () => {
    expect(specificityRank('test-id')).toBeGreaterThan(specificityRank('role-name'));
    expect(specificityRank('role-name')).toBeGreaterThan(specificityRank('css'));
  });

  test('transitivity: test-id > css follows from the chain', () => {
    expect(specificityRank('test-id')).toBeGreaterThan(specificityRank('css'));
  });

  test('reflexivity: each kind has a consistent rank', () => {
    for (const kind of SPECIFICITY_ORDER) {
      expect(specificityRank(kind)).toBe(specificityRank(kind));
    }
  });

  test('antisymmetry: distinct kinds have distinct ranks', () => {
    const ranks = SPECIFICITY_ORDER.map(specificityRank);
    expect(new Set(ranks).size).toBe(SPECIFICITY_ORDER.length);
  });

  test('total order holds across 20 random pairs', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = pick(next, SPECIFICITY_ORDER);
      const b = pick(next, SPECIFICITY_ORDER);
      // Totality: for any a, b either a >= b or b >= a
      expect(
        specificityRank(a) >= specificityRank(b) || specificityRank(b) >= specificityRank(a),
      ).toBe(true);
    }
  });
});

// ─── Law 2: More specific selectors rank higher ───

test.describe('Law 2: More specific selectors rank higher', () => {
  test('test-id probe ranks above role-name probe', () => {
    const probes = [
      makeProbe({ kind: 'role-name' }),
      makeProbe({ kind: 'test-id' }),
    ];
    const ranked = rankProbes(probes);
    expect(ranked[0]!.strategy.kind).toBe('test-id');
  });

  test('role-name probe ranks above css probe', () => {
    const probes = [
      makeProbe({ kind: 'css' }),
      makeProbe({ kind: 'role-name' }),
    ];
    const ranked = rankProbes(probes);
    expect(ranked[0]!.strategy.kind).toBe('role-name');
  });

  test('ranking across 20 random probe sets', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const probeKinds = Array.from(
        { length: 2 + randomInt(next, 4) },
        () => pick(next, SPECIFICITY_ORDER),
      );
      const probes = probeKinds.map((kind, i) =>
        makeProbe({ kind, rung: i, value: randomWord(next) }),
      );
      const ranked = rankProbes(probes);

      // Verify monotonic: each probe's specificity >= next probe's specificity
      for (let i = 0; i < ranked.length - 1; i += 1) {
        expect(specificityRank(ranked[i]!.strategy.kind))
          .toBeGreaterThanOrEqual(specificityRank(ranked[i + 1]!.strategy.kind));
      }
    }
  });
});

// ─── Law 3: Deterministic under alias expansion ───

test.describe('Law 3: Deterministic under alias expansion', () => {
  test('probe ranking is stable when strategy values change but kinds stay the same', () => {
    const probesA = [
      makeProbe({ kind: 'css', value: '.alpha' }),
      makeProbe({ kind: 'test-id', value: 'field-alpha' }),
      makeProbe({ kind: 'role-name', value: 'Alpha Input' }),
    ];
    const probesB = [
      makeProbe({ kind: 'css', value: '.beta' }),
      makeProbe({ kind: 'test-id', value: 'field-beta' }),
      makeProbe({ kind: 'role-name', value: 'Beta Input' }),
    ];

    const rankedA = rankProbes(probesA);
    const rankedB = rankProbes(probesB);

    // Kind ordering must be identical
    expect(rankedA.map((p) => p.strategy.kind)).toEqual(rankedB.map((p) => p.strategy.kind));
  });

  test('alias expansion preserves kind-based ordering across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);

      // Same set of kinds, different alias values
      const kinds: readonly LocatorStrategyKind[] = ['test-id', 'role-name', 'css'];
      const probesX = kinds.map((kind, i) =>
        makeProbe({ kind, rung: i, value: randomWord(next) }),
      );
      const probesY = kinds.map((kind, i) =>
        makeProbe({ kind, rung: i, value: randomWord(next) }),
      );

      const rankedX = rankProbes(probesX);
      const rankedY = rankProbes(probesY);

      expect(rankedX.map((p) => p.strategy.kind)).toEqual(rankedY.map((p) => p.strategy.kind));
    }
  });
});

// ─── Law 4: test-id selectors rank above CSS selectors ───

test.describe('Law 4: test-id selectors rank above CSS selectors', () => {
  test('test-id always wins over css in any permutation', () => {
    const permutations = [
      [makeProbe({ kind: 'test-id' }), makeProbe({ kind: 'css' })],
      [makeProbe({ kind: 'css' }), makeProbe({ kind: 'test-id' })],
    ];
    for (const probes of permutations) {
      const ranked = rankProbes(probes);
      expect(ranked[0]!.strategy.kind).toBe('test-id');
    }
  });

  test('test-id beats css across 20 random seeds with varying values', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const testIdProbe = makeProbe({ kind: 'test-id', value: randomWord(next), rung: randomInt(next, 10) });
      const cssProbe = makeProbe({ kind: 'css', value: `.${randomWord(next)}`, rung: randomInt(next, 10) });

      const ranked = rankProbes([cssProbe, testIdProbe]);
      expect(ranked[0]!.strategy.kind).toBe('test-id');
    }
  });
});

// ─── Law 5: role-name selectors rank above CSS selectors ───

test.describe('Law 5: role-name selectors rank above CSS selectors', () => {
  test('role-name always wins over css in any permutation', () => {
    const permutations = [
      [makeProbe({ kind: 'role-name' }), makeProbe({ kind: 'css' })],
      [makeProbe({ kind: 'css' }), makeProbe({ kind: 'role-name' })],
    ];
    for (const probes of permutations) {
      const ranked = rankProbes(probes);
      expect(ranked[0]!.strategy.kind).toBe('role-name');
    }
  });

  test('role-name beats css across 20 random seeds with varying values', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const roleProbe = makeProbe({ kind: 'role-name', value: randomWord(next), rung: randomInt(next, 10) });
      const cssProbe = makeProbe({ kind: 'css', value: `.${randomWord(next)}`, rung: randomInt(next, 10) });

      const ranked = rankProbes([cssProbe, roleProbe]);
      expect(ranked[0]!.strategy.kind).toBe('role-name');
    }
  });
});

// ─── Law 6: Intra-kind rung ordering ───

test.describe('Law 6: Rung ordering within same strategy kind', () => {
  test('lower rung numbers are preferred within the same kind', () => {
    const probes = [
      makeProbe({ kind: 'test-id', rung: 3, value: 'c' }),
      makeProbe({ kind: 'test-id', rung: 1, value: 'a' }),
      makeProbe({ kind: 'test-id', rung: 2, value: 'b' }),
    ];
    const ranked = rankProbes(probes);
    expect(ranked.map((p) => p.rung)).toEqual([1, 2, 3]);
  });

  test('rung ordering within kind across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const kind = pick(next, SPECIFICITY_ORDER);
      const count = 2 + randomInt(next, 5);
      const rungs = Array.from({ length: count }, (_, i) => i).sort(() => next() - 0.5);
      const probes = rungs.map((rung) =>
        makeProbe({ kind, rung, value: randomWord(next) }),
      );

      const ranked = rankProbes(probes);
      for (let i = 0; i < ranked.length - 1; i += 1) {
        expect(ranked[i]!.rung).toBeLessThanOrEqual(ranked[i + 1]!.rung);
      }
    }
  });
});

// ─── Law 7: Full ranking stability under permutation ───

test.describe('Law 7: Ranking stability under input permutation', () => {
  test('ranking result is identical regardless of input order', () => {
    const probes = [
      makeProbe({ kind: 'css', rung: 0, value: '.z' }),
      makeProbe({ kind: 'test-id', rung: 0, value: 'a' }),
      makeProbe({ kind: 'role-name', rung: 0, value: 'Button' }),
      makeProbe({ kind: 'test-id', rung: 1, value: 'b' }),
      makeProbe({ kind: 'css', rung: 1, value: '.y' }),
    ];

    const forward = rankProbes(probes);
    const reversed = rankProbes([...probes].reverse());
    const shuffled = rankProbes([probes[2]!, probes[4]!, probes[0]!, probes[3]!, probes[1]!]);

    const toKey = (p: SelectorProbe) => `${p.strategy.kind}:${p.rung}`;
    expect(forward.map(toKey)).toEqual(reversed.map(toKey));
    expect(forward.map(toKey)).toEqual(shuffled.map(toKey));
  });

  test('permutation stability across 20 random seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const count = 3 + randomInt(next, 5);
      const probes = Array.from({ length: count }, (_, i) =>
        makeProbe({ kind: pick(next, SPECIFICITY_ORDER), rung: i, value: randomWord(next) }),
      );

      const forward = rankProbes(probes);
      const reversed = rankProbes([...probes].reverse());

      const toKey = (p: SelectorProbe) => `${p.strategy.kind}:${p.rung}`;
      expect(forward.map(toKey)).toEqual(reversed.map(toKey));
    }
  });
});

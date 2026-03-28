/**
 * Free Monoid Lineage — Algebraic Law Tests (W5.4)
 *
 * Verifies that WorkflowEnvelopeLineage forms a monoid under mergeLineage:
 *   - Left identity:  mergeLineage(emptyLineage, a) ≡ a
 *   - Right identity: mergeLineage(a, emptyLineage) ≡ a
 *   - Associativity:  mergeLineage(a, mergeLineage(b, c)) ≡ mergeLineage(mergeLineage(a, b), c)
 *   - Length homomorphism: |merge(a, b).field| = |a.field| + |b.field|
 *   - Concatenation order: merge(a, b).sources = [...a.sources, ...b.sources]
 *
 * The monoid is a product of free monoids (array concatenation with identity []).
 */

import { expect, test } from '@playwright/test';
import { lineageMonoid, mergeLineage, emptyLineage } from '../lib/domain/algebra/lineage';
import type { WorkflowEnvelopeLineage, WorkflowStage } from '../lib/domain/types/workflow';
import { mulberry32, pick, randomWord } from './support/random';

// ─── Helpers ───

const ALL_STAGES: readonly WorkflowStage[] = [
  'preparation', 'resolution', 'execution', 'evidence', 'proposal', 'projection',
];

function randomLineage(next: () => number): WorkflowEnvelopeLineage {
  const sourceCount = Math.floor(next() * 4);
  const parentCount = Math.floor(next() * 3);
  const handshakeCount = Math.floor(next() * 3);
  const hasExperiments = next() > 0.5;
  const experimentCount = hasExperiments ? Math.floor(next() * 3) + 1 : 0;

  return {
    sources: Array.from({ length: sourceCount }, () => randomWord(next)),
    parents: Array.from({ length: parentCount }, () => randomWord(next)),
    handshakes: Array.from({ length: handshakeCount }, () => pick(next, ALL_STAGES)),
    experimentIds: experimentCount > 0
      ? Array.from({ length: experimentCount }, () => randomWord(next))
      : undefined,
  };
}

/** Normalize experimentIds for deep comparison (treat undefined as empty). */
function normalizeLineage(l: WorkflowEnvelopeLineage): WorkflowEnvelopeLineage {
  return {
    sources: l.sources,
    parents: l.parents,
    handshakes: l.handshakes,
    experimentIds: l.experimentIds && l.experimentIds.length > 0 ? l.experimentIds : undefined,
  };
}

// ─── Law 1: Left Identity ───

test.describe('Law 1: Left identity — mergeLineage(empty, a) ≡ a', () => {
  test('holds across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const result = mergeLineage(emptyLineage, a);
      expect(normalizeLineage(result)).toEqual(normalizeLineage(a));
    }
  });

  test('holds for empty lineage', () => {
    expect(normalizeLineage(mergeLineage(emptyLineage, emptyLineage))).toEqual(normalizeLineage(emptyLineage));
  });
});

// ─── Law 2: Right Identity ───

test.describe('Law 2: Right identity — mergeLineage(a, empty) ≡ a', () => {
  test('holds across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const result = mergeLineage(a, emptyLineage);
      expect(normalizeLineage(result)).toEqual(normalizeLineage(a));
    }
  });
});

// ─── Law 3: Associativity ───

test.describe('Law 3: Associativity — merge(a, merge(b, c)) ≡ merge(merge(a, b), c)', () => {
  test('holds across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const c = randomLineage(next);
      const leftAssoc = mergeLineage(mergeLineage(a, b), c);
      const rightAssoc = mergeLineage(a, mergeLineage(b, c));
      expect(normalizeLineage(leftAssoc)).toEqual(normalizeLineage(rightAssoc));
    }
  });
});

// ─── Law 4: Length Homomorphism ───

test.describe('Law 4: Length homomorphism — |merge(a,b).field| = |a.field| + |b.field|', () => {
  test('holds for sources across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.sources.length).toBe(a.sources.length + b.sources.length);
    }
  });

  test('holds for parents across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.parents.length).toBe(a.parents.length + b.parents.length);
    }
  });

  test('holds for handshakes across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.handshakes.length).toBe(a.handshakes.length + b.handshakes.length);
    }
  });

  test('holds for experimentIds across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      const expectedLen = (a.experimentIds?.length ?? 0) + (b.experimentIds?.length ?? 0);
      const actualLen = merged.experimentIds?.length ?? 0;
      expect(actualLen).toBe(expectedLen);
    }
  });
});

// ─── Law 5: Concatenation Order ───

test.describe('Law 5: Concatenation order — merge(a,b).field = [...a.field, ...b.field]', () => {
  test('sources preserve order across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.sources).toEqual([...a.sources, ...b.sources]);
    }
  });

  test('parents preserve order across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.parents).toEqual([...a.parents, ...b.parents]);
    }
  });

  test('handshakes preserve order across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      expect(merged.handshakes).toEqual([...a.handshakes, ...b.handshakes]);
    }
  });

  test('experimentIds preserve order across 150 seeds', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const a = randomLineage(next);
      const b = randomLineage(next);
      const merged = mergeLineage(a, b);
      const expected = [...(a.experimentIds ?? []), ...(b.experimentIds ?? [])];
      const actual = merged.experimentIds ?? [];
      expect([...actual]).toEqual(expected);
    }
  });
});

// ─── Law 6: concatAll via monoid ───

test.describe('Law 6: concatAll via lineageMonoid', () => {
  test('folding an array of lineages via reduce equals pairwise merge', () => {
    for (let seed = 1; seed <= 150; seed += 1) {
      const next = mulberry32(seed);
      const count = 2 + Math.floor(next() * 4);
      const lineages = Array.from({ length: count }, () => randomLineage(next));
      const viaReduce = lineages.reduce(lineageMonoid.combine, lineageMonoid.empty);
      const viaPairwise = lineages.reduce(mergeLineage, emptyLineage);
      expect(normalizeLineage(viaReduce)).toEqual(normalizeLineage(viaPairwise));
    }
  });
});

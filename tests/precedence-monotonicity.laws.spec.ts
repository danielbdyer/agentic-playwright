/**
 * Precedence Monotonicity — Law Tests
 *
 * Algebraic invariants for the precedence system:
 *   - Total order: lower index => higher weight
 *   - Strict monotonicity: no duplicate weights
 *   - Non-negative: all valid weights > 0
 *   - Zero for unknown: unrecognized rungs get weight 0
 *   - Early-exit correctness: chooseByPrecedence picks highest rung
 *   - Deterministic under permutation: shuffle-invariant
 *
 * Tested functions:
 *   - precedenceWeight (precedence.ts)
 *   - chooseByPrecedence (precedence.ts)
 */

import { expect, test } from '@playwright/test';
import { mulberry32 } from './support/random';
import {
  resolutionPrecedenceLaw,
  dataResolutionPrecedenceLaw,
  runSelectionPrecedenceLaw,
  precedenceWeight,
  chooseByPrecedence,
} from '../lib/domain/precedence';

// ─── Helpers ───

type AnyLaw = readonly string[];

const ALL_LAWS: readonly { readonly name: string; readonly law: AnyLaw }[] = [
  { name: 'resolution', law: resolutionPrecedenceLaw },
  { name: 'dataResolution', law: dataResolutionPrecedenceLaw },
  { name: 'runSelection', law: runSelectionPrecedenceLaw },
];

function weights(law: AnyLaw): readonly number[] {
  return law.map((rung) => precedenceWeight(law as ReadonlyArray<string>, rung as string));
}

/** Fisher-Yates shuffle using a seeded PRNG. */
function shuffle<T>(arr: readonly T[], next: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

// ─── Law 1: Total order ───

test.describe('Law 1: Total order — lower index => higher weight', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: rung(a) < rung(b) => weight(a) > weight(b)`, () => {
      const ws = weights(law);
      for (let a = 0; a < law.length; a++) {
        for (let b = a + 1; b < law.length; b++) {
          expect(ws[a]).toBeGreaterThan(ws[b]!);
        }
      }
    });
  }
});

// ─── Law 2: Strict monotonicity ───

test.describe('Law 2: Strict monotonicity — no duplicate weights', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: all weights are unique`, () => {
      const ws = weights(law);
      const unique = new Set(ws);
      expect(unique.size).toBe(ws.length);
    });
  }
});

// ─── Law 3: Non-negative ───

test.describe('Law 3: Non-negative — all valid weights > 0', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: every rung has weight > 0`, () => {
      const ws = weights(law);
      for (const w of ws) {
        expect(w).toBeGreaterThan(0);
      }
    });
  }
});

// ─── Law 4: Zero for unknown ───

test.describe('Law 4: Zero for unknown rungs', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: unknown rung returns 0`, () => {
      const w = precedenceWeight(law as ReadonlyArray<string>, 'totally-unknown-rung');
      expect(w).toBe(0);
    });
  }
});

// ─── Law 5: Early-exit correctness ───

test.describe('Law 5: chooseByPrecedence picks highest-precedence candidate', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: higher-precedence rung always wins`, () => {
      for (let a = 0; a < law.length; a++) {
        for (let b = a + 1; b < law.length; b++) {
          const candidates = [
            { rung: law[b]!, value: `value-${law[b]}` },
            { rung: law[a]!, value: `value-${law[a]}` },
          ];
          const result = chooseByPrecedence(candidates, law as ReadonlyArray<string>);
          expect(result).toBe(`value-${law[a]}`);
        }
      }
    });
  }

  test('null/undefined values are skipped', () => {
    const candidates = [
      { rung: 'explicit' as const, value: null },
      { rung: 'control' as const, value: undefined },
      { rung: 'approved-screen-knowledge' as const, value: 'fallback' },
    ];
    const result = chooseByPrecedence(candidates, resolutionPrecedenceLaw);
    expect(result).toBe('fallback');
  });

  test('empty candidates returns null', () => {
    const result = chooseByPrecedence([], resolutionPrecedenceLaw);
    expect(result).toBeNull();
  });
});

// ─── Law 6: Deterministic under permutation (150 seeds) ───

test.describe('Law 6: Deterministic under permutation', () => {
  for (const { name, law } of ALL_LAWS) {
    test(`${name}: shuffling candidates does not change result (150 seeds)`, () => {
      for (let seed = 1; seed <= 150; seed++) {
        const next = mulberry32(seed);

        // Build candidates for every rung with a deterministic value
        const candidates = law.map((rung) => ({
          rung: rung as string,
          value: `val-${rung}`,
        }));

        const canonical = chooseByPrecedence(candidates, law as ReadonlyArray<string>);
        const shuffled = shuffle(candidates, next);
        const permuted = chooseByPrecedence(shuffled, law as ReadonlyArray<string>);

        expect(permuted).toBe(canonical);
      }
    });
  }

  test('resolution: random subsets are permutation-invariant (150 seeds)', () => {
    const law = resolutionPrecedenceLaw;
    for (let seed = 1; seed <= 150; seed++) {
      const next = mulberry32(seed);

      // Pick a random subset of rungs
      const subset = law.filter(() => next() > 0.4);
      if (subset.length === 0) continue;

      const candidates = subset.map((rung) => ({
        rung: rung as string,
        value: `v-${rung}`,
      }));

      const canonical = chooseByPrecedence(candidates, law as ReadonlyArray<string>);
      const shuffled = shuffle(candidates, next);
      const permuted = chooseByPrecedence(shuffled, law as ReadonlyArray<string>);

      expect(permuted).toBe(canonical);
    }
  });
});

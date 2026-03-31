/**
 * Scoring Rule Algebra — Law Tests (W5.11 + W5.25)
 *
 * Verifies the monoid, semigroup, and derived algebraic laws for the
 * composable scoring rule system:
 *
 *   1. Monoid identity (identity rule is neutral under combination)
 *   2. Semigroup associativity (combination is associative)
 *   3. Annihilator absorption (-Infinity absorbs under addition)
 *   4. Bounded clamping (output is always within [min, max])
 *   5. Weight linearity (weighted rule scales linearly)
 *   6. Contramap composition (contramapScoringRule obeys functor law)
 *   7. Complexity bounds (k rules over n items is Theta(k*n))
 *
 * Tested structures:
 *   - ScoringRule<T>, combineScoringRules, weightedScoringRule, contramapScoringRule
 *   - identityScoringRule, annihilatorScoringRule, boundedScoringRule
 *   - scoringRuleSemigroup, scoringRuleMonoid
 */

import { expect, test } from '@playwright/test';
import {
  combineScoringRules,
  weightedScoringRule,
  contramapScoringRule,
} from '../lib/application/learning-shared';
import type { ScoringRule } from '../lib/application/learning-shared';
import {
  identityScoringRule,
  annihilatorScoringRule,
  boundedScoringRule,
  scoringRuleSemigroup,
  scoringRuleMonoid,
} from '../lib/domain/algebra/scoring';
import { concatAll, foldMap } from '../lib/domain/algebra/monoid';
import { mulberry32, pick , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


interface TestInput {
  readonly x: number;
  readonly y: number;
  readonly label: string;
}

function randomInput(next: () => number): TestInput {
  return {
    x: next() * 200 - 100,
    y: next() * 200 - 100,
    label: pick(next, ['alpha', 'beta', 'gamma', 'delta']),
  };
}

function randomRule(next: () => number): ScoringRule<TestInput> {
  const kind = Math.floor(next() * 5);
  switch (kind) {
    case 0: return { score: (i) => i.x };
    case 1: return { score: (i) => i.y };
    case 2: return { score: (i) => i.x + i.y };
    case 3: return { score: (i) => i.label.length };
    default: return { score: (i) => Math.abs(i.x - i.y) };
  }
}

// ─── Law 1: Monoid identity ───

test.describe('Law 1: Monoid identity — identity rule is neutral', () => {
  test('combine(identity, r).score(x) === r.score(x) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const identity = identityScoringRule<TestInput>();
      const combined = combineScoringRules(identity, r);
      expect(combined.score(input)).toBeCloseTo(r.score(input), 10);
    }
  });

  test('combine(r, identity).score(x) === r.score(x) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const identity = identityScoringRule<TestInput>();
      const combined = combineScoringRules(r, identity);
      expect(combined.score(input)).toBeCloseTo(r.score(input), 10);
    }
  });

  test('scoringRuleMonoid.empty is identity across 20 seeds', () => {
    const monoid = scoringRuleMonoid<TestInput>();
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const left = monoid.combine(monoid.empty, r);
      const right = monoid.combine(r, monoid.empty);
      expect(left.score(input)).toBeCloseTo(r.score(input), 10);
      expect(right.score(input)).toBeCloseTo(r.score(input), 10);
    }
  });
});

// ─── Law 2: Semigroup associativity ───

test.describe('Law 2: Semigroup associativity', () => {
  test('combine(combine(a, b), c).score(x) === combine(a, combine(b, c)).score(x) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = randomRule(next);
      const b = randomRule(next);
      const c = randomRule(next);
      const input = randomInput(next);

      const leftAssoc = combineScoringRules(combineScoringRules(a, b), c);
      const rightAssoc = combineScoringRules(a, combineScoringRules(b, c));
      expect(leftAssoc.score(input)).toBeCloseTo(rightAssoc.score(input), 10);
    }
  });

  test('scoringRuleSemigroup.combine is associative across 20 seeds', () => {
    const sg = scoringRuleSemigroup<TestInput>();
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = randomRule(next);
      const b = randomRule(next);
      const c = randomRule(next);
      const input = randomInput(next);

      const leftAssoc = sg.combine(sg.combine(a, b), c);
      const rightAssoc = sg.combine(a, sg.combine(b, c));
      expect(leftAssoc.score(input)).toBeCloseTo(rightAssoc.score(input), 10);
    }
  });
});

// ─── Law 3: Annihilator absorption ───

test.describe('Law 3: Annihilator absorption', () => {
  test('combine(annihilator, r).score(x) === -Infinity across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const ann = annihilatorScoringRule<TestInput>();
      const combined = combineScoringRules(ann, r);
      expect(combined.score(input)).toBe(-Infinity);
    }
  });

  test('combine(r, annihilator).score(x) === -Infinity across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const ann = annihilatorScoringRule<TestInput>();
      const combined = combineScoringRules(r, ann);
      expect(combined.score(input)).toBe(-Infinity);
    }
  });
});

// ─── Law 4: Bounded clamping ───

test.describe('Law 4: Bounded clamping — output in [min, max]', () => {
  test('boundedScoringRule(0, 1, rule).score(x) in [0, 1] across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const bounded = boundedScoringRule(0, 1, r);
      const result = bounded.score(input);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(1);
    }
  });

  test('boundedScoringRule(-10, 10, rule).score(x) in [-10, 10] across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const bounded = boundedScoringRule(-10, 10, r);
      const result = bounded.score(input);
      expect(result).toBeGreaterThanOrEqual(-10);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  test('boundedScoringRule is idempotent: bounding twice equals bounding once', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const once = boundedScoringRule(0, 1, r);
      const twice = boundedScoringRule(0, 1, once);
      expect(twice.score(input)).toBeCloseTo(once.score(input), 10);
    }
  });
});

// ─── Law 5: Weight linearity ───

test.describe('Law 5: Weight linearity', () => {
  test('weightedScoringRule(w, r).score(x) === w * r.score(x) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const w = next() * 10;
      const weighted = weightedScoringRule(w, r);
      expect(weighted.score(input)).toBeCloseTo(w * r.score(input), 10);
    }
  });

  test('weightedScoringRule(1, r).score(x) === r.score(x) — weight 1 is identity across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const weighted = weightedScoringRule(1, r);
      expect(weighted.score(input)).toBeCloseTo(r.score(input), 10);
    }
  });

  test('weightedScoringRule(0, r).score(x) === 0 — weight 0 annihilates across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const weighted = weightedScoringRule(0, r);
      expect(weighted.score(input)).toBeCloseTo(0, 10);
    }
  });

  test('weight distributes over combination: w*(a+b) === w*a + w*b across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const a = randomRule(next);
      const b = randomRule(next);
      const input = randomInput(next);
      const w = next() * 10;

      const leftSide = weightedScoringRule(w, combineScoringRules(a, b));
      const rightSide = combineScoringRules(
        weightedScoringRule(w, a),
        weightedScoringRule(w, b),
      );
      expect(leftSide.score(input)).toBeCloseTo(rightSide.score(input), 8);
    }
  });
});

// ─── Law 6: Contramap composition (functor law) ───

test.describe('Law 6: Contramap composition', () => {
  test('contramap(contramap(r, g), f).score(x) === contramap(r, g . f).score(x) across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);

      const baseRule: ScoringRule<number> = { score: (n) => n * 2 + 1 };

      // f: string -> TestInput
      const labelChoices = ['alpha', 'beta', 'gamma', 'delta'] as const;
      const f = (s: string): TestInput => ({
        x: s.length,
        y: s.charCodeAt(0) || 0,
        label: labelChoices[s.length % labelChoices.length] ?? 'alpha',
      });

      // g: TestInput -> number
      const gIndex = Math.floor(next() * 3);
      const g = gIndex === 0
        ? (i: TestInput) => i.x
        : gIndex === 1
          ? (i: TestInput) => i.y
          : (i: TestInput) => i.x + i.y;

      const testString = pick(next, ['hello', 'world', 'foo', 'bar', 'baz', 'test']);

      // Two-step contramap
      const inner = contramapScoringRule(baseRule, g);
      const twoStep = contramapScoringRule(inner, f);

      // Fused contramap
      const fused = contramapScoringRule(baseRule, (s: string) => g(f(s)));

      expect(twoStep.score(testString)).toBeCloseTo(fused.score(testString), 10);
    }
  });

  test('contramap with identity function is a no-op across 20 seeds', () => {
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const r = randomRule(next);
      const input = randomInput(next);
      const mapped = contramapScoringRule(r, (i: TestInput) => i);
      expect(mapped.score(input)).toBeCloseTo(r.score(input), 10);
    }
  });
});

// ─── Law 7: Complexity bounds ───

test.describe('Law 7: Complexity bounds — k rules over n items is Theta(k*n)', () => {
  test('scoring n items with k=4 rules grows linearly in n', () => {
    const rules: readonly ScoringRule<TestInput>[] = [
      { score: (i) => i.x },
      { score: (i) => i.y },
      { score: (i) => i.x + i.y },
      { score: (i) => i.label.length },
    ];
    const combined = combineScoringRules(...rules);

    const next = mulberry32(42);
    const items = Array.from({ length: 10000 }, () => randomInput(next));

    // Measure time for n=1000 vs n=10000
    const smallSlice = items.slice(0, 1000);

    const t0 = performance.now();
    smallSlice.forEach((item) => combined.score(item));
    const t1 = performance.now();
    items.forEach((item) => combined.score(item));
    const t2 = performance.now();

    const smallTime = t1 - t0;
    const fullTime = t2 - t1;

    // If linear, fullTime / smallTime should be close to 10.
    // Allow generous bounds (3x-30x) to avoid flaky tests.
    const ratio = smallTime > 0 ? fullTime / smallTime : 10;
    expect(ratio).toBeGreaterThan(3);
    expect(ratio).toBeLessThan(30);
  });
});

// ─── concatAll and foldMap integration ───

test.describe('concatAll and foldMap integration', () => {
  test('concatAll via monoid agrees with combineScoringRules across 20 seeds', () => {
    const monoid = scoringRuleMonoid<TestInput>();
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const rules = Array.from({ length: 2 + Math.floor(next() * 4) }, () => randomRule(next));
      const input = randomInput(next);

      const viaConcat = concatAll(monoid, rules);
      const viaCombine = combineScoringRules(...rules);
      expect(viaConcat.score(input)).toBeCloseTo(viaCombine.score(input), 10);
    }
  });

  test('foldMap lifts values into scoring rules and combines across 20 seeds', () => {
    const monoid = scoringRuleMonoid<TestInput>();
    for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
      const next = mulberry32(seed);
      const weights = Array.from({ length: 3 }, () => next() * 5);
      const input = randomInput(next);

      const baseRule = randomRule(next);
      const viaFoldMap = foldMap(monoid, weights, (w) => weightedScoringRule(w, baseRule));
      const viaCombine = combineScoringRules(
        ...weights.map((w) => weightedScoringRule(w, baseRule)),
      );
      expect(viaFoldMap.score(input)).toBeCloseTo(viaCombine.score(input), 10);
    }
  });
});

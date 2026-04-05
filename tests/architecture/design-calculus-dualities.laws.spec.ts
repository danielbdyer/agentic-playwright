/**
 * Law-style tests for the design calculus dualities and free theorems.
 *
 * Tests:
 *   - Product fold fusion law (Collapse 4)
 *   - Hylomorphism deforestation (Duality 1)
 *   - Free/forgetful adjunction (Duality 2)
 *   - Slice/projection naturality (Duality 3)
 *   - Governance lattice Heyting property (Free Theorem 1)
 *   - Tropical semiring associativity (Free Theorem 2)
 *   - Bekic decomposition (Free Theorem 4)
 *
 * @see docs/design-calculus.md
 */

import { expect, test } from '@playwright/test';
import { runFold, productFold, productFold3, contramapFold, filterFold } from '../../lib/domain/algebra/product-fold';
import type { Fold } from '../../lib/domain/algebra/product-fold';
import { runHylo, traceHylo } from '../../lib/domain/algebra/hylomorphism';
import type { Hylomorphism } from '../../lib/domain/algebra/hylomorphism';
import { freeSearch, forget, trailCoverage } from '../../lib/domain/algebra/free-forgetful';
import { verifyNaturality, findNaturalityViolations } from '../../lib/domain/algebra/slice-projection';
import { GovernanceLattice, meetAll, joinAll } from '../../lib/domain/algebra/lattice';
import type { Governance } from '../../lib/domain/governance/workflow-types';

// ═══════════════════════════════════════════════════════════
// Collapse 4: Product Fold Fusion Law
// ═══════════════════════════════════════════════════════════

const sumFold: Fold<number, number> = { initial: 0, step: (acc, n) => acc + n };
const countFold: Fold<number, number> = { initial: 0, step: (acc) => acc + 1 };
const maxFold: Fold<number, number> = { initial: -Infinity, step: (acc, n) => Math.max(acc, n) };

test('product fold fusion: product of two folds equals running separately', () => {
  const items = [3, 1, 4, 1, 5, 9, 2, 6];

  // Run separately
  const sum = runFold(sumFold, items);
  const count = runFold(countFold, items);

  // Run fused
  const [fusedSum, fusedCount] = runFold(productFold(sumFold, countFold), items);

  expect(fusedSum).toBe(sum);
  expect(fusedCount).toBe(count);
});

test('product fold3 fusion: three folds in one pass', () => {
  const items = [3, 1, 4, 1, 5, 9, 2, 6];

  const sum = runFold(sumFold, items);
  const count = runFold(countFold, items);
  const max = runFold(maxFold, items);

  const [fs, fc, fm] = runFold(productFold3(sumFold, countFold, maxFold), items);

  expect(fs).toBe(sum);
  expect(fc).toBe(count);
  expect(fm).toBe(max);
});

test('contramapFold: pre-composition preserves fold semantics', () => {
  const items = [{ value: 3 }, { value: 7 }, { value: 1 }];
  const mapped = contramapFold(sumFold, (item: { value: number }) => item.value);
  expect(runFold(mapped, items)).toBe(11);
});

test('filterFold: conditional fold skips non-matching items', () => {
  const items = [1, 2, 3, 4, 5, 6];
  const evenSum = filterFold(sumFold, (n: number) => n % 2 === 0);
  expect(runFold(evenSum, items)).toBe(12); // 2+4+6
});

// ═══════════════════════════════════════════════════════════
// Duality 1: Hylomorphism (deforestation law)
// ═══════════════════════════════════════════════════════════

test('hylomorphism: unfold then fold without intermediate list', () => {
  // Unfold: count down from 5 to 1, producing each number
  // Fold: sum all numbers
  const hylo: Hylomorphism<number, number, number> = {
    seed: 5,
    unfold: (n) => n <= 0 ? { done: true } : { done: false, value: n, next: n - 1 },
    initial: 0,
    step: (acc, item) => acc + item,
  };

  expect(runHylo(hylo)).toBe(15); // 5+4+3+2+1
});

test('hylomorphism equals unfold-then-fold (deforestation correctness)', () => {
  // Prove: hylo(φ, ψ) = fold(φ) ∘ unfold(ψ)
  const hylo: Hylomorphism<number, number, number> = {
    seed: 4,
    unfold: (n) => n <= 0 ? { done: true } : { done: false, value: n * n, next: n - 1 },
    initial: 0,
    step: (acc, item) => acc + item,
  };

  // Materialize the intermediate list (what the unfold produces)
  const intermediateList: number[] = [];
  let state = hylo.seed;
  for (;;) {
    const result = hylo.unfold(state);
    if (result.done) break;
    intermediateList.push(result.value);
    state = result.next;
  }

  // Fold the materialized list
  const foldResult = intermediateList.reduce(hylo.step, hylo.initial);

  // The hylomorphism should produce the same result without the list
  expect(runHylo(hylo)).toBe(foldResult);
});

test('traceHylo: collects intermediate accumulator states', () => {
  const hylo: Hylomorphism<number, number, number> = {
    seed: 3,
    unfold: (n) => n <= 0 ? { done: true } : { done: false, value: n, next: n - 1 },
    initial: 0,
    step: (acc, item) => acc + item,
  };

  const trace = traceHylo(hylo);
  expect(trace).toEqual([0, 3, 5, 6]); // 0, 0+3, 3+2, 5+1
});

// ═══════════════════════════════════════════════════════════
// Duality 2: Free / Forgetful Adjunction
// ═══════════════════════════════════════════════════════════

test('free search: trail records all attempts, result is winner', () => {
  const candidates = ['a', 'b', 'c', 'd'];
  const trail = freeSearch(candidates, (c) => ({
    outcome: `tried-${c}`,
    result: c === 'c' ? `winner-${c}` : null,
  }));

  expect(trail.steps.length).toBe(3); // a, b, c (stopped at c)
  expect(trail.result).toBe('winner-c');
});

test('forgetful functor: forget(trail) = result only', () => {
  const trail = freeSearch(['x', 'y'], (c) => ({
    outcome: 'tried',
    result: c === 'y' ? 'found' : null,
  }));

  expect(forget(trail)).toBe('found');
});

test('adjunction: resolve = forget ∘ freeResolve', () => {
  // Direct resolution (no trail)
  const candidates = [10, 20, 30];
  const directResult = candidates.find((c) => c > 15) ?? null;

  // Free resolution (with trail)
  const trail = freeSearch(candidates, (c) => ({
    outcome: c > 15 ? 'match' : 'no-match',
    result: c > 15 ? c : null,
  }));

  // forget ∘ freeResolve = resolve
  expect(forget(trail)).toBe(directResult);
});

test('trail is lossless: all attempts recorded even on success', () => {
  const trail = freeSearch([1, 2, 3], (c) => ({
    outcome: c % 2 === 0 ? 'even' : 'odd',
    result: c === 2 ? 'found' : null,
  }));

  expect(trail.steps).toEqual([
    { candidate: 1, outcome: 'odd' },
    { candidate: 2, outcome: 'even' },
  ]);
});

test('trail coverage: fraction of candidates examined', () => {
  const trail = freeSearch(['a', 'b', 'c', 'd', 'e'], (c) => ({
    outcome: 'tried',
    result: c === 'c' ? 'found' : null,
  }));

  expect(trailCoverage(trail, 5)).toBeCloseTo(0.6); // 3/5
});

// ═══════════════════════════════════════════════════════════
// Duality 3: Slice / Projection Naturality
// ═══════════════════════════════════════════════════════════

interface TestState {
  items: Record<string, { value: number; label: string }>;
}

interface TestView {
  labels: Record<string, string>;
}

test('slice-projection naturality: project(slice) = slice(project)', () => {
  const state: TestState = {
    items: {
      a: { value: 1, label: 'alpha' },
      b: { value: 2, label: 'beta' },
    },
  };

  const sliceState = (s: TestState, key: string) => s.items[key] ?? { value: 0, label: '' };
  const sliceView = (v: TestView, key: string) => v.labels[key] ?? '';
  const project = (s: TestState): TestView => ({
    labels: Object.fromEntries(Object.entries(s.items).map(([k, v]) => [k, v.label])),
  });
  const projectFiber = (fiber: { value: number; label: string }) => fiber.label;

  const result = verifyNaturality(
    sliceState, sliceView, project, projectFiber,
    state, 'a',
    (a, b) => a === b,
  );
  expect(result).toBe(true);
});

test('naturality violations: detects inconsistent projections', () => {
  const state: TestState = {
    items: {
      a: { value: 1, label: 'alpha' },
      b: { value: 2, label: 'beta' },
    },
  };

  // Deliberately broken projection that transforms 'b' differently
  const sliceState = (s: TestState, key: string) => s.items[key] ?? { value: 0, label: '' };
  const project = (s: TestState): TestView => ({
    labels: Object.fromEntries(
      Object.entries(s.items).map(([k, v]) => [k, k === 'b' ? 'WRONG' : v.label]),
    ),
  });
  const sliceView = (v: TestView, key: string) => v.labels[key] ?? '';
  const projectFiber = (fiber: { value: number; label: string }) => fiber.label;

  const violations = findNaturalityViolations(
    sliceState, sliceView, project, projectFiber,
    state, ['a', 'b'],
    (a, b) => a === b,
  );
  expect(violations).toEqual(['b']); // 'b' violates naturality
});

// ═══════════════════════════════════════════════════════════
// Free Theorem 1: Governance Lattice is a Bounded Distributive Lattice
// ═══════════════════════════════════════════════════════════

const allGov: Governance[] = ['blocked', 'review-required', 'approved'];

test('governance lattice: meet is idempotent', () => {
  for (const g of allGov) {
    expect(GovernanceLattice.meet(g, g)).toBe(g);
  }
});

test('governance lattice: join is idempotent', () => {
  for (const g of allGov) {
    expect(GovernanceLattice.join(g, g)).toBe(g);
  }
});

test('governance lattice: absorption law meet(a, join(a, b)) = a', () => {
  for (const a of allGov) {
    for (const b of allGov) {
      expect(GovernanceLattice.meet(a, GovernanceLattice.join(a, b))).toBe(a);
    }
  }
});

test('governance lattice: absorption law join(a, meet(a, b)) = a', () => {
  for (const a of allGov) {
    for (const b of allGov) {
      expect(GovernanceLattice.join(a, GovernanceLattice.meet(a, b))).toBe(a);
    }
  }
});

test('governance lattice: distributive law meet(a, join(b, c)) = join(meet(a,b), meet(a,c))', () => {
  for (const a of allGov) {
    for (const b of allGov) {
      for (const c of allGov) {
        const lhs = GovernanceLattice.meet(a, GovernanceLattice.join(b, c));
        const rhs = GovernanceLattice.join(GovernanceLattice.meet(a, b), GovernanceLattice.meet(a, c));
        expect(lhs).toBe(rhs);
      }
    }
  }
});

test('governance lattice: meetAll and joinAll agree with pairwise operations', () => {
  const values: Governance[] = ['approved', 'blocked', 'review-required', 'approved'];
  const meetResult = meetAll(GovernanceLattice, values);
  const joinResult = joinAll(GovernanceLattice, values);

  expect(meetResult).toBe('blocked'); // most restrictive
  expect(joinResult).toBe('approved'); // most permissive
});

// ═══════════════════════════════════════════════════════════
// Free Theorem 2: Tropical Semiring Associativity
// ═══════════════════════════════════════════════════════════

// The tropical semiring: (ℝ ∪ {∞}, min, +, ∞, 0)

const tropicalAdd = (a: number, b: number) => Math.min(a, b);
const tropicalMul = (a: number, b: number) => a + b;
const tropicalZero = Infinity;
const tropicalOne = 0;

test('tropical semiring: (min, +) is a semiring', () => {
  const values = [3, 1, 4, 1, 5];

  // Additive associativity: min(min(a,b),c) = min(a,min(b,c))
  expect(tropicalAdd(tropicalAdd(3, 1), 4)).toBe(tropicalAdd(3, tropicalAdd(1, 4)));

  // Multiplicative associativity: (a+b)+c = a+(b+c)
  expect(tropicalMul(tropicalMul(3, 1), 4)).toBe(tropicalMul(3, tropicalMul(1, 4)));

  // Additive identity: min(a, ∞) = a
  for (const v of values) {
    expect(tropicalAdd(v, tropicalZero)).toBe(v);
  }

  // Multiplicative identity: a + 0 = a
  for (const v of values) {
    expect(tropicalMul(v, tropicalOne)).toBe(v);
  }

  // Distributivity: (a+b) + c... wait, this is min(a,b)+c = min(a+c, b+c)
  // Left distributivity: a * (b ⊕ c) = (a*b) ⊕ (a*c) i.e. a + min(b,c) = min(a+b, a+c)
  for (const a of [1, 2, 3]) {
    for (const b of [4, 5]) {
      for (const c of [6, 7]) {
        const lhs = tropicalMul(a, tropicalAdd(b, c));
        const rhs = tropicalAdd(tropicalMul(a, b), tropicalMul(a, c));
        expect(lhs).toBe(rhs);
      }
    }
  }
});

test('tropical semiring: shortest path via matrix multiplication', () => {
  // 3-node graph: A→B cost 2, B→C cost 3, A→C cost 10
  // Tropical shortest path A→C should be min(10, 2+3) = 5
  const directCost = 10;
  const viaBCost = tropicalMul(2, 3); // 2+3 = 5
  const shortest = tropicalAdd(directCost, viaBCost); // min(10, 5) = 5
  expect(shortest).toBe(5);
});

// ═══════════════════════════════════════════════════════════
// Free Theorem 4: Bekic Decomposition
// ═══════════════════════════════════════════════════════════

test('bekic: nested fixed points equal simultaneous fixed point', () => {
  // Simulate: f(a,b) = (a+b)/2, g(a,b) = (a*b)/10
  // Simultaneous fixed point: iterate (a,b) → (f(a,b), g(a,b)) until stable
  // Sequential: fix a, then fix b given a, then fix a given b, iterate

  const f = (a: number, b: number) => (a + b) / 2;
  const g = (a: number, b: number) => (a * b) / 10;

  // Simultaneous iteration
  let sa = 5, sb = 5;
  for (let i = 0; i < 100; i++) {
    const na = f(sa, sb);
    const nb = g(sa, sb);
    sa = na;
    sb = nb;
  }

  // Sequential (Bekic): outer fixes a, inner fixes b
  let ba = 5;
  for (let i = 0; i < 100; i++) {
    // Inner: fix b given current a
    let bb = 5;
    for (let j = 0; j < 100; j++) {
      bb = g(ba, bb);
    }
    ba = f(ba, bb);
  }

  // Both should converge to the same fixed point
  expect(sa).toBeCloseTo(ba, 4);
});

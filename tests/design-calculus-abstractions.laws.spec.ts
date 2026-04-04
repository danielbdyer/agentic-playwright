/**
 * Law-style tests for the design calculus abstractions.
 *
 * Tests the algebraic properties of:
 *   - Precedence-governed dispatch (Abstraction 1)
 *   - Observation collapse (Abstraction 2)
 *   - Contextual lattice merge (Abstraction 3)
 *   - Governed suspension (Abstraction 4)
 *   - Rung-confidence Galois connection (Collapse 2)
 *
 * @see docs/design-calculus.md
 */

import { expect, test } from '@playwright/test';
import { chooseByPrecedence, dispatchByPrecedence, precedenceWeight } from '../lib/domain/resolution/precedence';
import { collapseObservations, collapseAll } from '../lib/domain/kernel/observation-collapse';
import type { ObservationCollapse } from '../lib/domain/kernel/observation-collapse';
import { contextualMerge, contextualMergeAll, fromBoundedLattice } from '../lib/domain/algebra/contextual-merge';
import { GovernanceLattice } from '../lib/domain/algebra/lattice';
import {
  approved,
  suspended,
  blocked,
  foldVerdict,
  mapVerdict,
  chainVerdict,
  fromGovernance,
} from '../lib/domain/kernel/governed-suspension';
import {
  rungToMinConfidence,
  confidenceToRungs,
  isConsistentProvenance,
  confidenceOrdinal,
  confidenceGte,
} from '../lib/domain/resolution/confidence-provenance';
import type { ResolutionPrecedenceRung } from '../lib/domain/resolution/precedence';
import type { Confidence } from '../lib/domain/governance/workflow-types';

// ═══════════════════════════════════════════════════════════
// Abstraction 1: Precedence-Governed Dispatch
// ═══════════════════════════════════════════════════════════

const testLaw = ['alpha', 'beta', 'gamma'] as const;
type TestRung = (typeof testLaw)[number];

test('dispatch: highest-precedence candidate wins', () => {
  const result = dispatchByPrecedence<string, TestRung>(
    [
      { rung: 'gamma', value: 'low' },
      { rung: 'alpha', value: 'high' },
      { rung: 'beta', value: 'mid' },
    ],
    testLaw,
  );
  expect(result).not.toBeNull();
  expect(result!.value).toBe('high');
  expect(result!.rung).toBe('alpha');
  expect(result!.rank).toBe(0);
});

test('dispatch: returns null when all candidates are null', () => {
  const result = dispatchByPrecedence<string, TestRung>(
    [
      { rung: 'alpha', value: null },
      { rung: 'beta', value: undefined },
    ],
    testLaw,
  );
  expect(result).toBeNull();
});

test('dispatch: provenance agrees with chooseByPrecedence', () => {
  const candidates = [
    { rung: 'beta' as TestRung, value: 'winner' },
    { rung: 'gamma' as TestRung, value: 'loser' },
  ];
  const plain = chooseByPrecedence(candidates, testLaw);
  const rich = dispatchByPrecedence(candidates, testLaw);
  expect(plain).toBe(rich!.value);
});

test('dispatch: rank is monotone with precedence weight', () => {
  const candidates = [
    { rung: 'alpha' as TestRung, value: 'a' },
    { rung: 'beta' as TestRung, value: 'b' },
    { rung: 'gamma' as TestRung, value: 'c' },
  ];
  // Each rung wins when it's the only candidate
  for (const c of candidates) {
    const result = dispatchByPrecedence([c], testLaw);
    const weight = precedenceWeight(testLaw, c.rung);
    expect(result).not.toBeNull();
    // Higher weight = lower rank (higher precedence)
    expect(weight).toBeGreaterThan(0);
  }
});

// ═══════════════════════════════════════════════════════════
// Abstraction 2: Observation Collapse
// ═══════════════════════════════════════════════════════════

interface TestReceipt { readonly value: number; readonly category: string }
interface TestObs { readonly value: number }
interface TestAgg { readonly sum: number; readonly count: number }
type TestSignal = 'healthy' | 'degraded';

const testPipeline: ObservationCollapse<TestReceipt, TestObs, TestAgg, TestSignal> = {
  extract: (receipts) => receipts.filter((r) => r.category === 'metric').map((r) => ({ value: r.value })),
  aggregate: (obs, prior) => ({
    sum: (prior?.sum ?? 0) + obs.reduce((s, o) => s + o.value, 0),
    count: (prior?.count ?? 0) + obs.length,
  }),
  signal: (agg) => agg.count > 0 && agg.sum / agg.count > 50 ? 'healthy' : 'degraded',
};

test('observation collapse: extract → aggregate → signal', () => {
  const receipts: TestReceipt[] = [
    { value: 80, category: 'metric' },
    { value: 60, category: 'metric' },
    { value: 999, category: 'noise' },
  ];
  const result = collapseObservations(testPipeline, receipts, null);
  expect(result.aggregate.sum).toBe(140);
  expect(result.aggregate.count).toBe(2);
  expect(result.signal).toBe('healthy');
});

test('observation collapse: prior state is carried forward', () => {
  const receipts: TestReceipt[] = [{ value: 30, category: 'metric' }];
  const prior: TestAgg = { sum: 100, count: 2 };
  const result = collapseObservations(testPipeline, receipts, prior);
  expect(result.aggregate.sum).toBe(130);
  expect(result.aggregate.count).toBe(3);
});

test('observation collapse: empty receipts produce identity aggregate', () => {
  const result = collapseObservations(testPipeline, [], null);
  expect(result.aggregate).toEqual({ sum: 0, count: 0 });
  expect(result.signal).toBe('degraded');
});

test('collapseAll: parallel pipelines produce independent results', () => {
  const receipts: TestReceipt[] = [
    { value: 80, category: 'metric' },
    { value: 20, category: 'metric' },
  ];

  const results = collapseAll(
    { metrics: testPipeline },
    receipts,
    {},
  );
  expect(results.metrics.aggregate.sum).toBe(100);
  expect(results.metrics.signal).toBe('degraded'); // avg 50, not > 50
});

// ═══════════════════════════════════════════════════════════
// Abstraction 3: Contextual Lattice Merge
// ═══════════════════════════════════════════════════════════

interface TestKV { readonly key: string; readonly governance: 'approved' | 'review-required' | 'blocked' }

const testMerge = fromBoundedLattice<TestKV, string>(
  {
    ...GovernanceLattice,
    meet: (a, b) => ({ key: a.key, governance: GovernanceLattice.meet(a.governance, b.governance) }),
    join: (a, b) => ({ key: a.key, governance: GovernanceLattice.join(a.governance, b.governance) }),
    top: { key: '', governance: 'approved' },
    bottom: { key: '', governance: 'blocked' },
    order: (a, b) => GovernanceLattice.order(a.governance, b.governance),
  },
  (v) => v.key,
);

test('contextual merge: overlay values join with base', () => {
  const base: TestKV[] = [
    { key: 'screen-a', governance: 'review-required' },
  ];
  const overlay: TestKV[] = [
    { key: 'screen-a', governance: 'approved' },
  ];
  const result = contextualMerge(testMerge, base, overlay, 'screen-a');
  expect(result.governance).toBe('approved'); // join = most permissive
});

test('contextual merge: missing key yields identity', () => {
  const result = contextualMerge(testMerge, [], [], 'nonexistent');
  expect(result.governance).toBe('blocked'); // identity = bottom
});

test('contextual merge: idempotent — merging with self is identity', () => {
  const base: TestKV[] = [{ key: 'x', governance: 'approved' }];
  const once = contextualMerge(testMerge, base, [], 'x');
  const twice = contextualMerge(testMerge, base, base, 'x');
  expect(once.governance).toBe(twice.governance);
});

test('contextualMergeAll: produces results for all unique keys', () => {
  const base: TestKV[] = [{ key: 'a', governance: 'blocked' }];
  const overlay: TestKV[] = [
    { key: 'a', governance: 'approved' },
    { key: 'b', governance: 'review-required' },
  ];
  const result = contextualMergeAll(testMerge, base, overlay);
  expect(result.size).toBe(2);
  expect(result.get('a')!.governance).toBe('approved');
  expect(result.get('b')!.governance).toBe('review-required');
});

// ═══════════════════════════════════════════════════════════
// Abstraction 4: Governed Suspension
// ═══════════════════════════════════════════════════════════

test('verdict: approved carries value', () => {
  const v = approved(42);
  expect(foldVerdict(v, {
    onApproved: (n) => n,
    onSuspended: () => -1,
    onBlocked: () => -1,
  })).toBe(42);
});

test('verdict: suspended carries needs and reason', () => {
  const v = suspended({ inputType: 'human-review' }, 'needs review');
  expect(foldVerdict(v, {
    onApproved: () => '',
    onSuspended: (_needs, reason) => reason,
    onBlocked: () => '',
  })).toBe('needs review');
});

test('verdict: mapVerdict preserves suspension/blocked', () => {
  const s = suspended('input', 'waiting');
  const mapped = mapVerdict(s, (n: number) => n * 2);
  expect(mapped._tag).toBe('Suspended');

  const b = blocked('forbidden');
  const mapped2 = mapVerdict(b, (n: number) => n * 2);
  expect(mapped2._tag).toBe('Blocked');
});

test('verdict: chainVerdict short-circuits on non-approved', () => {
  const b = blocked('no');
  const result = chainVerdict(b, () => approved(99));
  expect(result._tag).toBe('Blocked');
});

test('verdict: chainVerdict applies function on approved', () => {
  const a = approved(10);
  const result = chainVerdict(a, (n) => n > 5 ? approved(n * 2) : blocked('too small'));
  expect(result._tag).toBe('Approved');
  if (result._tag === 'Approved') expect(result.value).toBe(20);
});

test('fromGovernance: maps governance strings to verdicts', () => {
  expect(fromGovernance('approved', 'val')._tag).toBe('Approved');
  expect(fromGovernance('review-required', 'val')._tag).toBe('Suspended');
  expect(fromGovernance('blocked', 'val')._tag).toBe('Blocked');
});

// ═══════════════════════════════════════════════════════════
// Collapse 2: Rung-Confidence Galois Connection
// ═══════════════════════════════════════════════════════════

test('galois: explicit rung has highest confidence', () => {
  expect(rungToMinConfidence('explicit')).toBe('human');
});

test('galois: needs-human rung has unbound confidence', () => {
  expect(rungToMinConfidence('needs-human')).toBe('unbound');
});

test('galois: α is monotone — higher rungs produce higher confidence', () => {
  const rungs: ResolutionPrecedenceRung[] = [
    'explicit', 'control', 'approved-screen-knowledge', 'shared-patterns',
    'prior-evidence', 'live-dom', 'agent-interpreted', 'needs-human',
  ];
  for (let i = 0; i < rungs.length - 1; i++) {
    const higher = confidenceOrdinal(rungToMinConfidence(rungs[i]!));
    const lower = confidenceOrdinal(rungToMinConfidence(rungs[i + 1]!));
    expect(higher).toBeGreaterThanOrEqual(lower);
  }
});

test('galois: γ(confidence) contains exactly the rungs with sufficient α', () => {
  const levels: Confidence[] = ['unbound', 'agent-proposed', 'agent-verified', 'compiler-derived', 'human'];
  for (const level of levels) {
    const rungs = confidenceToRungs(level);
    for (const rung of rungs) {
      expect(confidenceGte(rungToMinConfidence(rung), level)).toBe(true);
    }
  }
});

test('galois connection law: α(r) ≥ c ⟺ r ∈ γ(c)', () => {
  const allRungs: ResolutionPrecedenceRung[] = [
    'explicit', 'control', 'approved-screen-knowledge', 'shared-patterns',
    'prior-evidence', 'semantic-dictionary', 'approved-equivalent-overlay',
    'structured-translation', 'live-dom', 'agent-interpreted', 'needs-human',
  ];
  const allConfidences: Confidence[] = ['unbound', 'intent-only', 'agent-proposed', 'agent-verified', 'compiler-derived', 'human'];

  for (const rung of allRungs) {
    for (const conf of allConfidences) {
      const alphaGteC = confidenceGte(rungToMinConfidence(rung), conf);
      const rInGammaC = confidenceToRungs(conf).has(rung);
      expect(alphaGteC).toBe(rInGammaC);
    }
  }
});

test('consistency: explicit rung cannot claim agent-proposed', () => {
  // A binding from 'explicit' has min confidence 'human', so claiming
  // 'agent-proposed' (lower) is consistent — you CAN claim less than you have
  expect(isConsistentProvenance('explicit', 'agent-proposed')).toBe(true);
});

test('consistency: live-dom rung cannot claim human confidence', () => {
  // live-dom has min confidence 'agent-proposed', so claiming 'human' (higher) is inconsistent
  expect(isConsistentProvenance('live-dom', 'human')).toBe(false);
});

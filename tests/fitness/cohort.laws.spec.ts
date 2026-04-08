import { expect, test } from '@playwright/test';
import {
  cohortKey,
  cohortKeyDigest,
  comparable,
  DEFAULT_JACCARD_THRESHOLD,
  jaccard,
} from '../../lib/domain/fitness/cohort';

const policySearchA = cohortKey({
  substrate: 'demo',
  screens: ['policy-search', 'policy-detail', 'policy-edit', 'home'],
  postureMode: 'warm-start',
});

// ─── Jaccard sanity ────────────────────────────────────────────────

test('jaccard: identical sets → 1', () => {
  const s = new Set(['a', 'b', 'c']);
  expect(jaccard(s, s)).toBe(1);
});

test('jaccard: disjoint sets → 0', () => {
  expect(jaccard(new Set(['a', 'b']), new Set(['c', 'd']))).toBe(0);
});

test('jaccard: empty + empty → 1 (degenerate identity)', () => {
  expect(jaccard(new Set(), new Set())).toBe(1);
});

test('jaccard: empty + non-empty → 0', () => {
  expect(jaccard(new Set(), new Set(['a']))).toBe(0);
});

test('jaccard: 50% overlap → 1/3 ({a,b} vs {b,c} = |{b}|/|{a,b,c}| = 1/3)', () => {
  expect(jaccard(new Set(['a', 'b']), new Set(['b', 'c']))).toBeCloseTo(1 / 3, 12);
});

test('jaccard: symmetric', () => {
  const a = new Set(['x', 'y', 'z']);
  const b = new Set(['y', 'z', 'w', 'q']);
  expect(jaccard(a, b)).toBe(jaccard(b, a));
});

// ─── Comparable: reflexivity / symmetry ────────────────────────────

test('comparable: reflexive (any cohort is comparable to itself)', () => {
  expect(comparable(policySearchA, policySearchA)).toBe(true);
});

test('comparable: symmetric', () => {
  const b = cohortKey({
    substrate: 'demo',
    screens: ['policy-search', 'policy-detail', 'policy-edit', 'about'],
    postureMode: 'warm-start',
  });
  expect(comparable(policySearchA, b)).toBe(comparable(b, policySearchA));
});

// ─── Substrate / posture fence ────────────────────────────────────

test('comparable: different substrate → never comparable, even with full screen overlap', () => {
  const otherSubstrate = cohortKey({
    substrate: 'production',
    screens: [...policySearchA.screenSet],
    postureMode: 'warm-start',
  });
  expect(comparable(policySearchA, otherSubstrate)).toBe(false);
});

test('comparable: different postureMode → never comparable', () => {
  const cold = cohortKey({
    substrate: 'demo',
    screens: [...policySearchA.screenSet],
    postureMode: 'cold-start',
  });
  expect(comparable(policySearchA, cold)).toBe(false);
});

// ─── Jaccard threshold ────────────────────────────────────────────

test('comparable at default threshold: 75% overlap passes', () => {
  // 4 vs 4 with 3 shared → jaccard = 3/5 = 0.6 ≥ 0.5
  const b = cohortKey({
    substrate: 'demo',
    screens: ['policy-search', 'policy-detail', 'policy-edit', 'about'],
    postureMode: 'warm-start',
  });
  expect(comparable(policySearchA, b)).toBe(true);
});

test('comparable at default threshold: 25% overlap fails', () => {
  // 4 vs 4 with 1 shared → jaccard = 1/7 ≈ 0.143 < 0.5
  const b = cohortKey({
    substrate: 'demo',
    screens: ['policy-search', 'about', 'support', 'help'],
    postureMode: 'warm-start',
  });
  expect(comparable(policySearchA, b)).toBe(false);
});

test('comparable threshold parameter respected', () => {
  // jaccard ≈ 0.143 — fails default but passes when threshold = 0.1
  const b = cohortKey({
    substrate: 'demo',
    screens: ['policy-search', 'about', 'support', 'help'],
    postureMode: 'warm-start',
  });
  expect(comparable(policySearchA, b, 0.1)).toBe(true);
  expect(comparable(policySearchA, b, DEFAULT_JACCARD_THRESHOLD)).toBe(false);
});

// ─── Digest ───────────────────────────────────────────────────────

test('cohortKeyDigest: identical inputs produce identical digests', () => {
  const a = cohortKey({ substrate: 'demo', screens: ['s2', 's1'], postureMode: 'warm-start' });
  const b = cohortKey({ substrate: 'demo', screens: ['s1', 's2'], postureMode: 'warm-start' });
  expect(cohortKeyDigest(a)).toBe(cohortKeyDigest(b));
});

test('cohortKeyDigest: different substrate → different digest', () => {
  const a = cohortKey({ substrate: 'demo', screens: ['s'], postureMode: 'warm-start' });
  const b = cohortKey({ substrate: 'prod', screens: ['s'], postureMode: 'warm-start' });
  expect(cohortKeyDigest(a)).not.toBe(cohortKeyDigest(b));
});

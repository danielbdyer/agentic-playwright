/**
 * Knowledge Freshness — Law Tests (W2.9)
 *
 * Verifies the exponential decay model for knowledge artifact confidence:
 *   - Disabled policy is a no-op
 *   - Decay is monotonically decreasing with runs
 *   - Confidence never drops below minimumConfidence
 *   - Zero runs produces no decay
 *   - Exponential formula correctness
 *   - Staleness threshold is sharp
 *
 * 20 mulberry32 seeds per law.
 */

import { expect, test } from '@playwright/test';
import {
  computeDecayedConfidence,
  defaultFreshnessPolicy,
  isStale,
  type FreshnessPolicy,
} from '../lib/domain/knowledge/knowledge-freshness';
import { mulberry32 , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───

function randomPolicy(next: () => number): FreshnessPolicy {
  return {
    enabled: true,
    maxRunsWithoutExercise: 1 + Math.floor(next() * 50),
    decayRate: next() * 0.5, // 0–0.5 range to keep decay reasonable
    minimumConfidence: next() * 0.3, // 0–0.3 floor
  };
}

function randomConfidence(next: () => number): number {
  return 0.1 + next() * 0.9; // 0.1–1.0
}

function randomRuns(next: () => number): number {
  return Math.floor(next() * 100);
}

// ─── Law 1: Disabled policy returns original confidence unchanged ───

test('disabled policy returns original confidence unchanged (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const original = randomConfidence(next);
    const runs = randomRuns(next);
    const policy: FreshnessPolicy = { ...randomPolicy(next), enabled: false };

    const result = computeDecayedConfidence(original, runs, policy);
    expect(result).toBe(original);
  }
});

// ─── Law 2: Decay is monotonically decreasing with runs ───

test('decay is monotonically decreasing with runs (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const policy = randomPolicy(next);
    // Ensure original >= minimumConfidence so clamping never causes an increase
    const original = policy.minimumConfidence + next() * (1 - policy.minimumConfidence);

    let previous = computeDecayedConfidence(original, 0, policy);
    for (let runs = 1; runs <= 20; runs += 1) {
      const current = computeDecayedConfidence(original, runs, policy);
      expect(current).toBeLessThanOrEqual(previous);
      previous = current;
    }
  }
});

// ─── Law 3: Confidence never drops below minimumConfidence ───

test('confidence never drops below minimumConfidence (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const original = randomConfidence(next);
    const policy = randomPolicy(next);
    const runs = randomRuns(next);

    const result = computeDecayedConfidence(original, runs, policy);
    expect(result).toBeGreaterThanOrEqual(policy.minimumConfidence);
  }
});

// ─── Law 4: Zero runs = no decay ───

test('zero runs produces no decay (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const original = randomConfidence(next);
    const policy = randomPolicy(next);

    const result = computeDecayedConfidence(original, 0, policy);
    expect(result).toBe(original);
  }
});

// ─── Law 5: Exponential decay formula correctness ───

test('exponential decay matches manual calculation (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const original = randomConfidence(next);
    const policy = randomPolicy(next);
    const runs = 1 + Math.floor(next() * 30);

    const expected = Math.max(
      policy.minimumConfidence,
      original * Math.pow(1 - policy.decayRate, runs),
    );
    const result = computeDecayedConfidence(original, runs, policy);
    expect(result).toBeCloseTo(expected, 12);
  }
});

// ─── Law 6: Staleness threshold is sharp ───

test('staleness threshold is sharp — at N-1 not stale, at N stale (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const policy = randomPolicy(next);
    const threshold = policy.maxRunsWithoutExercise;

    expect(isStale(threshold - 1, policy)).toBe(false);
    expect(isStale(threshold, policy)).toBe(true);
    expect(isStale(threshold + 1, policy)).toBe(true);
  }
});

// ─── Default policy ───

test('defaultFreshnessPolicy returns disabled policy', () => {
  const policy = defaultFreshnessPolicy();
  expect(policy.enabled).toBe(false);
  expect(policy.maxRunsWithoutExercise).toBeGreaterThan(0);
  expect(policy.decayRate).toBeGreaterThan(0);
  expect(policy.decayRate).toBeLessThan(1);
  expect(policy.minimumConfidence).toBeGreaterThan(0);
  expect(policy.minimumConfidence).toBeLessThan(1);
});

test('disabled policy never reports stale (20 seeds)', () => {
  for (let seed = 1; seed <= LAW_SEED_COUNT; seed += 1) {
    const next = mulberry32(seed);
    const runs = randomRuns(next);
    const policy: FreshnessPolicy = { ...randomPolicy(next), enabled: false };

    expect(isStale(runs, policy)).toBe(false);
  }
});

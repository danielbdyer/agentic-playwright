/**
 * Agent A/B Testing — Law-style tests.
 *
 * Laws verified (20 seeds each where applicable):
 *   1. Variant assignment determinism
 *   2. Traffic split approximation
 *   3. Result recording preserves counts
 *   4. Summary confidence delta correctness
 *   5. Significance with zero samples is false
 *   6. Merge associativity
 *   7. Default config has valid trafficSplit in [0,1]
 *   8. All results have non-negative values
 *   9. Summary proposalQualityDelta is treatment minus control
 *  10. Pure function property
 */

import { expect, test } from '@playwright/test';
import {
  assignVariant,
  defaultABTestConfig,
  isSignificantDifference,
  mergeABTestSummaries,
  recordResult,
  summarizeABTest,
} from '../lib/application/agency/agent-ab-testing';
import type {
  ABTestConfig,
  ABTestResult,
} from '../lib/application/agency/agent-ab-testing';
import { mulberry32 , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


function makeConfig(next: () => number): ABTestConfig {
  return {
    testId: `test-${Math.floor(next() * 10000)}`,
    controlProvider: 'control-provider',
    treatmentProvider: 'treatment-provider',
    trafficSplit: next(),
    seed: Math.floor(next() * 1_000_000),
  };
}

function makeProposals(
  next: () => number,
  count: number,
): readonly { readonly confidence: number; readonly accepted: boolean }[] {
  return Array.from({ length: count }, () => ({
    confidence: next(),
    accepted: next() > 0.5,
  }));
}

function makeResult(next: () => number, variant: 'control' | 'treatment'): ABTestResult {
  const proposals = makeProposals(next, 1 + Math.floor(next() * 10));
  const r = recordResult(variant, `provider-${variant}`, proposals);
  return { ...r, testId: `test-${Math.floor(next() * 10000)}` };
}

// ─── Law 1: Variant assignment determinism (20 seeds) ───

test('Law 1 — assignVariant is deterministic', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const config = makeConfig(next);
    const stepIndex = Math.floor(next() * 1000);
    const first = assignVariant(stepIndex, config);
    const second = assignVariant(stepIndex, config);
    expect(first).toBe(second);
  }
});

// ─── Law 2: Traffic split approximation ───

test('Law 2 — traffic split approximation over many assignments', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const config = makeConfig(next);
    const N = 2000;
    let treatmentCount = 0;
    for (let i = 0; i < N; i++) {
      if (assignVariant(i, config) === 'treatment') treatmentCount++;
    }
    const observedRatio = treatmentCount / N;
    // Allow generous tolerance for hash-based splitting
    expect(Math.abs(observedRatio - config.trafficSplit)).toBeLessThan(0.15);
  }
});

// ─── Law 3: Result recording preserves counts ───

test('Law 3 — recordResult preserves proposal and success counts', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const proposals = makeProposals(next, 1 + Math.floor(next() * 20));
    const result = recordResult('control', 'prov', proposals);
    expect(result.proposalCount).toBe(proposals.length);
    expect(result.successCount).toBe(proposals.filter((p) => p.accepted).length);
  }
});

// ─── Law 4: Summary confidence delta correctness ───

test('Law 4 — summary confidenceDelta is treatment avg minus control avg', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const controlResults = Array.from({ length: 1 + Math.floor(next() * 5) }, () => makeResult(next, 'control'));
    const treatmentResults = Array.from({ length: 1 + Math.floor(next() * 5) }, () => makeResult(next, 'treatment'));
    const summary = summarizeABTest(controlResults, treatmentResults);

    const controlMean =
      controlResults.reduce((a, r) => a + r.averageConfidence, 0) / controlResults.length;
    const treatmentMean =
      treatmentResults.reduce((a, r) => a + r.averageConfidence, 0) / treatmentResults.length;
    const expectedDelta = treatmentMean - controlMean;

    expect(Math.abs(summary.confidenceDelta - expectedDelta)).toBeLessThan(1e-10);
  }
});

// ─── Law 5: Significance with zero samples is false ───

test('Law 5 — isSignificantDifference returns false for zero samples', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const a = next();
    const b = next();
    expect(isSignificantDifference(a, b, 0)).toBe(false);
  }
});

// ─── Law 6: Merge associativity ───

test('Law 6 — mergeABTestSummaries is associative', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const mkSummary = () => {
      const cr = Array.from({ length: 1 + Math.floor(next() * 3) }, () => makeResult(next, 'control'));
      const tr = Array.from({ length: 1 + Math.floor(next() * 3) }, () => makeResult(next, 'treatment'));
      return summarizeABTest(cr, tr);
    };
    const a = mkSummary();
    const b = mkSummary();
    const c = mkSummary();

    const left = mergeABTestSummaries(mergeABTestSummaries(a, b), c);
    const right = mergeABTestSummaries(a, mergeABTestSummaries(b, c));

    expect(left.controlResults.length).toBe(right.controlResults.length);
    expect(left.treatmentResults.length).toBe(right.treatmentResults.length);
    expect(Math.abs(left.confidenceDelta - right.confidenceDelta)).toBeLessThan(1e-10);
    expect(Math.abs(left.proposalQualityDelta - right.proposalQualityDelta)).toBeLessThan(1e-10);
  }
});

// ─── Law 7: Default config has valid trafficSplit ───

test('Law 7 — defaultABTestConfig has trafficSplit in [0,1]', () => {
  const config = defaultABTestConfig();
  expect(config.trafficSplit).toBeGreaterThanOrEqual(0);
  expect(config.trafficSplit).toBeLessThanOrEqual(1);
});

// ─── Law 8: All results have non-negative values ───

test('Law 8 — recordResult produces non-negative numeric fields', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const proposals = makeProposals(next, 1 + Math.floor(next() * 20));
    const result = recordResult('treatment', 'prov', proposals);
    expect(result.proposalCount).toBeGreaterThanOrEqual(0);
    expect(result.successCount).toBeGreaterThanOrEqual(0);
    expect(result.averageConfidence).toBeGreaterThanOrEqual(0);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  }
});

// ─── Law 9: proposalQualityDelta is treatment minus control ───

test('Law 9 — summary proposalQualityDelta is treatment quality minus control quality', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const next = mulberry32(s);
    const controlResults = Array.from({ length: 1 + Math.floor(next() * 5) }, () => makeResult(next, 'control'));
    const treatmentResults = Array.from({ length: 1 + Math.floor(next() * 5) }, () => makeResult(next, 'treatment'));
    const summary = summarizeABTest(controlResults, treatmentResults);

    const quality = (results: readonly ABTestResult[]) => {
      const totalP = results.reduce((a, r) => a + r.proposalCount, 0);
      const totalS = results.reduce((a, r) => a + r.successCount, 0);
      return totalP === 0 ? 0 : totalS / totalP;
    };

    const expected = quality(treatmentResults) - quality(controlResults);
    expect(Math.abs(summary.proposalQualityDelta - expected)).toBeLessThan(1e-10);
  }
});

// ─── Law 10: Pure function property ───

test('Law 10 — functions are pure: same inputs yield same outputs', () => {
  for (let s = 0; s < LAW_SEED_COUNT; s++) {
    const run = () => {
      const next = mulberry32(s);
      const config = makeConfig(next);
      const stepIdx = Math.floor(next() * 1000);
      const variant = assignVariant(stepIdx, config);
      const proposals = makeProposals(next, 5);
      const result = recordResult(variant, 'p', proposals);
      return { variant, result };
    };
    const first = run();
    const second = run();
    expect(first.variant).toBe(second.variant);
    expect(first.result).toEqual(second.result);
  }
});

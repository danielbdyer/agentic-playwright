/**
 * W4.15 — Proposal Quality Metrics Law Tests
 *
 * Laws verified:
 *  1. Classification determinism — same input always yields same output
 *  2. Misdirection rate bounds [0, 1]
 *  3. Success rate bounds [0, 1]
 *  4. Misdirection + success rates <= 1 when counts are valid
 *  5. Insufficient data for aliases below minimum runs
 *  6. Toxic aliases are subset of all aliases
 *  7. Aggregation counts sum correctly
 *  8. Empty outcomes produce zero metrics
 *  9. Quarantine implies toxic classification
 * 10. findToxicAliases sorted by misdirection rate descending
 * 11. Pure function property — same input same output
 */

import { expect, test } from '@playwright/test';
import {
  classifyAlias,
  computeMisdirectionRate,
  computeSuccessRate,
  aggregateQualityMetrics,
  findToxicAliases,
  shouldQuarantine,
  defaultQualityThresholds,
  type AliasOutcome,
} from '../lib/domain/governance/proposal-quality';
import { mulberry32, randomInt, randomWord, pick , LAW_SEED_COUNT } from './support/random';

// ─── Helpers ───


function randomOutcome(next: () => number): AliasOutcome {
  const usedInRuns = randomInt(next, 30);
  const misdirectionCount = usedInRuns > 0 ? randomInt(next, usedInRuns + 1) : 0;
  const remainingRuns = usedInRuns - misdirectionCount;
  const successCount = remainingRuns > 0 ? randomInt(next, remainingRuns + 1) : 0;
  return {
    aliasId: `alias-${randomWord(next)}`,
    screenId: `screen-${randomWord(next)}`,
    elementId: `el-${randomWord(next)}`,
    proposedBy: pick(next, ['agent', 'human', 'heuristic']),
    suggestedAt: '2026-01-15T10:00:00Z',
    usedInRuns,
    misdirectionCount,
    successCount,
  };
}

function randomOutcomeList(next: () => number): readonly AliasOutcome[] {
  const count = randomInt(next, 10) + 1;
  return Array.from({ length: count }, () => randomOutcome(next));
}

// ─── Law 1: Classification determinism ───

test.describe('Law 1: Classification determinism', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcome = randomOutcome(next);
      const first = classifyAlias(outcome);
      const second = classifyAlias(outcome);
      expect(first).toBe(second);
    });
  }
});

// ─── Law 2: Misdirection rate bounds [0, 1] ───

test.describe('Law 2: Misdirection rate in [0, 1]', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcome = randomOutcome(next);
      const rate = computeMisdirectionRate(outcome);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    });
  }
});

// ─── Law 3: Success rate bounds [0, 1] ───

test.describe('Law 3: Success rate in [0, 1]', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcome = randomOutcome(next);
      const rate = computeSuccessRate(outcome);
      expect(rate).toBeGreaterThanOrEqual(0);
      expect(rate).toBeLessThanOrEqual(1);
    });
  }
});

// ─── Law 4: Misdirection + success rates <= 1 when counts are valid ───

test.describe('Law 4: Misdirection + success rates <= 1', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcome = randomOutcome(next);
      const mRate = computeMisdirectionRate(outcome);
      const sRate = computeSuccessRate(outcome);
      expect(mRate + sRate).toBeLessThanOrEqual(1 + 1e-10);
    });
  }
});

// ─── Law 5: Insufficient data for aliases below minimum runs ───

test.describe('Law 5: Insufficient data below minimum runs', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const thresholds = defaultQualityThresholds();
      const usedInRuns = randomInt(next, thresholds.minimumRuns);
      const outcome: AliasOutcome = {
        aliasId: `alias-${randomWord(next)}`,
        screenId: `screen-${randomWord(next)}`,
        elementId: `el-${randomWord(next)}`,
        proposedBy: 'agent',
        suggestedAt: '2026-01-15T10:00:00Z',
        usedInRuns,
        misdirectionCount: usedInRuns > 0 ? randomInt(next, usedInRuns + 1) : 0,
        successCount: 0,
      };
      expect(classifyAlias(outcome, thresholds)).toBe('insufficient-data');
    });
  }
});

// ─── Law 6: Toxic aliases are subset of all aliases ───

test.describe('Law 6: Toxic aliases subset of all aliases', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcomes = randomOutcomeList(next);
      const toxic = findToxicAliases(outcomes);
      const outcomeIds = new Set(outcomes.map((o) => o.aliasId));
      for (const t of toxic) {
        expect(outcomeIds.has(t.aliasId)).toBe(true);
      }
      expect(toxic.length).toBeLessThanOrEqual(outcomes.length);
    });
  }
});

// ─── Law 7: Aggregation counts sum correctly ───

test.describe('Law 7: Aggregation counts sum correctly', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcomes = randomOutcomeList(next);
      const metrics = aggregateQualityMetrics(outcomes);

      expect(metrics.totalAliases).toBe(outcomes.length);
      // healthy + suspect + toxic + insufficient-data = total
      const classifiedCount = metrics.healthyCount + metrics.suspectCount + metrics.toxicCount;
      const insufficientCount = outcomes.filter(
        (o) => classifyAlias(o) === 'insufficient-data',
      ).length;
      expect(classifiedCount + insufficientCount).toBe(metrics.totalAliases);
    });
  }
});

// ─── Law 8: Empty outcomes produce zero metrics ───

test('Law 8: Empty outcomes produce zero metrics', () => {
  const metrics = aggregateQualityMetrics([]);
  expect(metrics.totalAliases).toBe(0);
  expect(metrics.healthyCount).toBe(0);
  expect(metrics.suspectCount).toBe(0);
  expect(metrics.toxicCount).toBe(0);
  expect(metrics.misdirectionRate).toBe(0);
  expect(metrics.averageSuccessRate).toBe(0);
});

// ─── Law 9: Quarantine implies toxic classification ───

test.describe('Law 9: Quarantine implies toxic classification', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcome = randomOutcome(next);
      if (shouldQuarantine(outcome)) {
        expect(classifyAlias(outcome)).toBe('toxic');
      }
      // Converse: toxic implies quarantine
      if (classifyAlias(outcome) === 'toxic') {
        expect(shouldQuarantine(outcome)).toBe(true);
      }
    });
  }
});

// ─── Law 10: findToxicAliases sorted by misdirection rate descending ───

test.describe('Law 10: Toxic aliases sorted by misdirection rate descending', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcomes = randomOutcomeList(next);
      const toxic = findToxicAliases(outcomes);
      for (let i = 1; i < toxic.length; i++) {
        const prev = toxic[i - 1]!;
        const curr = toxic[i]!;
        expect(computeMisdirectionRate(prev)).toBeGreaterThanOrEqual(
          computeMisdirectionRate(curr),
        );
      }
    });
  }
});

// ─── Law 11: Pure function property — same input same output ───

test.describe('Law 11: Pure function property', () => {
  for (let seed = 0; seed < LAW_SEED_COUNT; seed++) {
    test(`seed=${seed}`, () => {
      const next = mulberry32(seed);
      const outcomes = randomOutcomeList(next);

      // Recreate the same outcomes from the same seed
      const next2 = mulberry32(seed);
      const outcomes2 = randomOutcomeList(next2);

      // All pure functions produce identical results
      const metrics1 = aggregateQualityMetrics(outcomes);
      const metrics2 = aggregateQualityMetrics(outcomes2);
      expect(metrics1).toEqual(metrics2);

      const toxic1 = findToxicAliases(outcomes);
      const toxic2 = findToxicAliases(outcomes2);
      expect(toxic1).toEqual(toxic2);

      for (let i = 0; i < outcomes.length; i++) {
        expect(classifyAlias(outcomes[i]!)).toBe(classifyAlias(outcomes2[i]!));
        expect(computeMisdirectionRate(outcomes[i]!)).toBe(computeMisdirectionRate(outcomes2[i]!));
        expect(computeSuccessRate(outcomes[i]!)).toBe(computeSuccessRate(outcomes2[i]!));
        expect(shouldQuarantine(outcomes[i]!)).toBe(shouldQuarantine(outcomes2[i]!));
      }
    });
  }
});

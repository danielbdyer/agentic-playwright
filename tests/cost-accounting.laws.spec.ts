/**
 * Cost OS — Law Tests
 *
 * Pure function invariants for unified pipeline phase cost accounting.
 * These tests verify the aggregation, totaling, budget evaluation, and
 * reporting logic that powers the N2.5 cost visibility surface.
 *
 * Tested functions:
 *   - aggregatePhaseCosts (cost-accounting.ts)
 *   - computeCostTotals (cost-accounting.ts)
 *   - evaluateBudgetStatus (cost-accounting.ts)
 *   - computeRunCostReport (cost-accounting.ts)
 */

import { expect, test } from '@playwright/test';
import {
  aggregatePhaseCosts,
  computeCostTotals,
  computeRunCostReport,
  DEFAULT_TOKEN_COST_USD,
  evaluateBudgetStatus,
} from '../lib/domain/cost-accounting';
import type {
  CostBudget,
  CostTotals,
  PhaseCost,
  PhaseCostProfile,
} from '../lib/domain/types/cost-accounting';

// ─── Helpers ───

function cost(phase: string, category: PhaseCost['category'], amount: number, unit = 'count'): PhaseCost {
  return { phase, category, amount, unit };
}

function profile(overrides: Partial<PhaseCostProfile> & { readonly phase: string }): PhaseCostProfile {
  return {
    costs: [],
    totalTokens: 0,
    totalLatencyMs: 0,
    totalRetries: 0,
    totalApiCalls: 0,
    ...overrides,
  };
}

function budget(overrides: Partial<CostBudget> = {}): CostBudget {
  return {
    maxTokensPerRun: null,
    maxLatencyMsPerStep: null,
    maxRetriesPerStep: null,
    maxCostUsdPerRun: null,
    ...overrides,
  };
}

// ─── aggregatePhaseCosts ───

test('empty costs yield empty profiles', () => {
  const result = aggregatePhaseCosts([]);
  expect(result).toEqual([]);
});

test('single phase aggregates correctly', () => {
  const costs: readonly PhaseCost[] = [
    cost('bind', 'tokens', 500, 'tokens'),
    cost('bind', 'latency', 120, 'ms'),
    cost('bind', 'retries', 1),
    cost('bind', 'api-calls', 2),
  ];

  const result = aggregatePhaseCosts(costs);

  expect(result).toHaveLength(1);
  const first = result[0]!;
  expect(first.phase).toBe('bind');
  expect(first.totalTokens).toBe(500);
  expect(first.totalLatencyMs).toBe(120);
  expect(first.totalRetries).toBe(1);
  expect(first.totalApiCalls).toBe(2);
});

test('multi-phase costs aggregate independently', () => {
  const costs: readonly PhaseCost[] = [
    cost('bind', 'tokens', 500),
    cost('bind', 'latency', 100),
    cost('resolve', 'tokens', 300),
    cost('resolve', 'latency', 200),
    cost('resolve', 'retries', 2),
  ];

  const result = aggregatePhaseCosts(costs);

  expect(result).toHaveLength(2);

  const bind = result.find((p) => p.phase === 'bind');
  expect(bind).toBeDefined();
  expect(bind!.totalTokens).toBe(500);
  expect(bind!.totalLatencyMs).toBe(100);
  expect(bind!.totalRetries).toBe(0);

  const resolve = result.find((p) => p.phase === 'resolve');
  expect(resolve).toBeDefined();
  expect(resolve!.totalTokens).toBe(300);
  expect(resolve!.totalLatencyMs).toBe(200);
  expect(resolve!.totalRetries).toBe(2);
});

// ─── computeCostTotals ───

test('empty phases yield zero totals', () => {
  const totals = computeCostTotals([]);
  expect(totals).toEqual({
    tokens: 0,
    latencyMs: 0,
    retries: 0,
    apiCalls: 0,
    estimatedCostUsd: 0,
  });
});

test('multi-phase totals sum correctly', () => {
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 500, totalLatencyMs: 100, totalRetries: 1, totalApiCalls: 3 }),
    profile({ phase: 'resolve', totalTokens: 300, totalLatencyMs: 200, totalRetries: 2, totalApiCalls: 1 }),
  ];

  const totals = computeCostTotals(phases);

  expect(totals.tokens).toBe(800);
  expect(totals.latencyMs).toBe(300);
  expect(totals.retries).toBe(3);
  expect(totals.apiCalls).toBe(4);
});

test('USD cost estimation from tokens uses default rate', () => {
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 1_000_000 }),
  ];

  const totals = computeCostTotals(phases);

  expect(totals.estimatedCostUsd).toBeCloseTo(1_000_000 * DEFAULT_TOKEN_COST_USD, 6);
});

test('USD cost estimation respects custom token rate', () => {
  const customRate = 0.00001;
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 100_000 }),
  ];

  const totals = computeCostTotals(phases, customRate);

  expect(totals.estimatedCostUsd).toBeCloseTo(100_000 * customRate, 6);
});

// ─── evaluateBudgetStatus ───

test('budget status: not-configured when all limits are null', () => {
  const totals: CostTotals = { tokens: 999, latencyMs: 999, retries: 999, apiCalls: 999, estimatedCostUsd: 999 };
  expect(evaluateBudgetStatus(totals, budget())).toBe('not-configured');
});

test('budget status: within-budget when under all limits', () => {
  const totals: CostTotals = { tokens: 100, latencyMs: 50, retries: 0, apiCalls: 1, estimatedCostUsd: 0.01 };

  expect(evaluateBudgetStatus(totals, budget({
    maxTokensPerRun: 1000,
    maxCostUsdPerRun: 1.0,
  }))).toBe('within-budget');
});

test('budget status: approaching-limit at 80%+ of any limit', () => {
  const totals: CostTotals = { tokens: 850, latencyMs: 0, retries: 0, apiCalls: 0, estimatedCostUsd: 0 };

  expect(evaluateBudgetStatus(totals, budget({
    maxTokensPerRun: 1000,
  }))).toBe('approaching-limit');
});

test('budget status: over-budget when any limit exceeded', () => {
  const totals: CostTotals = { tokens: 1500, latencyMs: 0, retries: 0, apiCalls: 0, estimatedCostUsd: 0 };

  expect(evaluateBudgetStatus(totals, budget({
    maxTokensPerRun: 1000,
  }))).toBe('over-budget');
});

test('budget status: over-budget takes precedence over approaching-limit', () => {
  const totals: CostTotals = { tokens: 1500, latencyMs: 900, retries: 0, apiCalls: 0, estimatedCostUsd: 0 };

  expect(evaluateBudgetStatus(totals, budget({
    maxTokensPerRun: 1000,
    maxLatencyMsPerStep: 1000,
  }))).toBe('over-budget');
});

// ─── computeRunCostReport ───

test('per-step average divides totals by step count', () => {
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 1000, totalLatencyMs: 200, totalRetries: 4, totalApiCalls: 10 }),
  ];

  const report = computeRunCostReport('run-1', phases, 4);

  expect(report.perStepAverage.tokens).toBe(250);
  expect(report.perStepAverage.latencyMs).toBe(50);
  expect(report.perStepAverage.retries).toBe(1);
  expect(report.perStepAverage.apiCalls).toBe(2.5);
});

test('zero steps produce zero per-step averages without division error', () => {
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 1000, totalLatencyMs: 200 }),
  ];

  const report = computeRunCostReport('run-0', phases, 0);

  expect(Number.isFinite(report.perStepAverage.tokens)).toBe(true);
  expect(report.perStepAverage.tokens).toBe(1000);
  expect(report.kind).toBe('run-cost-report');
  expect(report.version).toBe(1);
});

test('report carries budget status from budget', () => {
  const phases: readonly PhaseCostProfile[] = [
    profile({ phase: 'bind', totalTokens: 5000 }),
  ];

  const b = budget({ maxTokensPerRun: 1000 });
  const report = computeRunCostReport('run-over', phases, 1, b);

  expect(report.budgetStatus).toBe('over-budget');
});

test('report without budget yields not-configured', () => {
  const report = computeRunCostReport('run-none', [], 0);
  expect(report.budgetStatus).toBe('not-configured');
});

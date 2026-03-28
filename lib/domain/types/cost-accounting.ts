/**
 * Cost OS — Unified accounting types for tokens, latency, retries,
 * and API calls per pipeline phase.
 *
 * These types power the N2.5 cost visibility surface so operators can
 * make informed decisions about agent vs. deterministic resolution.
 */

// ─── Cost Categories ───

export type CostCategory = 'tokens' | 'latency' | 'retries' | 'api-calls' | 'compute';

// ─── Per-Phase Accounting ───

export interface PhaseCost {
  readonly phase: string;
  readonly category: CostCategory;
  readonly amount: number;
  readonly unit: string;
}

export interface PhaseCostProfile {
  readonly phase: string;
  readonly costs: readonly PhaseCost[];
  readonly totalTokens: number;
  readonly totalLatencyMs: number;
  readonly totalRetries: number;
  readonly totalApiCalls: number;
}

// ─── Run-Level Report ───

export interface RunCostReport {
  readonly kind: 'run-cost-report';
  readonly version: 1;
  readonly runId: string;
  readonly phases: readonly PhaseCostProfile[];
  readonly totals: CostTotals;
  readonly perStepAverage: CostTotals;
  readonly budgetStatus: CostBudgetStatus;
}

export interface CostTotals {
  readonly tokens: number;
  readonly latencyMs: number;
  readonly retries: number;
  readonly apiCalls: number;
  readonly estimatedCostUsd: number;
}

// ─── Budget Configuration ───

export interface CostBudget {
  readonly maxTokensPerRun: number | null;
  readonly maxLatencyMsPerStep: number | null;
  readonly maxRetriesPerStep: number | null;
  readonly maxCostUsdPerRun: number | null;
}

export type CostBudgetStatus = 'within-budget' | 'approaching-limit' | 'over-budget' | 'not-configured';

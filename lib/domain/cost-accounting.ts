/**
 * Cost OS — Pure computation for unified pipeline phase accounting.
 *
 * All functions are referentially transparent and operate on immutable
 * value objects. No side effects, no mutation, no imperative loops.
 */

import type {
  CostBudget,
  CostBudgetStatus,
  CostCategory,
  CostTotals,
  PhaseCost,
  PhaseCostProfile,
  RunCostReport,
} from './types/cost-accounting';

// ─── Constants ───

/** Default cost estimate: $3 per million tokens. */
export const DEFAULT_TOKEN_COST_USD = 0.000003;

// ─── Aggregation ───

const ZERO_CATEGORY_SUMS: Record<CostCategory, number> = {
  'tokens': 0,
  'latency': 0,
  'retries': 0,
  'api-calls': 0,
  'compute': 0,
};

/**
 * Group PhaseCost entries by phase name, summing amounts by category
 * within each phase.
 */
export function aggregatePhaseCosts(
  costs: readonly PhaseCost[],
): readonly PhaseCostProfile[] {
  const phaseNames = costs.reduce<readonly string[]>(
    (acc, c) => acc.includes(c.phase) ? acc : [...acc, c.phase],
    [],
  );

  return phaseNames.map((phase) => {
    const phaseCosts = costs.filter((c) => c.phase === phase);

    const sums = phaseCosts.reduce<Record<CostCategory, number>>(
      (acc, c) => ({ ...acc, [c.category]: (acc[c.category] ?? 0) + c.amount }),
      { ...ZERO_CATEGORY_SUMS },
    );

    return {
      phase,
      costs: phaseCosts,
      totalTokens: sums['tokens'],
      totalLatencyMs: sums['latency'],
      totalRetries: sums['retries'],
      totalApiCalls: sums['api-calls'],
    };
  });
}

// ─── Totals ───

/**
 * Sum tokens, latency, retries, and apiCalls across all phases.
 * Estimate USD cost as tokens * tokenCostUsd.
 */
export function computeCostTotals(
  phases: readonly PhaseCostProfile[],
  tokenCostUsd: number = DEFAULT_TOKEN_COST_USD,
): CostTotals {
  return phases.reduce<CostTotals>(
    (acc, p) => ({
      tokens: acc.tokens + p.totalTokens,
      latencyMs: acc.latencyMs + p.totalLatencyMs,
      retries: acc.retries + p.totalRetries,
      apiCalls: acc.apiCalls + p.totalApiCalls,
      estimatedCostUsd: (acc.tokens + p.totalTokens) * tokenCostUsd,
    }),
    { tokens: 0, latencyMs: 0, retries: 0, apiCalls: 0, estimatedCostUsd: 0 },
  );
}

// ─── Budget Evaluation ───

/**
 * Evaluate budget status:
 * - `not-configured` if all budget fields are null
 * - `over-budget` if any field exceeds its budget
 * - `approaching-limit` if any field > 80% of budget
 * - `within-budget` otherwise
 */
export function evaluateBudgetStatus(
  totals: CostTotals,
  budget: CostBudget,
): CostBudgetStatus {
  const checks: readonly { readonly value: number; readonly limit: number | null }[] = [
    { value: totals.tokens, limit: budget.maxTokensPerRun },
    { value: totals.latencyMs, limit: budget.maxLatencyMsPerStep },
    { value: totals.retries, limit: budget.maxRetriesPerStep },
    { value: totals.estimatedCostUsd, limit: budget.maxCostUsdPerRun },
  ];

  const configured = checks.filter((c) => c.limit !== null);

  return configured.length === 0
    ? 'not-configured'
    : configured.some((c) => c.value > c.limit!)
      ? 'over-budget'
      : configured.some((c) => c.value > c.limit! * 0.8)
        ? 'approaching-limit'
        : 'within-budget';
}

// ─── Run Cost Report ───

/**
 * Build a complete RunCostReport from phase profiles.
 *
 * Per-step average divides totals by stepCount. When stepCount is zero,
 * per-step averages are all zero (no division by zero).
 */
export function computeRunCostReport(
  runId: string,
  phases: readonly PhaseCostProfile[],
  stepCount: number,
  budget?: CostBudget,
  tokenCostUsd: number = DEFAULT_TOKEN_COST_USD,
): RunCostReport {
  const totals = computeCostTotals(phases, tokenCostUsd);
  const divisor = stepCount === 0 ? 1 : stepCount;

  const perStepAverage: CostTotals = {
    tokens: totals.tokens / divisor,
    latencyMs: totals.latencyMs / divisor,
    retries: totals.retries / divisor,
    apiCalls: totals.apiCalls / divisor,
    estimatedCostUsd: totals.estimatedCostUsd / divisor,
  };

  const budgetStatus: CostBudgetStatus = budget
    ? evaluateBudgetStatus(totals, budget)
    : 'not-configured';

  return {
    kind: 'run-cost-report',
    version: 1,
    runId,
    phases,
    totals,
    perStepAverage,
    budgetStatus,
  };
}

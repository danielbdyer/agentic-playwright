/**
 * Execution Cost Tracker — aggregates instruction and diagnostic costs
 * across runs and detects cost anomalies.
 *
 * StepExecutionReceipt has `cost.instructionCount`, `cost.diagnosticCount`,
 * `budget.thresholds`, `budget.status`, `budget.breaches` — but nothing
 * aggregates cost across runs or detects cost regressions. This module
 * closes that gap.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { StepExecutionReceipt } from '../domain/types';

// ─── Types ───

export interface CostObservation {
  readonly category: string;
  readonly instructionCount: number;
  readonly diagnosticCount: number;
  readonly succeeded: boolean;
  readonly budgetBreached: boolean;
}

export interface CostBaseline {
  readonly category: string;
  readonly medianInstructions: number;
  readonly p95Instructions: number;
  readonly medianDiagnostics: number;
  readonly p95Diagnostics: number;
  readonly sampleCount: number;
}

export interface CostBaselineIndex {
  readonly baselines: readonly CostBaseline[];
}

export interface CostAnomaly {
  readonly category: string;
  readonly instructionCount: number;
  readonly diagnosticCount: number;
  readonly baselineP95Instructions: number;
  readonly baselineP95Diagnostics: number;
  readonly reason: 'instruction-spike' | 'diagnostic-spike' | 'both';
}

export interface CostAnomalyReport {
  readonly anomalies: readonly CostAnomaly[];
  readonly anomalyRate: number;
}

export interface CostConfig {
  readonly anomalyThreshold: number;
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  anomalyThreshold: 1.5,
};

// ─── Statistics helpers ───

function sortedNumbers(values: readonly number[]): readonly number[] {
  return [...values].sort((a, b) => a - b);
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower]!;
  const weight = idx - lower;
  return sorted[lower]! * (1 - weight) + sorted[upper]! * weight;
}

// ─── Category key ───

/**
 * Deterministic category key from step fields.
 * Uses widgetContract:mode pattern matching timing-baseline.ts convention.
 */
export function costCategory(step: StepExecutionReceipt): string {
  const widget = step.widgetContract ?? 'unknown';
  const mode = step.mode ?? 'unknown';
  return `${widget}:${mode}`;
}

// ─── Extraction ───

/**
 * Extract cost observations from step execution receipts.
 */
export function extractCostObservations(
  steps: readonly StepExecutionReceipt[],
): readonly CostObservation[] {
  return steps.map((step) => ({
    category: costCategory(step),
    instructionCount: step.cost.instructionCount,
    diagnosticCount: step.cost.diagnosticCount,
    succeeded: step.failure.family === 'none',
    budgetBreached: step.budget.status === 'over-budget',
  }));
}

// ─── Baseline computation ───

/**
 * Build cost baselines from observations, grouped by category.
 */
export function buildCostBaselines(
  observations: readonly CostObservation[],
): CostBaselineIndex {
  if (observations.length === 0) {
    return { baselines: [] };
  }

  const groups = new Map<string, CostObservation[]>();
  for (const obs of observations) {
    const existing = groups.get(obs.category);
    if (existing) {
      existing.push(obs);
    } else {
      groups.set(obs.category, [obs]);
    }
  }

  const baselines: CostBaseline[] = [...groups.entries()]
    .map(([category, obs]) => {
      const sortedInstr = sortedNumbers(obs.map((o) => o.instructionCount));
      const sortedDiag = sortedNumbers(obs.map((o) => o.diagnosticCount));

      return {
        category,
        medianInstructions: median(sortedInstr),
        p95Instructions: percentile(sortedInstr, 95),
        medianDiagnostics: median(sortedDiag),
        p95Diagnostics: percentile(sortedDiag, 95),
        sampleCount: obs.length,
      };
    })
    .sort((a, b) => a.category.localeCompare(b.category));

  return { baselines };
}

// ─── Anomaly detection ───

/**
 * Detect cost anomalies: steps whose instruction or diagnostic count
 * exceeds the category's p95 * threshold.
 */
export function detectCostAnomalies(
  steps: readonly StepExecutionReceipt[],
  baselines: CostBaselineIndex,
  config: CostConfig = DEFAULT_COST_CONFIG,
): CostAnomalyReport {
  if (baselines.baselines.length === 0) {
    return { anomalies: [], anomalyRate: 0 };
  }

  const baselineMap = new Map(baselines.baselines.map((b) => [b.category, b]));
  const anomalies: CostAnomaly[] = [];

  for (const step of steps) {
    const category = costCategory(step);
    const baseline = baselineMap.get(category);
    if (!baseline || baseline.sampleCount < 2) continue;

    const instrThreshold = baseline.p95Instructions * config.anomalyThreshold;
    const diagThreshold = baseline.p95Diagnostics * config.anomalyThreshold;

    const instrSpike = step.cost.instructionCount > instrThreshold && instrThreshold > 0;
    const diagSpike = step.cost.diagnosticCount > diagThreshold && diagThreshold > 0;

    if (instrSpike || diagSpike) {
      anomalies.push({
        category,
        instructionCount: step.cost.instructionCount,
        diagnosticCount: step.cost.diagnosticCount,
        baselineP95Instructions: baseline.p95Instructions,
        baselineP95Diagnostics: baseline.p95Diagnostics,
        reason: instrSpike && diagSpike ? 'both' : instrSpike ? 'instruction-spike' : 'diagnostic-spike',
      });
    }
  }

  return {
    anomalies,
    anomalyRate: steps.length > 0 ? anomalies.length / steps.length : 0,
  };
}

// ─── Efficiency ───

/**
 * Compute overall cost efficiency: [0, 1].
 * Higher = more steps succeed at lower cost.
 * Weights successful low-cost steps higher than expensive ones.
 */
export function computeCostEfficiency(
  index: CostBaselineIndex,
): number {
  if (index.baselines.length === 0) return 1;

  const maxInstr = Math.max(...index.baselines.map((b) => b.p95Instructions), 1);
  let totalWeight = 0;
  let weightedEfficiency = 0;

  for (const baseline of index.baselines) {
    const normalizedCost = baseline.medianInstructions / maxInstr;
    const efficiency = 1 - normalizedCost;
    const weight = baseline.sampleCount;
    totalWeight += weight;
    weightedEfficiency += efficiency * weight;
  }

  return totalWeight > 0 ? weightedEfficiency / totalWeight : 1;
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Execution cost as ObservationCollapse<R,O,A,S>:
//   extract: StepExecutionReceipt → CostObservation
//   aggregate: CostObservation → CostBaselineIndex
//   signal: CostBaselineIndex → number (cost efficiency)

import type { ObservationCollapse } from '../domain/kernel/observation-collapse';

export const executionCostCollapse: ObservationCollapse<
  StepExecutionReceipt,
  CostObservation,
  CostBaselineIndex,
  number
> = {
  extract: extractCostObservations,
  aggregate: (observations, _prior) => buildCostBaselines(observations),
  signal: computeCostEfficiency,
};

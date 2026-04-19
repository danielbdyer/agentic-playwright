/**
 * RiskFormula Strategy — composable risk-formula abstraction for proof
 * obligations.
 *
 * The branch's `runtimeProofObligations` (fitness.ts) and
 * `benchmarkProofObligations` (benchmark.ts) ship ~18 obligations each
 * with substantial structural duplication. Both follow the same shape:
 *
 *     extract risk signals → combine with weights → emit obligation
 *
 * This module factors that pattern through `ScoringRule<T>` from
 * `lib/domain/algebra/scoring.ts` — the codebase's existing primitive
 * for composable score combinators. Each obligation becomes a
 * `RiskFormula<Input>` that can be applied to an input record to
 * produce a `LogicalProofObligation`.
 *
 * Pure domain — no Effect, no IO.
 *
 * Pattern alignment: this is the GoF Strategy + Composite pattern
 * (each formula is a strategy; formulas compose through the ScoringRule
 * monoid into a higher-arity strategy). It mirrors the Visitor/Fold
 * discipline elsewhere in the codebase.
 */

import { type ScoringRule } from '../algebra/scoring';
import {
  RISK_CRITICAL_THRESHOLD,
  RISK_WATCH_THRESHOLD,
} from './risk-weights';
import type {
  LogicalProofObligation,
  LogicalProofObligationName,
  LogicalTheoremGroup,
} from './types';

// ─── Risk signal primitives ────────────────────────────────────────

/** A typed risk input. The `value` is in [0, 1] where 1 = max risk. */
export interface RiskSignal {
  readonly key: string;
  readonly value: number;
}

/** A risk-signal extractor: pure projection from input to a list of
 *  named, weighted signals. */
export type SignalExtractor<Input> = (input: Input) => readonly RiskSignal[];

/** A risk-aggregation strategy. The two we need today are:
 *  - `max-of`: the obligation's risk is the maximum across signals
 *    (used for risk floors — any single signal at high risk pushes
 *    the obligation to high risk)
 *  - `weighted-sum`: the obligation's risk is the weighted sum of
 *    signals (used for composite obligations like memory-worthiness) */
export type RiskAggregator = 'max-of' | 'weighted-sum';

/** A complete risk formula for a single obligation. */
export interface RiskFormula<Input> {
  readonly obligation: LogicalProofObligationName;
  readonly propertyRefs: readonly LogicalTheoremGroup[];
  readonly extract: SignalExtractor<Input>;
  readonly aggregate: RiskAggregator;
  readonly evidenceFormat: (input: Input, signals: readonly RiskSignal[]) => string;
  /** All formulas built through this module are heuristic-proxy by
   *  default. Direct measurements come through other paths
   *  (compounding-projection, fingerprint-stability-probe). */
  readonly measurementClass?: LogicalProofObligation['measurementClass'];
}

// ─── Pure aggregators ──────────────────────────────────────────────

/** Compute the obligation's risk from a list of signals. Pure. */
export function aggregateRisk(
  signals: readonly RiskSignal[],
  aggregator: RiskAggregator,
  weights: readonly number[] = [],
): number {
  if (signals.length === 0) return 0;
  const clamped = signals.map((s) => Math.max(0, Math.min(1, s.value)));
  switch (aggregator) {
    case 'max-of':
      return clamped.reduce((max, value) => Math.max(max, value), 0);
    case 'weighted-sum': {
      // Weights default to uniform if not provided.
      const w = weights.length === signals.length
        ? weights
        : signals.map(() => 1 / signals.length);
      const sum = clamped.reduce((acc, value, i) => acc + value * (w[i] ?? 0), 0);
      return Math.max(0, Math.min(1, sum));
    }
  }
}

/** Map risk to status. Pure. */
export function riskStatus(risk: number): LogicalProofObligation['status'] {
  if (risk >= RISK_CRITICAL_THRESHOLD) return 'critical';
  if (risk >= RISK_WATCH_THRESHOLD) return 'watch';
  return 'healthy';
}

// ─── Application ───────────────────────────────────────────────────

/** Apply a single formula to an input. Pure. */
export function applyRiskFormula<I>(
  formula: RiskFormula<I>,
  input: I,
  weights?: readonly number[],
): LogicalProofObligation {
  const signals = formula.extract(input);
  const risk = aggregateRisk(signals, formula.aggregate, weights);
  return {
    obligation: formula.obligation,
    propertyRefs: formula.propertyRefs,
    score: Number((1 - risk).toFixed(4)),
    status: riskStatus(risk),
    evidence: formula.evidenceFormat(input, signals),
    measurementClass: formula.measurementClass ?? 'heuristic-proxy',
  };
}

/** Apply many formulas. Pure. */
export function applyRiskFormulas<I>(
  formulas: readonly RiskFormula<I>[],
  input: I,
): readonly LogicalProofObligation[] {
  return formulas.map((formula) => applyRiskFormula(formula, input));
}

// ─── Adapter to the algebra `ScoringRule` monoid ───────────────────

/**
 * A risk formula's signal extractor can be expressed as a `ScoringRule`
 * over the same input. Composition through the existing
 * `scoringRuleMonoid` then gives free-of-charge accumulation of
 * weighted signals — useful for composite obligations.
 *
 * Pure: no IO, no side effects.
 */
export function signalExtractorToScoringRule<I>(
  extract: SignalExtractor<I>,
  signalKey: string,
): ScoringRule<I> {
  return {
    score: (input) => {
      const signal = extract(input).find((s) => s.key === signalKey);
      return signal?.value ?? 0;
    },
  };
}

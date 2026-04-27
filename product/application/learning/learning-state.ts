/**
 * Learning State Orchestrator — composes all pure-function intelligence
 * modules into a unified learning aggregate.
 *
 * This is the integration layer that takes StepExecutionReceipt[] from
 * completed runs, feeds each extraction to its corresponding module,
 * merges indices into a unified LearningState, and surfaces aggregate
 * signals for fitness computation and proposal targeting.
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { StepExecutionReceipt } from '../../domain/execution/types';
import type { ComponentProposal } from '../../domain/projection/component-maturation';
import { matureComponentKnowledge } from '../../domain/projection/component-maturation';
import { collapseObservations } from '../../domain/kernel/observation-collapse';
import type { TimingBaselineIndex, TimingRegression } from '../../application/drift/timing-baseline';
import { detectTimingRegressions, timingBaselineCollapse } from '../../application/drift/timing-baseline';
import type { SelectorHealthIndex, SelectorHealthMetrics } from '../../application/drift/selector-health';
import { flagProblematicSelectors, selectorHealthCollapse } from '../../application/drift/selector-health';
import type { RecoveryEffectivenessIndex, StrategyEffectiveness } from '../../application/drift/recovery-effectiveness';
import { computeRecoveryEfficiency, recoveryEffectivenessCollapse } from '../../application/drift/recovery-effectiveness';
import type { ConsolePatternIndex, ConsolePatternMetrics } from '../../application/drift/console-intelligence';
import { extractConsoleObservations, flagNoisySteps, consoleIntelligenceCollapse } from '../../application/drift/console-intelligence';
import type { CostBaselineIndex, CostBaseline } from '../../application/drift/execution-cost';
import { detectCostAnomalies, computeCostEfficiency, executionCostCollapse } from '../../application/drift/execution-cost';
import type { RungHistoryIndex, RungHistoryEntry } from '../../application/drift/rung-drift';
import { computeRungStability, detectRungDrift, rungDriftCollapse } from '../../application/drift/rung-drift';

// ─── Learning State Types ───

export interface LearningSignals {
  readonly timingRegressionRate: number;
  readonly selectorFlakinessRate: number;
  readonly recoveryEfficiency: number;
  readonly consoleNoiseLevel: number;
  readonly costEfficiency: number;
  readonly rungStability: number;
  readonly componentMaturityRate: number;

  readonly timingRegressions: readonly TimingRegression[];
  readonly flakySelectors: readonly SelectorHealthMetrics[];
  readonly ineffectiveStrategies: readonly StrategyEffectiveness[];
  readonly noisyConsolePatterns: readonly ConsolePatternMetrics[];
  readonly costAnomalies: readonly CostBaseline[];
  readonly driftingIntents: readonly RungHistoryEntry[];
}

export interface LearningState {
  readonly kind: 'learning-state';
  readonly version: 1;
  readonly generatedAt: string;

  readonly timing: TimingBaselineIndex;
  readonly selectors: SelectorHealthIndex;
  readonly recovery: RecoveryEffectivenessIndex;
  readonly console: ConsolePatternIndex;
  readonly cost: CostBaselineIndex;
  readonly rungDrift: RungHistoryIndex;
  readonly componentMaturation: readonly ComponentProposal[];

  readonly signals: LearningSignals;
}

export interface LearningConfig {
  readonly componentMaturityThreshold?: number;
}

export const DEFAULT_LEARNING_CONFIG: LearningConfig = {
  componentMaturityThreshold: 0.6,
};

// ─── Learning Delta Types ───

export interface LearningDeltaDimension {
  readonly name: string;
  readonly previous: number;
  readonly current: number;
  readonly delta: number;
  readonly improved: boolean;
}

export interface LearningDelta {
  readonly kind: 'learning-delta';
  readonly version: 1;
  readonly dimensions: readonly LearningDeltaDimension[];
  readonly overallVelocity: number;
}

// ─── Signal Summary (for fitness/proposal consumption) ───

export interface LearningSignalSummary {
  readonly kind: 'learning-signal-summary';
  readonly version: 1;
  readonly healthScore: number;
  readonly dimensions: readonly {
    readonly name: string;
    readonly value: number;
    readonly status: 'healthy' | 'warning' | 'critical';
  }[];
  readonly actionableCount: number;
}

// ─── Component Evidence Extraction ───

interface ComponentEvidence {
  readonly componentType: string;
  readonly actions: readonly string[];
  readonly successCount: number;
  readonly totalAttempts: number;
}

/**
 * Extract component evidence from step execution receipts.
 * Groups by widgetContract and tallies success/failure.
 */
export function extractComponentEvidence(
  steps: readonly StepExecutionReceipt[],
): readonly ComponentEvidence[] {
  const groups = new Map<string, {
    actions: Set<string>;
    successCount: number;
    totalAttempts: number;
  }>();

  for (const step of steps) {
    const componentType = step.widgetContract ?? 'unknown';
    const existing = groups.get(componentType);
    const succeeded = step.failure.family === 'none';
    const action = step.mode ?? 'interact';

    if (existing) {
      existing.actions.add(action);
      existing.totalAttempts += 1;
      if (succeeded) existing.successCount += 1;
    } else {
      const actions = new Set<string>();
      actions.add(action);
      groups.set(componentType, {
        actions,
        successCount: succeeded ? 1 : 0,
        totalAttempts: 1,
      });
    }
  }

  return [...groups.entries()].map(([componentType, data]) => ({
    componentType,
    actions: [...data.actions].sort(),
    successCount: data.successCount,
    totalAttempts: data.totalAttempts,
  }));
}

// ─── Signal Derivation ───

function deriveSignals(
  steps: readonly StepExecutionReceipt[],
  timing: TimingBaselineIndex,
  selectors: SelectorHealthIndex,
  recovery: RecoveryEffectivenessIndex,
  console: ConsolePatternIndex,
  cost: CostBaselineIndex,
  rungDrift: RungHistoryIndex,
  componentMaturation: readonly ComponentProposal[],
  _config: LearningConfig,
): LearningSignals {
  // Timing regressions
  const timingReport = detectTimingRegressions(steps, timing);
  const timingRegressionRate = timingReport.regressionRate;

  // Selector flakiness
  const flakySelectors = flagProblematicSelectors(selectors);
  const totalSelectors = selectors.selectors.length;
  const selectorFlakinessRate = totalSelectors > 0
    ? flakySelectors.length / totalSelectors
    : 0;

  // Recovery efficiency
  const recoveryEff = computeRecoveryEfficiency(recovery);

  // Console noise
  const consoleObs = extractConsoleObservations(steps);
  const noiseReport = flagNoisySteps(console, consoleObs);
  const consoleNoiseLevel = noiseReport.noiseRate;

  // Cost efficiency
  const costEff = computeCostEfficiency(cost);

  // Cost anomalies
  const costAnomalyReport = detectCostAnomalies(steps, cost);

  // Rung stability
  const rungStab = computeRungStability(rungDrift);

  // Rung drift
  const _rungDriftReport = detectRungDrift(rungDrift);

  // Component maturity
  const totalComponents = new Set(steps.map((s) => s.widgetContract ?? 'unknown')).size;
  const componentMaturityRate = totalComponents > 0
    ? componentMaturation.length / totalComponents
    : 0;

  // Ineffective strategies
  const ineffectiveStrategies = recovery.strategies.filter((s) => s.successRate < 0.5);

  // Noisy console patterns (high failure correlation)
  const noisyConsolePatterns = console.patterns.filter((p) => p.failureCorrelation > 0.5);

  // Cost anomaly baselines (categories with anomalies)
  const anomalyCategories = new Set(costAnomalyReport.anomalies.map((a) => a.category));
  const costAnomalyBaselines = cost.baselines.filter((b) => anomalyCategories.has(b.category));

  // Drifting intents
  const driftingIntents = rungDrift.entries.filter((e) => e.driftDirection === 'degrading');

  return {
    timingRegressionRate,
    selectorFlakinessRate,
    recoveryEfficiency: recoveryEff,
    consoleNoiseLevel,
    costEfficiency: costEff,
    rungStability: rungStab,
    componentMaturityRate: Math.min(componentMaturityRate, 1),

    timingRegressions: timingReport.regressions,
    flakySelectors,
    ineffectiveStrategies,
    noisyConsolePatterns,
    costAnomalies: costAnomalyBaselines,
    driftingIntents,
  };
}

// ─── Main Aggregation ───

/**
 * Aggregate a LearningState from step execution receipts.
 * Composes all pure-function intelligence modules into a single aggregate.
 *
 * Pure function: steps + previous state + config → new state.
 */
export function aggregateLearningState(
  steps: readonly StepExecutionReceipt[],
  previous: LearningState | null,
  config: LearningConfig = DEFAULT_LEARNING_CONFIG,
): LearningState {
  // 1. Run all six observation collapse pipelines over the same receipt stream.
  //    Each pipeline independently extracts, aggregates, and signals — this is
  //    product fold fusion (catamorphism fusion) from the design calculus.
  const { aggregate: timing } = collapseObservations(timingBaselineCollapse, steps, previous?.timing ?? null);
  const { aggregate: selectors } = collapseObservations(selectorHealthCollapse, steps, previous?.selectors ?? null);
  const { aggregate: recovery } = collapseObservations(recoveryEffectivenessCollapse, steps, previous?.recovery ?? null);
  const { aggregate: consoleIndex } = collapseObservations(consoleIntelligenceCollapse, steps, previous?.console ?? null);
  const { aggregate: costIndex } = collapseObservations(executionCostCollapse, steps, previous?.cost ?? null);
  const { aggregate: rungDriftIndex } = collapseObservations(rungDriftCollapse, steps, previous?.rungDrift ?? null);

  const componentEvidence = extractComponentEvidence(steps);
  const componentProposals = matureComponentKnowledge(componentEvidence);

  // 2. Derive aggregate signals
  const signals = deriveSignals(
    steps,
    timing,
    selectors,
    recovery,
    consoleIndex,
    costIndex,
    rungDriftIndex,
    componentProposals,
    config,
  );

  return {
    kind: 'learning-state',
    version: 1,
    generatedAt: new Date().toISOString(),
    timing,
    selectors,
    recovery,
    console: consoleIndex,
    cost: costIndex,
    rungDrift: rungDriftIndex,
    componentMaturation: componentProposals,
    signals,
  };
}

// ─── Delta Computation ───

function makeDimension(
  name: string,
  previous: number,
  current: number,
  higherIsBetter: boolean,
): LearningDeltaDimension {
  const delta = current - previous;
  return {
    name,
    previous,
    current,
    delta,
    improved: higherIsBetter ? delta > 0 : delta < 0,
  };
}

/**
 * Compute the delta between two learning states.
 * Tracks which dimensions improved, degraded, or stayed stable.
 *
 * Pure function: two states → delta.
 */
export function computeLearningDelta(
  previous: LearningState,
  current: LearningState,
): LearningDelta {
  const dimensions: LearningDeltaDimension[] = [
    makeDimension('timingRegressionRate', previous.signals.timingRegressionRate, current.signals.timingRegressionRate, false),
    makeDimension('selectorFlakinessRate', previous.signals.selectorFlakinessRate, current.signals.selectorFlakinessRate, false),
    makeDimension('recoveryEfficiency', previous.signals.recoveryEfficiency, current.signals.recoveryEfficiency, true),
    makeDimension('consoleNoiseLevel', previous.signals.consoleNoiseLevel, current.signals.consoleNoiseLevel, false),
    makeDimension('costEfficiency', previous.signals.costEfficiency, current.signals.costEfficiency, true),
    makeDimension('rungStability', previous.signals.rungStability, current.signals.rungStability, true),
    makeDimension('componentMaturityRate', previous.signals.componentMaturityRate, current.signals.componentMaturityRate, true),
  ];

  const improvedCount = dimensions.filter((d) => d.improved).length;
  const overallVelocity = dimensions.length > 0
    ? improvedCount / dimensions.length
    : 0;

  return {
    kind: 'learning-delta',
    version: 1,
    dimensions,
    overallVelocity,
  };
}

// ─── Signal Summary ───

function dimensionStatus(value: number, higherIsBetter: boolean): 'healthy' | 'warning' | 'critical' {
  const effective = higherIsBetter ? value : 1 - value;
  if (effective >= 0.8) return 'healthy';
  if (effective >= 0.5) return 'warning';
  return 'critical';
}

/**
 * Produce a concise signal summary consumable by fitness/proposal systems.
 *
 * Pure function: learning state → summary.
 */
export function summarizeLearningSignals(
  state: LearningState,
): LearningSignalSummary {
  const dims = [
    { name: 'timingRegressionRate', value: state.signals.timingRegressionRate, higherIsBetter: false },
    { name: 'selectorFlakinessRate', value: state.signals.selectorFlakinessRate, higherIsBetter: false },
    { name: 'recoveryEfficiency', value: state.signals.recoveryEfficiency, higherIsBetter: true },
    { name: 'consoleNoiseLevel', value: state.signals.consoleNoiseLevel, higherIsBetter: false },
    { name: 'costEfficiency', value: state.signals.costEfficiency, higherIsBetter: true },
    { name: 'rungStability', value: state.signals.rungStability, higherIsBetter: true },
    { name: 'componentMaturityRate', value: state.signals.componentMaturityRate, higherIsBetter: true },
  ];

  const dimensions = dims.map((d) => ({
    name: d.name,
    value: d.value,
    status: dimensionStatus(d.value, d.higherIsBetter),
  }));

  const healthyCount = dimensions.filter((d) => d.status === 'healthy').length;
  const healthScore = dimensions.length > 0 ? healthyCount / dimensions.length : 1;

  const actionableCount =
    state.signals.timingRegressions.length +
    state.signals.flakySelectors.length +
    state.signals.ineffectiveStrategies.length +
    state.signals.noisyConsolePatterns.length +
    state.signals.costAnomalies.length +
    state.signals.driftingIntents.length;

  return {
    kind: 'learning-signal-summary',
    version: 1,
    healthScore,
    dimensions,
    actionableCount,
  };
}

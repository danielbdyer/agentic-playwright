/**
 * Console Error Intelligence — analyzes browser console messages captured
 * by the console sentinel during step execution.
 *
 * Console messages are captured per-step into ExecutionObservation.consoleMessages
 * but never analyzed. This module closes that feedback loop by:
 * - Normalizing console messages into patterns (strip URLs, line numbers)
 * - Aggregating pattern frequency and affected steps
 * - Correlating console patterns with step failure rates
 * - Flagging noisy steps that produce excessive distinct errors
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { StepExecutionReceipt } from '../../domain/types';

// ─── Types ───

export interface ConsoleObservation {
  readonly stepRef: string;
  readonly level: 'warn' | 'error' | 'log' | 'info' | 'debug';
  readonly normalizedPattern: string;
  readonly rawText: string;
  readonly stepSucceeded: boolean;
}

export interface ConsolePatternMetrics {
  readonly pattern: string;
  readonly occurrences: number;
  readonly affectedSteps: number;
  readonly failureCorrelation: number;
  readonly firstSeen: string;
  readonly lastSeen: string;
}

export interface ConsolePatternIndex {
  readonly patterns: readonly ConsolePatternMetrics[];
}

export interface ConsoleFailureCorrelation {
  readonly pattern: string;
  readonly stepsWithPattern: number;
  readonly failedStepsWithPattern: number;
  readonly correlation: number;
}

export interface ConsoleNoiseReport {
  readonly noisySteps: readonly NoisyStep[];
  readonly noiseRate: number;
}

export interface NoisyStep {
  readonly stepRef: string;
  readonly distinctPatterns: number;
  readonly totalMessages: number;
}

export interface ConsoleIntelligenceConfig {
  readonly noiseThreshold: number;
}

export const DEFAULT_CONSOLE_INTELLIGENCE_CONFIG: ConsoleIntelligenceConfig = {
  noiseThreshold: 5,
};

// ─── Pattern normalization ───

/**
 * Normalize a console message text into a stable pattern by stripping:
 * - URLs (http://..., https://..., file://...)
 * - Line/column numbers (e.g., :123:45)
 * - Hex addresses (0x1a2b3c)
 * - Timestamps in common formats
 * - Leading/trailing whitespace
 */
export function normalizeConsolePattern(text: string): string {
  return text
    .replace(/https?:\/\/[^\s)]+/g, '<URL>')
    .replace(/file:\/\/[^\s)]+/g, '<URL>')
    .replace(/:\d+:\d+/g, ':<LINE>:<COL>')
    .replace(/0x[0-9a-fA-F]+/g, '<HEX>')
    .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}[.\d]*/g, '<TIMESTAMP>')
    .trim();
}

// ─── Extraction ───

/**
 * Extract console observations from step execution receipts.
 * Only includes steps that have console messages.
 */
export function extractConsoleObservations(
  steps: readonly StepExecutionReceipt[],
): readonly ConsoleObservation[] {
  return steps.flatMap((step) => {
    const messages = step.execution.consoleMessages ?? [];
    if (messages.length === 0) return [];

    const succeeded = step.failure.family === 'none';
    const stepRef = `step-${step.stepIndex}`;

    return messages.map((msg) => ({
      stepRef,
      level: msg.level,
      normalizedPattern: normalizeConsolePattern(msg.text),
      rawText: msg.text,
      stepSucceeded: succeeded,
    }));
  });
}

// ─── Aggregation ───

/**
 * Aggregate console observations into pattern metrics.
 * Groups by normalized pattern, computes frequency and failure correlation.
 */
export function aggregateConsolePatterns(
  observations: readonly ConsoleObservation[],
): ConsolePatternIndex {
  if (observations.length === 0) {
    return { patterns: [] };
  }

  const patternMap = new Map<string, {
    occurrences: number;
    steps: Set<string>;
    failedSteps: Set<string>;
    timestamps: string[];
  }>();

  for (const obs of observations) {
    const existing = patternMap.get(obs.normalizedPattern);
    if (existing) {
      existing.occurrences += 1;
      existing.steps.add(obs.stepRef);
      if (!obs.stepSucceeded) {
        existing.failedSteps.add(obs.stepRef);
      }
    } else {
      const steps = new Set<string>();
      steps.add(obs.stepRef);
      const failedSteps = new Set<string>();
      if (!obs.stepSucceeded) {
        failedSteps.add(obs.stepRef);
      }
      patternMap.set(obs.normalizedPattern, {
        occurrences: 1,
        steps,
        failedSteps,
        timestamps: [],
      });
    }
  }

  // Cap output to top 200 patterns by occurrence — prevents unbounded growth
  // when console output is highly diverse (e.g., timestamps in messages).
  const MAX_PATTERNS = 200;
  const patterns: ConsolePatternMetrics[] = [...patternMap.entries()]
    .map(([pattern, data]) => ({
      pattern,
      occurrences: data.occurrences,
      affectedSteps: data.steps.size,
      failureCorrelation: data.steps.size > 0
        ? data.failedSteps.size / data.steps.size
        : 0,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString(),
    }))
    .sort((a, b) => b.occurrences - a.occurrences)
    .slice(0, MAX_PATTERNS);

  return { patterns };
}

// ─── Failure correlation ───

/**
 * For each console pattern, compute what fraction of steps producing
 * that pattern also failed. High correlation suggests a causal link.
 */
export function correlateConsoleWithFailures(
  observations: readonly ConsoleObservation[],
): readonly ConsoleFailureCorrelation[] {
  const patternGroups = new Map<string, {
    steps: Set<string>;
    failedSteps: Set<string>;
  }>();

  for (const obs of observations) {
    const existing = patternGroups.get(obs.normalizedPattern);
    if (existing) {
      existing.steps.add(obs.stepRef);
      if (!obs.stepSucceeded) {
        existing.failedSteps.add(obs.stepRef);
      }
    } else {
      const steps = new Set<string>();
      steps.add(obs.stepRef);
      const failedSteps = new Set<string>();
      if (!obs.stepSucceeded) {
        failedSteps.add(obs.stepRef);
      }
      patternGroups.set(obs.normalizedPattern, { steps, failedSteps });
    }
  }

  return [...patternGroups.entries()]
    .map(([pattern, data]) => ({
      pattern,
      stepsWithPattern: data.steps.size,
      failedStepsWithPattern: data.failedSteps.size,
      correlation: data.steps.size > 0
        ? data.failedSteps.size / data.steps.size
        : 0,
    }))
    .sort((a, b) => b.correlation - a.correlation);
}

// ─── Noise detection ───

/**
 * Compute the maximum failure correlation across all console patterns.
 * Returns [0, 1] where 0 = no correlation, 1 = perfect correlation.
 * Used as the scalar signal for the ObservationCollapse instance.
 */
export function computeMaxFailureCorrelation(
  index: ConsolePatternIndex,
): number {
  if (index.patterns.length === 0) return 0;
  return Math.max(...index.patterns.map((p) => p.failureCorrelation));
}

/**
 * Flag steps that produce more than `threshold` distinct console error patterns.
 * These steps are "noisy" and may indicate systemic issues.
 */
export function flagNoisySteps(
  index: ConsolePatternIndex,
  observations: readonly ConsoleObservation[],
  config: ConsoleIntelligenceConfig = DEFAULT_CONSOLE_INTELLIGENCE_CONFIG,
): ConsoleNoiseReport {
  const stepPatternCounts = new Map<string, { patterns: Set<string>; total: number }>();

  for (const obs of observations) {
    const existing = stepPatternCounts.get(obs.stepRef);
    if (existing) {
      existing.patterns.add(obs.normalizedPattern);
      existing.total += 1;
    } else {
      const patterns = new Set<string>();
      patterns.add(obs.normalizedPattern);
      stepPatternCounts.set(obs.stepRef, { patterns, total: 1 });
    }
  }

  const noisySteps: NoisyStep[] = [...stepPatternCounts.entries()]
    .filter(([, data]) => data.patterns.size > config.noiseThreshold)
    .map(([stepRef, data]) => ({
      stepRef,
      distinctPatterns: data.patterns.size,
      totalMessages: data.total,
    }))
    .sort((a, b) => b.distinctPatterns - a.distinctPatterns);

  const totalSteps = stepPatternCounts.size;
  return {
    noisySteps,
    noiseRate: totalSteps > 0 ? noisySteps.length / totalSteps : 0,
  };
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Console intelligence as ObservationCollapse<R,O,A,S>:
//   extract: StepExecutionReceipt → ConsoleObservation
//   aggregate: ConsoleObservation → ConsolePatternIndex
//   signal: ConsolePatternIndex → number (max failure correlation)
//
// Note: flagNoisySteps has shape (A, O[], Config) → S, which is
// an "Observation-Aggregate-Compare" variant that needs both the
// aggregate AND the original observations. The scalar signal here
// uses the simpler A → S shape via max failure correlation.

import type { ObservationCollapse } from '../../domain/kernel/observation-collapse';

export const consoleIntelligenceCollapse: ObservationCollapse<
  StepExecutionReceipt,
  ConsoleObservation,
  ConsolePatternIndex,
  number
> = {
  extract: extractConsoleObservations,
  aggregate: (observations, _prior) => aggregateConsolePatterns(observations),
  signal: computeMaxFailureCorrelation,
};

/**
 * Interpretation Coherence — unifies three separate tracking systems
 * for element understanding stability into a single coherence view.
 *
 * Today these concepts are tracked independently:
 * - InterpretationDriftRecord (how interpretation changed between runs)
 * - RungDriftReport (resolution rung degradation over time)
 * - ResolutionReceipt (what the runtime interpreted per step)
 *
 * All three answer the same underlying question:
 * "Is the system's understanding of this element stable?"
 *
 * Nobody asks:
 * - Is interpretation drift explaining rung drift?
 * - Which intents have the most interpretation variance?
 * - Are elements with rung drift also showing interpretation changes?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { RungHistoryEntry, RungHistoryIndex } from './rung-drift';
import type { InterpretationDriftRecord } from '../domain/types';

// ─── Types ───

export interface IntentCoherenceProfile {
  readonly intentRef: string;
  readonly rungDriftDirection: 'improving' | 'stable' | 'degrading';
  readonly rungVariance: number;
  readonly interpretationChangeCount: number;
  readonly isCoherent: boolean;
  readonly coherenceScore: number;
}

export interface CoherenceCorrelation {
  readonly pattern: string;
  readonly description: string;
  readonly affectedIntents: readonly string[];
  readonly strength: number;
}

export interface InterpretationCoherenceReport {
  readonly kind: 'interpretation-coherence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly profiles: readonly IntentCoherenceProfile[];
  readonly correlations: readonly CoherenceCorrelation[];

  readonly overallCoherenceScore: number;
  readonly driftExplainedByRungChange: number;
  readonly incoherentIntentCount: number;
}

// ─── Rung variance ───

/**
 * Compute the variance of a rung history.
 * Higher variance = less stable resolution.
 */
function rungVariance(history: readonly number[]): number {
  if (history.length <= 1) return 0;
  const mean = history.reduce((sum, v) => sum + v, 0) / history.length;
  const sumSquares = history.reduce((sum, v) => sum + (v - mean) ** 2, 0);
  return sumSquares / history.length;
}

// ─── Profile computation ───

/**
 * Build per-intent coherence profiles by joining rung drift data
 * with interpretation drift records.
 */
function computeProfiles(
  rungIndex: RungHistoryIndex,
  driftRecords: readonly InterpretationDriftRecord[],
): readonly IntentCoherenceProfile[] {
  // Build a map of intent → interpretation change count from drift records
  const changeCountByIntent = new Map<string, number>();
  for (const record of driftRecords) {
    for (const step of record.steps) {
      if (step.changed) {
        // Use the before.target as a rough intent ref
        const intentRef = step.before?.target ?? `step-${step.stepIndex}`;
        const count = changeCountByIntent.get(intentRef) ?? 0;
        changeCountByIntent.set(intentRef, count + 1);
      }
    }
  }

  // For each rung history entry, compute coherence
  return rungIndex.entries.map((entry) => {
    const variance = rungVariance(entry.rungHistory);
    const changeCount = changeCountByIntent.get(entry.intentRef) ?? 0;

    // Coherence score: penalize rung variance and interpretation changes
    const rungStability = 1 / (1 + variance);
    const interpretationStability = 1 / (1 + changeCount);
    const coherenceScore = rungStability * 0.6 + interpretationStability * 0.4;

    const isCoherent = entry.driftDirection !== 'degrading' && changeCount === 0;

    return {
      intentRef: entry.intentRef,
      rungDriftDirection: entry.driftDirection,
      rungVariance: variance,
      interpretationChangeCount: changeCount,
      isCoherent,
      coherenceScore,
    };
  });
}

// ─── Correlation detection ───

/**
 * Detect correlations between rung drift and interpretation drift.
 */
function detectCorrelations(
  profiles: readonly IntentCoherenceProfile[],
): readonly CoherenceCorrelation[] {
  const correlations: CoherenceCorrelation[] = [];

  // Pattern 1: Rung degradation + interpretation changes
  const degradingWithChanges = profiles.filter(
    (p) => p.rungDriftDirection === 'degrading' && p.interpretationChangeCount > 0,
  );
  if (degradingWithChanges.length > 0) {
    correlations.push({
      pattern: 'rung-drift-explains-interpretation-change',
      description: 'Intents with rung degradation also show interpretation changes — rung drift may explain interpretation instability',
      affectedIntents: degradingWithChanges.map((p) => p.intentRef),
      strength: profiles.length > 0
        ? degradingWithChanges.length / profiles.length
        : 0,
    });
  }

  // Pattern 2: High rung variance without interpretation changes
  const highVarianceStable = profiles.filter(
    (p) => p.rungVariance > 1 && p.interpretationChangeCount === 0,
  );
  if (highVarianceStable.length > 0) {
    correlations.push({
      pattern: 'rung-variance-without-interpretation-change',
      description: 'Intents with high rung variance but no interpretation changes — resolution is unstable but still converging to the same target',
      affectedIntents: highVarianceStable.map((p) => p.intentRef),
      strength: profiles.length > 0
        ? highVarianceStable.length / profiles.length
        : 0,
    });
  }

  // Pattern 3: Interpretation changes without rung drift
  const changesWithoutDrift = profiles.filter(
    (p) => p.interpretationChangeCount > 0 && p.rungDriftDirection !== 'degrading',
  );
  if (changesWithoutDrift.length > 0) {
    correlations.push({
      pattern: 'interpretation-change-without-rung-drift',
      description: 'Intents with interpretation changes but stable or improving rung — interpretation is changing at the same resolution level',
      affectedIntents: changesWithoutDrift.map((p) => p.intentRef),
      strength: profiles.length > 0
        ? changesWithoutDrift.length / profiles.length
        : 0,
    });
  }

  return correlations.sort((a, b) => b.strength - a.strength);
}

// ─── Main orchestration ───

export interface InterpretationCoherenceInput {
  readonly rungIndex: RungHistoryIndex;
  readonly driftRecords: readonly InterpretationDriftRecord[];
  readonly generatedAt?: string;
}

/**
 * Unify rung drift + interpretation drift into a coherence report.
 *
 * Pure function: rung index + drift records → coherence report.
 */
export function buildInterpretationCoherence(
  input: InterpretationCoherenceInput,
): InterpretationCoherenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Compute per-intent profiles
  const profiles = computeProfiles(input.rungIndex, input.driftRecords);

  // 2. Detect correlations
  const correlations = detectCorrelations(profiles);

  // 3. Aggregate scores
  const overallCoherenceScore = profiles.length > 0
    ? profiles.reduce((sum, p) => sum + p.coherenceScore, 0) / profiles.length
    : 1;

  // How much of interpretation drift is explained by rung changes?
  const degradingWithChanges = profiles.filter(
    (p) => p.rungDriftDirection === 'degrading' && p.interpretationChangeCount > 0,
  ).length;
  const totalWithChanges = profiles.filter(
    (p) => p.interpretationChangeCount > 0,
  ).length;
  const driftExplainedByRungChange = totalWithChanges > 0
    ? degradingWithChanges / totalWithChanges
    : 0;

  const incoherentIntentCount = profiles.filter((p) => !p.isCoherent).length;

  return {
    kind: 'interpretation-coherence-report',
    version: 1,
    generatedAt,
    profiles,
    correlations,
    overallCoherenceScore,
    driftExplainedByRungChange,
    incoherentIntentCount,
  };
}

/**
 * Extract the most incoherent intents, sorted by coherence score ascending.
 */
export function extractIncoherentIntents(
  report: InterpretationCoherenceReport,
  n: number = 10,
): readonly IntentCoherenceProfile[] {
  return [...report.profiles]
    .filter((p) => !p.isCoherent)
    .sort((a, b) => a.coherenceScore - b.coherenceScore)
    .slice(0, n);
}

// ─── ObservationCollapse instance ──────────────────────────────────────────
//
// Interpretation coherence as ObservationCollapse<R,O,A,S>:
//   R = InterpretationCoherenceInput (rung index + drift records)
//   O = IntentCoherenceProfile (per-intent coherence)
//   A = InterpretationCoherenceReport (the aggregate report)
//   S = number (overall coherence score)

import type { ObservationCollapse } from '../domain/kernel/observation-collapse';

export const interpretationCoherenceCollapse: ObservationCollapse<
  InterpretationCoherenceInput,
  IntentCoherenceProfile,
  InterpretationCoherenceReport,
  number
> = {
  extract: (inputs) =>
    inputs.flatMap((input) => computeProfiles(input.rungIndex, input.driftRecords)),
  aggregate: (profiles, _prior) => {
    const correlations = detectCorrelations(profiles);
    const overallCoherenceScore = profiles.length > 0
      ? profiles.reduce((sum, p) => sum + p.coherenceScore, 0) / profiles.length
      : 1;
    const degradingWithChanges = profiles.filter(
      (p) => p.rungDriftDirection === 'degrading' && p.interpretationChangeCount > 0,
    ).length;
    const totalWithChanges = profiles.filter(
      (p) => p.interpretationChangeCount > 0,
    ).length;

    return {
      kind: 'interpretation-coherence-report',
      version: 1,
      generatedAt: new Date().toISOString(),
      profiles,
      correlations,
      overallCoherenceScore,
      driftExplainedByRungChange: totalWithChanges > 0 ? degradingWithChanges / totalWithChanges : 0,
      incoherentIntentCount: profiles.filter((p) => !p.isCoherent).length,
    };
  },
  signal: (report) => report.overallCoherenceScore,
};

/**
 * Pipeline Fitness Report emission and Scorecard comparison.
 *
 * After a clean-slate flywheel run, this module classifies step-level
 * resolution outcomes into pipeline failure modes and computes aggregate
 * metrics. The fitness report is the "gradient" of the self-improving loop;
 * the scorecard comparison is the "beat-the-mark" gate.
 */

import { TesseractError } from '../domain/kernel/errors';
import type {
  ExperimentRecord,
  ImprovementLoopLedger,
  PipelineFailureClass,
  PipelineFailureMode,
  PipelineFitnessMetrics,
  PipelineFitnessReport,
  PipelineImprovementTarget,
  PipelineScorecard,
  RungRate,
  ScorecardHighWaterMark,
  ScorecardHistoryEntry,
  ScoringEffectiveness,
  StepWinningSource,
  ResolutionReceipt,
  ProposalBundle,
  StepExecutionReceipt,
} from '../domain/types';
import {
  isAcceptedByParetoFrontier,
  addToParetoFrontier,
  objectivesFromMetrics,
} from '../domain/types';
import { foldPipelineFailureClass } from '../domain/kernel/visitors';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../domain/resolution/precedence';
import type { BottleneckWeightCorrelation, GeneralizationMetrics } from '../domain/types';

// ─── Step-level classification ───

interface StepOutcome {
  readonly intent: string;
  readonly winningSource: StepWinningSource;
  readonly provenanceKind: string;
  readonly translationMatched: boolean;
  readonly translationScore: number | null;
  readonly translationFailureClass: string | null;
  readonly degraded: boolean;
  readonly recoveryAttempts: number;
  readonly recoverySucceeded: boolean;
  readonly proposalCount: number;
  readonly proposalBlocked: number;
}

function classifyFailure(step: StepOutcome): PipelineFailureClass | null {
  // Translation scored below threshold but had a near-miss candidate
  if (!step.translationMatched && step.translationScore !== null && step.translationScore > 0.15 && step.translationScore < 0.34) {
    return 'translation-threshold-miss';
  }

  // Translation found no candidates at all — normalization or alias gap
  if (!step.translationMatched && (step.translationScore === null || step.translationScore === 0)) {
    return step.winningSource === 'none'
      ? 'alias-coverage-gap'
      : 'translation-normalization-gap';
  }

  // Recovery was attempted but failed
  if (step.recoveryAttempts > 0 && !step.recoverySucceeded) {
    return 'recovery-strategy-miss';
  }

  // Proposals were generated but blocked by trust policy
  if (step.proposalBlocked > 0 && step.proposalCount === step.proposalBlocked) {
    return 'trust-policy-over-block';
  }

  // Winning source was a lower-precedence rung when a higher one could have worked
  if (step.winningSource === 'live-dom' || step.winningSource === 'structured-translation') {
    return 'resolution-rung-skip';
  }

  return null;
}

function improvementTargetFor(failureClass: PipelineFailureClass): PipelineImprovementTarget {
  return foldPipelineFailureClass<PipelineImprovementTarget>(failureClass, {
    translationThresholdMiss: () => ({ kind: 'translation', detail: 'Adjust overlap score threshold or improve scoring formula' }),
    translationNormalizationGap: () => ({ kind: 'translation', detail: 'Add normalization rules for unrecognized phrasing patterns' }),
    aliasCoverageGap: () => ({ kind: 'resolution', detail: 'Improve alias generation heuristics for predictable patterns' }),
    resolutionRungSkip: () => ({ kind: 'resolution', detail: 'Strengthen higher-precedence rungs to resolve before fallback' }),
    scoringWeightMismatch: () => ({ kind: 'scoring', detail: 'Re-weight bottleneck scoring signals based on observed correlations' }),
    recoveryStrategyMiss: () => ({ kind: 'recovery', detail: 'Reorder or add recovery strategies for unhandled failure families' }),
    convergenceStall: () => ({ kind: 'scoring', detail: 'Improve proposal ranking to prioritize high-yield proposals' }),
    trustPolicyOverBlock: () => ({ kind: 'trust-policy', detail: 'Lower confidence thresholds or widen evidence requirements' }),
  });
}

// ─── Extraction from improvement-loop ledger + run records ───

interface RunStepData {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface FitnessInputData {
  readonly pipelineVersion: string;
  readonly ledger: ImprovementLoopLedger<string>;
  readonly runSteps: readonly RunStepData[];
  readonly proposalBundles: readonly ProposalBundle[];
  readonly experimentHistory?: readonly ExperimentRecord[] | undefined;
}

function extractStepOutcomes(data: FitnessInputData): readonly StepOutcome[] {
  return data.runSteps.map((step) => {
    const interp = step.interpretation;
    const exec = step.execution;
    const translation = interp.translation ?? null;

    return {
      intent: `step-${interp.stepIndex}`,
      winningSource: interp.winningSource,
      provenanceKind: interp.provenanceKind,
      translationMatched: translation?.matched ?? false,
      translationScore: translation?.selected?.score ?? (translation?.candidates?.[0]?.score ?? null),
      translationFailureClass: translation?.failureClass ?? null,
      degraded: exec.degraded,
      recoveryAttempts: exec.recovery.attempts.length,
      recoverySucceeded: exec.recovery.attempts.some((a) => a.result === 'recovered'),
      proposalCount: interp.proposalDrafts.length,
      proposalBlocked: 0, // computed from bundles below
    };
  });
}

function computeRungRates(steps: readonly StepOutcome[]): readonly RungRate[] {
  const total = steps.length;
  if (total === 0) return [];

  const sourceToRung: Readonly<Record<string, ResolutionPrecedenceRung>> = {
    'scenario-explicit': 'explicit',
    'resolution-control': 'control',
    'approved-knowledge': 'approved-screen-knowledge',
    'knowledge-hint': 'approved-screen-knowledge',
    'shared-patterns': 'shared-patterns',
    'prior-evidence': 'prior-evidence',
    'approved-equivalent': 'approved-equivalent-overlay',
    'structured-translation': 'structured-translation',
    'live-dom': 'live-dom',
    'agent-interpreted': 'agent-interpreted',
    'none': 'needs-human',
  };

  const wins = new Map<ResolutionPrecedenceRung, number>();
  for (const step of steps) {
    const rung = sourceToRung[step.winningSource] ?? 'needs-human';
    wins.set(rung, (wins.get(rung) ?? 0) + 1);
  }

  return resolutionPrecedenceLaw.map((rung) => ({
    rung,
    wins: wins.get(rung) ?? 0,
    rate: round4((wins.get(rung) ?? 0) / total),
  }));
}

function round4(value: number): number {
  return Number(value.toFixed(4));
}

// ─── Bottleneck Correlation Computation ───
//
// For each bottleneck signal, across consecutive experiment pairs within
// the same substrate: if signal S was the top failure mode in experiment N,
// correlation(S) = average hitRateDelta across all pairs where S was top.
//
// This replaces the placeholder zeros and makes bottleneck weights
// self-calibrating: signals that actually predict improvement get higher
// correlations, enabling the knob search to prioritize them.

const BOTTLENECK_SIGNALS = [
  { signal: 'repair-recovery-hotspot', weight: 0.3 },
  { signal: 'translation-fallback-dominant', weight: 0.25 },
  { signal: 'high-unresolved-rate', weight: 0.25 },
  { signal: 'thin-screen-coverage', weight: 0.2 },
] as const;

// Maps failure classes to the bottleneck signal they most closely represent
const FAILURE_TO_SIGNAL: Readonly<Record<string, string>> = {
  'recovery-strategy-miss': 'repair-recovery-hotspot',
  'translation-threshold-miss': 'translation-fallback-dominant',
  'translation-normalization-gap': 'translation-fallback-dominant',
  'alias-coverage-gap': 'high-unresolved-rate',
  'resolution-rung-skip': 'thin-screen-coverage',
  'convergence-stall': 'thin-screen-coverage',
  'trust-policy-over-block': 'thin-screen-coverage',
  'scoring-weight-mismatch': 'repair-recovery-hotspot',
};

function computeBottleneckCorrelations(
  experiments: readonly ExperimentRecord[],
): readonly BottleneckWeightCorrelation[] {
  if (experiments.length < 2) {
    return BOTTLENECK_SIGNALS.map(({ signal, weight }) => ({
      signal,
      weight,
      correlationWithImprovement: 0,
    }));
  }

  // Group by substrate for within-substrate correlation
  const bySubstrate = experiments.reduce<ReadonlyMap<string, readonly ExperimentRecord[]>>(
    (map, exp) => {
      const key = exp.substrateContext.substrate;
      return new Map([...map, [key, [...(map.get(key) ?? []), exp]]]);
    },
    new Map(),
  );

  // Collect delta signals from consecutive experiment pairs within each substrate
  const signalDeltas = [...bySubstrate.values()].flatMap((subExps) => {
    const sorted = [...subExps].sort((a, b) => a.runAt.localeCompare(b.runAt));
    return sorted.slice(0, -1).flatMap((current, i) => {
      const next = sorted[i + 1]!;
      const topFailure = current.fitnessReport.failureModes[0];
      if (!topFailure) return [];
      const signal = FAILURE_TO_SIGNAL[topFailure.class];
      if (!signal) return [];
      const delta = next.fitnessReport.metrics.knowledgeHitRate - current.fitnessReport.metrics.knowledgeHitRate;
      return [{ signal, delta }];
    });
  });

  const deltasBySignal = signalDeltas.reduce<ReadonlyMap<string, readonly number[]>>(
    (map, { signal, delta }) => new Map([...map, [signal, [...(map.get(signal) ?? []), delta]]]),
    new Map(),
  );

  return BOTTLENECK_SIGNALS.map(({ signal, weight }) => {
    const deltas = deltasBySignal.get(signal) ?? [];
    const correlation = deltas.length > 0
      ? round4(deltas.reduce((sum, d) => sum + d, 0) / deltas.length)
      : 0;
    return { signal, weight, correlationWithImprovement: correlation };
  });
}

// ─── Partial (per-iteration) fitness metrics ───

/**
 * Input for lightweight per-iteration fitness estimation.
 * Uses the same step data shape as the full fitness report but skips
 * failure classification, scoring effectiveness, and convergence analysis.
 */
export interface PartialFitnessInput {
  readonly runSteps: readonly RunStepData[];
}

/**
 * Lightweight fitness metrics computed per dogfood iteration.
 *
 * This is a subset of the full fitness report — it computes
 * resolution-by-rung breakdown and basic hit/degraded rates without
 * failure classification or scoring effectiveness (which need the
 * full run set across all iterations).
 *
 * Use case: "iteration 2 moved 12% of steps from needs-human to
 * approved-equivalent-overlay" — exactly the signal needed to decide
 * whether to keep iterating.
 */
export interface PartialFitnessMetrics {
  readonly resolutionByRung: readonly RungRate[];
  readonly knowledgeHitRate: number;
  readonly degradedLocatorRate: number;
  readonly totalSteps: number;
}

export function buildPartialFitnessMetrics(input: PartialFitnessInput): PartialFitnessMetrics {
  const steps = extractStepOutcomes({ ...input, pipelineVersion: '', ledger: { iterations: [], completedIterations: 0, maxIterations: 0, converged: false, convergenceReason: null, kind: 'improvement-loop-ledger', version: 1, totalProposalsActivated: 0, totalInstructionCount: 0, knowledgeHitRateDelta: 0 }, proposalBundles: [] });
  const totalSteps = steps.length;
  const approvedKnowledge = steps.filter((s) => s.provenanceKind === 'approved-knowledge').length;

  return {
    resolutionByRung: computeRungRates(steps),
    knowledgeHitRate: totalSteps > 0 ? round4(approvedKnowledge / totalSteps) : 0,
    degradedLocatorRate: totalSteps > 0 ? round4(steps.filter((s) => s.degraded).length / totalSteps) : 0,
    totalSteps,
  };
}

// ─── Fitness report builder ───

export function buildFitnessReport(data: FitnessInputData): PipelineFitnessReport {
  const steps = extractStepOutcomes(data);
  const totalSteps = steps.length;

  // Aggregate blocked proposals from bundles
  const totalProposalBlocked = data.proposalBundles.reduce(
    (sum, bundle) => sum + bundle.proposals.filter((p) => p.activation.status === 'blocked').length,
    0,
  );
  const totalProposals = data.proposalBundles.reduce(
    (sum, bundle) => sum + bundle.proposals.length,
    0,
  );

  // Classify failures
  const failureMap = steps.reduce<ReadonlyMap<PipelineFailureClass, { readonly count: number; readonly affectedSteps: number; readonly intents: readonly string[] }>>(
    (map, step) => {
      const failureClass = classifyFailure(step);
      if (failureClass === null) return map;
      const existing = map.get(failureClass) ?? { count: 0, affectedSteps: 0, intents: [] };
      return new Map([...map, [failureClass, {
        count: existing.count + 1,
        affectedSteps: existing.affectedSteps + 1,
        intents: existing.intents.length < 5 ? [...existing.intents, step.intent] : existing.intents,
      }]]);
    },
    new Map(),
  );

  // Check for convergence stall before building failure modes
  const ledgerIterations = data.ledger.iterations;
  const convergenceStalled = ledgerIterations.length >= 2
    && (() => {
      const last = ledgerIterations[ledgerIterations.length - 1]!;
      const prev = ledgerIterations[ledgerIterations.length - 2]!;
      return last.proposalsActivated > 0 && last.knowledgeHitRate <= prev.knowledgeHitRate;
    })();

  const finalFailureMap = (convergenceStalled && !failureMap.has('convergence-stall'))
    ? new Map([...failureMap, ['convergence-stall' as PipelineFailureClass, {
        count: 1,
        affectedSteps: ledgerIterations[ledgerIterations.length - 1]!.totalStepCount,
        intents: ['convergence stalled: proposals generated but no hit rate improvement'] as readonly string[],
      }]])
    : failureMap;

  const failureModes: readonly PipelineFailureMode[] = [...finalFailureMap.entries()]
    .sort(([, a], [, b]) => b.count - a.count)
    .map(([cls, info]) => ({
      class: cls,
      count: info.count,
      affectedSteps: info.affectedSteps,
      exampleIntents: info.intents,
      improvementTarget: improvementTargetFor(cls),
    }));

  // Compute metrics
  const translationAttempted = steps.filter((s) => s.translationScore !== null);
  const translationSucceeded = translationAttempted.filter((s) => s.translationMatched);
  const translationRelevant = steps.filter((s) =>
    s.winningSource === 'structured-translation' || s.translationMatched,
  );

  const recoveryAttempted = steps.filter((s) => s.recoveryAttempts > 0);
  const recoverySuccessRate = recoveryAttempted.length > 0
    ? round4(recoveryAttempted.filter((s) => s.recoverySucceeded).length / recoveryAttempted.length)
    : 1;

  const metrics: PipelineFitnessMetrics = {
    knowledgeHitRate: data.ledger.iterations.length > 0
      ? data.ledger.iterations[data.ledger.iterations.length - 1]!.knowledgeHitRate
      : 0,
    translationPrecision: translationAttempted.length > 0
      ? round4(translationSucceeded.length / translationAttempted.length)
      : 1,
    translationRecall: totalSteps > 0
      ? round4(translationRelevant.length / totalSteps)
      : 0,
    convergenceVelocity: data.ledger.completedIterations,
    proposalYield: totalProposals > 0
      ? round4((totalProposals - totalProposalBlocked) / totalProposals)
      : 1,
    resolutionByRung: computeRungRates(steps),
    degradedLocatorRate: totalSteps > 0
      ? round4(steps.filter((s) => s.degraded).length / totalSteps)
      : 0,
    recoverySuccessRate,
  };

  // Scoring effectiveness — compute real correlations from experiment history
  const correlations = computeBottleneckCorrelations(data.experimentHistory ?? []);
  const scoringEffectiveness: ScoringEffectiveness = {
    bottleneckWeightCorrelations: correlations,
    proposalRankingAccuracy: metrics.proposalYield,
  };

  return {
    kind: 'pipeline-fitness-report',
    version: 1,
    pipelineVersion: data.pipelineVersion,
    runAt: new Date().toISOString(),
    baseline: true,
    metrics,
    failureModes,
    scoringEffectiveness,
  };
}

// ─── Scorecard comparison ───

export interface ScorecardComparison {
  readonly improved: boolean;
  readonly knowledgeHitRateDelta: number;
  readonly translationPrecisionDelta: number;
  readonly convergenceVelocityDelta: number;
  readonly summary: string;
}

export function compareToScorecard(
  report: PipelineFitnessReport,
  scorecard: PipelineScorecard | null,
): ScorecardComparison {
  if (scorecard === null) {
    return {
      improved: true,
      knowledgeHitRateDelta: report.metrics.knowledgeHitRate,
      translationPrecisionDelta: report.metrics.translationPrecision,
      convergenceVelocityDelta: 0,
      summary: 'First run — establishing baseline high-water-mark.',
    };
  }

  const hwm = scorecard.highWaterMark;
  const hitRateDelta = round4(report.metrics.knowledgeHitRate - hwm.knowledgeHitRate);
  const precisionDelta = round4(report.metrics.translationPrecision - hwm.translationPrecision);
  const velocityDelta = report.metrics.convergenceVelocity - hwm.convergenceVelocity;

  // Use Pareto comparison when frontier exists, fall back to single-metric
  const candidateObjectives = objectivesFromMetrics(report.metrics);
  const improved = scorecard.paretoFrontier
    ? isAcceptedByParetoFrontier(scorecard.paretoFrontier, candidateObjectives)
    : hitRateDelta > 0;

  const summary = improved
    ? scorecard.paretoFrontier
      ? `Accepted by Pareto frontier: not dominated by any existing entry`
      : `Beat the mark: hit rate ${hwm.knowledgeHitRate} → ${report.metrics.knowledgeHitRate} (+${hitRateDelta})`
    : scorecard.paretoFrontier
      ? `Rejected: dominated by existing Pareto frontier entry`
      : `Did not beat the mark: hit rate ${report.metrics.knowledgeHitRate} vs high-water ${hwm.knowledgeHitRate} (${hitRateDelta})`;

  return { improved, knowledgeHitRateDelta: hitRateDelta, translationPrecisionDelta: precisionDelta, convergenceVelocityDelta: velocityDelta, summary };
}

export function updateScorecard(
  report: PipelineFitnessReport,
  existing: PipelineScorecard | null,
  comparison: ScorecardComparison,
): PipelineScorecard {
  const historyEntry: ScorecardHistoryEntry = {
    runAt: report.runAt,
    pipelineVersion: report.pipelineVersion,
    knowledgeHitRate: report.metrics.knowledgeHitRate,
    translationPrecision: report.metrics.translationPrecision,
    convergenceVelocity: report.metrics.convergenceVelocity,
    improved: comparison.improved,
  };

  const highWaterMark: ScorecardHighWaterMark = comparison.improved
    ? {
        setAt: report.runAt,
        pipelineVersion: report.pipelineVersion,
        knowledgeHitRate: report.metrics.knowledgeHitRate,
        translationPrecision: report.metrics.translationPrecision,
        convergenceVelocity: report.metrics.convergenceVelocity,
        proposalYield: report.metrics.proposalYield,
        resolutionByRung: report.metrics.resolutionByRung,
      }
    : existing?.highWaterMark ?? {
        setAt: report.runAt,
        pipelineVersion: report.pipelineVersion,
        knowledgeHitRate: report.metrics.knowledgeHitRate,
        translationPrecision: report.metrics.translationPrecision,
        convergenceVelocity: report.metrics.convergenceVelocity,
        proposalYield: report.metrics.proposalYield,
        resolutionByRung: report.metrics.resolutionByRung,
      };

  // Maintain Pareto frontier
  const existingFrontier = existing?.paretoFrontier ?? [];
  const candidateObjectives = objectivesFromMetrics(report.metrics);
  const paretoFrontier = comparison.improved
    ? addToParetoFrontier(existingFrontier, {
        pipelineVersion: report.pipelineVersion,
        addedAt: report.runAt,
        objectives: candidateObjectives,
      })
    : existingFrontier;

  return {
    kind: 'pipeline-scorecard',
    version: 1,
    highWaterMark,
    history: [...(existing?.history ?? []), historyEntry],
    ...(paretoFrontier.length > 0 ? { paretoFrontier } : {}),
  };
}

// ─── Multi-seed fitness averaging ───

/**
 * Merge failure modes from multiple reports, deduplicating by class
 * and summing counts/affected steps.
 */
function mergeFailureModes(
  modes: readonly PipelineFailureMode[],
): readonly PipelineFailureMode[] {
  const byClass = modes.reduce<ReadonlyMap<PipelineFailureClass, PipelineFailureMode>>(
    (map, mode) => {
      const existing = map.get(mode.class);
      return existing
        ? new Map([...map, [mode.class, {
            ...existing,
            count: existing.count + mode.count,
            affectedSteps: existing.affectedSteps + mode.affectedSteps,
          }]])
        : new Map([...map, [mode.class, mode]]);
    },
    new Map(),
  );
  return [...byClass.values()].sort((a, b) => b.count - a.count);
}

/**
 * Average multiple fitness reports (from multi-seed runs) into a single
 * aggregate report. Numeric metrics are averaged; failure modes are merged
 * and deduplicated by class.
 */
export function averageFitnessReports(
  reports: readonly PipelineFitnessReport[],
): PipelineFitnessReport {
  const n = reports.length;
  if (n === 0) {
    throw new TesseractError('validation-error', 'averageFitnessReports requires at least one report');
  }
  if (n === 1) {
    return reports[0]!;
  }

  const avg = (fn: (r: PipelineFitnessReport) => number): number =>
    round4(reports.reduce((sum, r) => sum + fn(r), 0) / n);

  const base = reports[0]!;
  return {
    ...base,
    metrics: {
      ...base.metrics,
      knowledgeHitRate: avg((r) => r.metrics.knowledgeHitRate),
      translationPrecision: avg((r) => r.metrics.translationPrecision),
      translationRecall: avg((r) => r.metrics.translationRecall),
      convergenceVelocity: Math.round(avg((r) => r.metrics.convergenceVelocity)),
      proposalYield: avg((r) => r.metrics.proposalYield),
      degradedLocatorRate: avg((r) => r.metrics.degradedLocatorRate),
      recoverySuccessRate: avg((r) => r.metrics.recoverySuccessRate),
    },
    failureModes: mergeFailureModes(reports.flatMap((r) => r.failureModes)),
  };
}

// ─── Generalization Metrics (held-out validation) ───

/** Compare training and validation fitness reports to detect overfitting.
 *  Pure function: two reports → generalization metrics. */
export function computeGeneralizationMetrics(
  trainingReport: PipelineFitnessReport,
  validationReport: PipelineFitnessReport,
): GeneralizationMetrics {
  const tm = trainingReport.metrics;
  const vm = validationReport.metrics;

  const gaps = {
    hitRateGap: round4(tm.knowledgeHitRate - vm.knowledgeHitRate),
    precisionGap: round4(tm.translationPrecision - vm.translationPrecision),
    degradationGap: round4(vm.degradedLocatorRate - tm.degradedLocatorRate),
  };

  const passes = {
    noOverfitting: Math.abs(gaps.hitRateGap) < 0.15,
    validationSignificant: vm.knowledgeHitRate > 0.4,
    robustness: gaps.degradationGap < 0.1,
  };

  const allPass = passes.noOverfitting && passes.validationSignificant && passes.robustness;
  const anyPass = passes.noOverfitting || passes.validationSignificant || passes.robustness;

  return {
    kind: 'generalization-metrics',
    version: 1,
    trainingMetrics: {
      knowledgeHitRate: tm.knowledgeHitRate,
      translationPrecision: tm.translationPrecision,
      convergenceVelocity: tm.convergenceVelocity,
      proposalYield: tm.proposalYield,
      degradedLocatorRate: tm.degradedLocatorRate,
    },
    validationMetrics: {
      knowledgeHitRate: vm.knowledgeHitRate,
      translationPrecision: vm.translationPrecision,
      degradedLocatorRate: vm.degradedLocatorRate,
    },
    gaps,
    passes,
    verdict: allPass ? 'pass' : anyPass ? 'warn' : 'fail',
  };
}

/**
 * Pipeline Fitness Report emission and Scorecard comparison.
 *
 * After a clean-slate flywheel run, this module classifies step-level
 * resolution outcomes into pipeline failure modes and computes aggregate
 * metrics. The fitness report is the "gradient" of the self-improving loop;
 * the scorecard comparison is the "beat-the-mark" gate.
 */

import type {
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
import type { DogfoodLedger } from './dogfood';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../domain/precedence';

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
  switch (failureClass) {
    case 'translation-threshold-miss':
      return { kind: 'translation', detail: 'Adjust overlap score threshold or improve scoring formula' };
    case 'translation-normalization-gap':
      return { kind: 'translation', detail: 'Add normalization rules for unrecognized phrasing patterns' };
    case 'alias-coverage-gap':
      return { kind: 'resolution', detail: 'Improve alias generation heuristics for predictable patterns' };
    case 'resolution-rung-skip':
      return { kind: 'resolution', detail: 'Strengthen higher-precedence rungs to resolve before fallback' };
    case 'scoring-weight-mismatch':
      return { kind: 'scoring', detail: 'Re-weight bottleneck scoring signals based on observed correlations' };
    case 'recovery-strategy-miss':
      return { kind: 'recovery', detail: 'Reorder or add recovery strategies for unhandled failure families' };
    case 'convergence-stall':
      return { kind: 'scoring', detail: 'Improve proposal ranking to prioritize high-yield proposals' };
    case 'trust-policy-over-block':
      return { kind: 'trust-policy', detail: 'Lower confidence thresholds or widen evidence requirements' };
    default: {
      const _exhaustive: never = failureClass;
      return _exhaustive;
    }
  }
}

// ─── Extraction from dogfood ledger + run records ───

interface RunStepData {
  readonly interpretation: ResolutionReceipt;
  readonly execution: StepExecutionReceipt;
}

export interface FitnessInputData {
  readonly pipelineVersion: string;
  readonly ledger: DogfoodLedger;
  readonly runSteps: readonly RunStepData[];
  readonly proposalBundles: readonly ProposalBundle[];
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
  const failureMap = new Map<PipelineFailureClass, { count: number; affectedSteps: number; intents: string[] }>();
  for (const step of steps) {
    const failureClass = classifyFailure(step);
    if (failureClass !== null) {
      const existing = failureMap.get(failureClass) ?? { count: 0, affectedSteps: 0, intents: [] };
      failureMap.set(failureClass, {
        count: existing.count + 1,
        affectedSteps: existing.affectedSteps + 1,
        intents: existing.intents.length < 5 ? [...existing.intents, step.intent] : existing.intents,
      });
    }
  }

  // Check for convergence stall before building failure modes
  const ledgerIterations = data.ledger.iterations;
  const convergenceStalled = ledgerIterations.length >= 2
    && (() => {
      const last = ledgerIterations[ledgerIterations.length - 1]!;
      const prev = ledgerIterations[ledgerIterations.length - 2]!;
      return last.proposalsActivated > 0 && last.knowledgeHitRate <= prev.knowledgeHitRate;
    })();

  if (convergenceStalled && !failureMap.has('convergence-stall')) {
    const last = ledgerIterations[ledgerIterations.length - 1]!;
    failureMap.set('convergence-stall', {
      count: 1,
      affectedSteps: last.totalStepCount,
      intents: ['convergence stalled: proposals generated but no hit rate improvement'],
    });
  }

  const failureModes: readonly PipelineFailureMode[] = [...failureMap.entries()]
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

  // Scoring effectiveness — correlate bottleneck signals with improvement
  const scoringEffectiveness: ScoringEffectiveness = {
    bottleneckWeightCorrelations: [
      { signal: 'repair-recovery-hotspot', weight: 0.3, correlationWithImprovement: 0 },
      { signal: 'translation-fallback-dominant', weight: 0.25, correlationWithImprovement: 0 },
      { signal: 'high-unresolved-rate', weight: 0.25, correlationWithImprovement: 0 },
      { signal: 'thin-screen-coverage', weight: 0.2, correlationWithImprovement: 0 },
    ],
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

  // Primary improvement signal is knowledge hit rate
  const improved = hitRateDelta > 0;

  const summary = improved
    ? `Beat the mark: hit rate ${hwm.knowledgeHitRate} → ${report.metrics.knowledgeHitRate} (+${hitRateDelta})`
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

  return {
    kind: 'pipeline-scorecard',
    version: 1,
    highWaterMark,
    history: [...(existing?.history ?? []), historyEntry],
  };
}

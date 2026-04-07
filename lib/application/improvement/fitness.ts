/**
 * Pipeline Fitness Report emission and Scorecard comparison.
 *
 * After a clean-slate flywheel run, this module classifies step-level
 * resolution outcomes into pipeline failure modes and computes aggregate
 * metrics. The fitness report is the "gradient" of the self-improving loop;
 * the scorecard comparison is the "beat-the-mark" gate.
 */

import { TesseractError } from '../../domain/kernel/errors';
import type { ProposalBundle, StepExecutionReceipt } from '../../domain/execution/types';
import {
  addToParetoFrontier,
  isAcceptedByParetoFrontier,
  objectivesFromMetrics,
  summarizeTheoremBaseline,
  theoremBaselineCoverageForObligations,
} from '../../domain/fitness/types';
import {
  computeMemoryMaturity,
  memoryMaturityEntryCount,
} from '../../domain/fitness/memory-maturity';
import {
  compoundingObligation,
  trajectoryMeasurementClass,
  type CompoundingTrajectory,
} from '../../domain/fitness/compounding';
import { hasCriticalFloorViolation } from '../../domain/fitness/targets';
import { projectCompoundingTrajectory } from './compounding-projection';
import type {
  KnowledgeCoverageSummary,
  LogicalProofObligation,
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
} from '../../domain/fitness/types';
import type { StepWinningSource } from '../../domain/governance/workflow-types';
import type { ExperimentRecord } from '../../domain/improvement/experiment';
import type { ImprovementLoopLedger } from '../../domain/improvement/types';
import type { ResolutionReceipt } from '../../domain/resolution/types';
import { groupByMap } from '../../domain/kernel/collections';
import { foldPipelineFailureClass, WINNING_SOURCE_TO_RUNG } from '../../domain/kernel/visitors';
import { isBlocked } from '../../domain/proposal/lifecycle';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../../domain/resolution/precedence';
import type { BottleneckWeightCorrelation, GeneralizationMetrics } from '../../domain/fitness/types';

// ─── Step-level classification ───

interface StepOutcome {
  readonly intent: string;
  readonly interpretationKind: ResolutionReceipt['kind'];
  readonly winningSource: StepWinningSource;
  readonly provenanceKind: string;
  readonly executionStatus: string;
  readonly translationMatched: boolean;
  readonly translationScore: number | null;
  readonly translationFailureClass: string | null;
  readonly routeMismatch: boolean;
  readonly degraded: boolean;
  readonly recoveryAttempts: number;
  readonly recoverySucceeded: boolean;
  readonly proposalCount: number;
  readonly proposalBlocked: number;
}

// Translation score thresholds — extracted from empirical calibration
const TRANSLATION_NEAR_MISS_LOWER = 0.15;
const TRANSLATION_NEAR_MISS_UPPER = 0.34;

// Winning sources that indicate a fallback rung was used when a higher one should suffice
const FALLBACK_RUNGS: ReadonlySet<string> = new Set(['live-dom', 'structured-translation']);

function classifyFailure(step: StepOutcome): PipelineFailureClass | null {
  // Translation scored below threshold but had a near-miss candidate
  if (!step.translationMatched && step.translationScore !== null
    && step.translationScore > TRANSLATION_NEAR_MISS_LOWER
    && step.translationScore < TRANSLATION_NEAR_MISS_UPPER) {
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
  if (FALLBACK_RUNGS.has(step.winningSource)) {
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
  readonly knowledgeCoverage?: KnowledgeCoverageSummary | undefined;
  /** Learning signals from the last iteration — enriches fitness metrics with execution health. */
  readonly learningSignals?: import('../../domain/improvement/types').LearningSignalsSummary | undefined;
  /** Obligations produced by out-of-band probes (e.g. fingerprint-stability)
   *  whose `measurementClass: 'direct'` is earned through real structural
   *  measurement rather than heuristic risk scoring. Merged into the
   *  runtime obligation set and passed through to the scorecard. */
  readonly extraObligations?: readonly import('../../domain/fitness/types').LogicalProofObligation[] | undefined;
  /** Operational `MemoryMaturity(τ)` counts derived from the catalog at the
   *  time the fitness report is built. Used by C-family obligations and the
   *  scorecard history to track compounding direction across cohorts. */
  readonly memoryMaturityCounts?: import('../../domain/fitness/memory-maturity').MemoryMaturityCounts | undefined;
  /** Existing scorecard, when available. Lets `buildFitnessReport` project
   *  a cohort-trajectory measurement of compounding-economics from history
   *  instead of the single-frame heuristic. Without this, the C-family
   *  obligation falls back to its `heuristic-proxy` form. */
  readonly existingScorecard?: PipelineScorecard | null | undefined;
}

function extractStepOutcomes(data: FitnessInputData): readonly StepOutcome[] {
  return data.runSteps.map((step) => {
    const interp = step.interpretation;
    const exec = step.execution;
    const translation = interp.translation ?? null;

    return {
      intent: `step-${interp.stepIndex}`,
      interpretationKind: interp.kind,
      winningSource: interp.winningSource,
      provenanceKind: interp.provenanceKind,
      executionStatus: String(exec.execution.status),
      translationMatched: translation?.matched ?? false,
      translationScore: translation?.selected?.score ?? (translation?.candidates?.[0]?.score ?? null),
      translationFailureClass: translation?.failureClass ?? null,
      routeMismatch: exec.navigation?.mismatch ?? false,
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

  const wins = new Map<ResolutionPrecedenceRung, number>();
  for (const step of steps) {
    const rung = (WINNING_SOURCE_TO_RUNG[step.winningSource as keyof typeof WINNING_SOURCE_TO_RUNG]
      ?? 'needs-human') as ResolutionPrecedenceRung;
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

const EFFECTIVE_HIT_MAX_RUNG_INDEX = 5;

function isExecutionSuccess(status: string): boolean {
  return status === 'ok' || status === 'passed';
}

function isEffectiveHit(step: StepOutcome): boolean {
  if (!isExecutionSuccess(step.executionStatus) || step.degraded) {
    return false;
  }

  const rung = (WINNING_SOURCE_TO_RUNG[step.winningSource as keyof typeof WINNING_SOURCE_TO_RUNG]
    ?? 'needs-human') as ResolutionPrecedenceRung;
  const rungIndex = resolutionPrecedenceLaw.indexOf(rung);
  return rungIndex >= 0 && rungIndex <= EFFECTIVE_HIT_MAX_RUNG_INDEX;
}

function winningSourceDistribution(steps: readonly StepOutcome[]): NonNullable<PipelineFitnessMetrics['winningSourceDistribution']> {
  // Phase 2.4 Big-O fix: previously this used `new Map([...map, [k, v]])`
  // inside a reduce, which copies the entire accumulator on every step
  // for O(N²) total work. The single-pass form below is O(N): we mutate
  // a fresh local Map (which is safe — the variable never escapes this
  // function), then build the immutable result list once at the end.
  const total = Math.max(steps.length, 1);
  const counts = new Map<StepWinningSource, number>();
  for (const step of steps) {
    counts.set(step.winningSource, (counts.get(step.winningSource) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => ({
      source,
      count,
      rate: round4(count / total),
    }));
}

function proposalCategoryCounts(bundles: readonly ProposalBundle[]): Readonly<Record<string, number>> {
  // Phase 2.4 Big-O fix: previously this used `{ ...acc, [k]: v + 1 }`
  // inside a reduce, which clones the entire accumulator on every step
  // for O(N²) total work. Single-pass mutation of a fresh local record
  // is O(N); the result is frozen via `Object.freeze` to keep it
  // structurally readonly at the boundary.
  const acc: Record<string, number> = {};
  for (const bundle of bundles) {
    for (const proposal of bundle.payload.proposals) {
      const category = proposal.category ?? 'uncategorized';
      acc[category] = (acc[category] ?? 0) + 1;
    }
  }
  return Object.freeze(acc);
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function averageNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function knowledgeCoverageShare(knowledgeCoverage: KnowledgeCoverageSummary | undefined): number | null {
  if (!knowledgeCoverage) {
    return null;
  }
  return clampUnit(round2(averageNumbers([
    knowledgeCoverage.roleCoverageRate,
    knowledgeCoverage.affordanceCoverageRate,
    knowledgeCoverage.locatorCoverageRate,
    knowledgeCoverage.postureCoverageRate,
    knowledgeCoverage.routeScreenCoverageRate,
    knowledgeCoverage.routeVariantCoverageRate,
  ])));
}

function proofStatusFromRisk(risk: number): LogicalProofObligation['status'] {
  if (risk >= 0.7) return 'critical';
  if (risk >= 0.3) return 'watch';
  return 'healthy';
}

function proofObligation(input: {
  obligation: LogicalProofObligation['obligation'];
  propertyRefs: LogicalProofObligation['propertyRefs'];
  risk: number;
  evidence: string;
}): LogicalProofObligation {
  const normalizedRisk = clampUnit(input.risk);
  return {
    obligation: input.obligation,
    propertyRefs: input.propertyRefs,
    score: round4(1 - normalizedRisk),
    status: proofStatusFromRisk(normalizedRisk),
    evidence: input.evidence,
    // Phase 1.7 honesty: obligations built from this factory are derived
    // from hand-weighted single-frame fitness rates. They are useful as
    // signals but not as direct measurements of the corresponding
    // theorem groups. The cohort-trajectory builder in `compounding.ts`
    // emits its own obligations with `measurementClass: 'direct'` and
    // those override the heuristic-proxy form when history is available.
    measurementClass: 'heuristic-proxy',
  };
}

function winningSourceRate(
  distribution: PipelineFitnessMetrics['winningSourceDistribution'] | undefined,
  source: StepWinningSource,
): number {
  return distribution?.find((entry) => entry.source === source)?.rate ?? 0;
}

function proposalCategoryShare(
  counts: PipelineFitnessMetrics['proposalCategoryCounts'] | undefined,
  category: string,
): number {
  const values = Object.values(counts ?? {});
  const total = values.reduce((sum, value) => sum + value, 0);
  return total > 0 ? round2((counts?.[category] ?? 0) / total) : 0;
}

function runtimeProofObligations(
  metrics: Pick<
    PipelineFitnessMetrics,
    'effectiveHitRate'
    | 'knowledgeHitRate'
    | 'ambiguityRate'
    | 'suspensionRate'
    | 'agentFallbackRate'
    | 'liveDomFallbackRate'
    | 'routeMismatchRate'
    | 'translationPrecision'
    | 'translationRecall'
    | 'proposalYield'
    | 'degradedLocatorRate'
    | 'recoverySuccessRate'
    | 'proposalCategoryCounts'
    | 'winningSourceDistribution'
    | 'knowledgeCoverage'
  >,
  compoundingTrajectory?: CompoundingTrajectory,
): readonly LogicalProofObligation[] {
  const gateHitRate = metrics.effectiveHitRate ?? metrics.knowledgeHitRate;
  const ambiguityRate = metrics.ambiguityRate ?? 0;
  const suspensionRate = metrics.suspensionRate ?? 0;
  const agentFallbackRate = metrics.agentFallbackRate ?? 0;
  const liveDomFallbackRate = metrics.liveDomFallbackRate ?? 0;
  const routeMismatchRate = metrics.routeMismatchRate ?? 0;
  const approvedEquivalentRate = winningSourceRate(metrics.winningSourceDistribution, 'approved-equivalent');
  const needsHumanProposalShare = proposalCategoryShare(metrics.proposalCategoryCounts, 'needs-human');
  const routeDiscoveryProposalShare = proposalCategoryShare(metrics.proposalCategoryCounts, 'route-discovery');
  const knowledgeCoverage = metrics.knowledgeCoverage;
  const coverageShare = knowledgeCoverageShare(knowledgeCoverage);

  const targetObservabilityRisk = Math.max(1 - metrics.translationPrecision, ambiguityRate, liveDomFallbackRate, metrics.degradedLocatorRate);
  const postureSeparabilityRisk = knowledgeCoverage
    ? clampUnit(round2(Math.max(
      1 - knowledgeCoverage.postureCoverageRate,
      1 - knowledgeCoverage.routeScreenCoverageRate,
      1 - knowledgeCoverage.routeVariantCoverageRate,
      suspensionRate,
      ambiguityRate * 0.75,
    )))
    : null;
  const affordanceRecoverabilityRisk = knowledgeCoverage
    ? clampUnit(round2(Math.max(
      1 - knowledgeCoverage.roleCoverageRate,
      1 - knowledgeCoverage.affordanceCoverageRate,
      1 - knowledgeCoverage.locatorCoverageRate,
      metrics.degradedLocatorRate,
      ambiguityRate,
    )))
    : null;
  const structuralRisk = Math.max(targetObservabilityRisk, 1 - metrics.translationRecall);
  const persistenceRisk = Math.max(metrics.degradedLocatorRate, 1 - metrics.recoverySuccessRate, agentFallbackRate * 0.75);
  const topologyRisk = Math.max(routeMismatchRate, suspensionRate, ambiguityRate * 0.75);
  const factorabilityReuseGap = clampUnit(Math.max(0, 0.35 - approvedEquivalentRate) / 0.35);
  const factorabilityStress = Math.max(
    ambiguityRate,
    routeMismatchRate,
    metrics.degradedLocatorRate,
    Math.max(needsHumanProposalShare, routeDiscoveryProposalShare),
  );
  const factorabilityRisk = clampUnit(round2(factorabilityStress * 0.7 + factorabilityReuseGap * 0.3));
  const recoverabilityRisk = clampUnit(round2(Math.max(
    1 - metrics.recoverySuccessRate,
    metrics.degradedLocatorRate,
    routeMismatchRate,
    suspensionRate * 0.75,
  )));
  const participationRisk = Math.max(1 - metrics.proposalYield, agentFallbackRate, 1 - metrics.recoverySuccessRate);
  const economicsRisk = Math.max(1 - gateHitRate, 1 - metrics.proposalYield, metrics.degradedLocatorRate);
  const surfaceCompressibilityRisk = clampUnit(round2(Math.max(
    1 - metrics.translationRecall,
    ambiguityRate,
    liveDomFallbackRate * 0.75,
    coverageShare === null ? 0 : 1 - coverageShare,
  )));
  const surfacePredictabilityRisk = clampUnit(round2(Math.max(
    routeMismatchRate,
    suspensionRate,
    liveDomFallbackRate,
    agentFallbackRate * 0.5,
    ambiguityRate * 0.5,
  )));
  const surfaceRepairabilityRisk = clampUnit(round2(Math.max(
    1 - metrics.recoverySuccessRate,
    metrics.degradedLocatorRate,
    routeMismatchRate,
    suspensionRate * 0.5,
  )));
  const participatoryRepairabilityRisk = clampUnit(round2(Math.max(
    1 - metrics.proposalYield,
    1 - metrics.recoverySuccessRate,
    needsHumanProposalShare,
    agentFallbackRate,
  )));
  const memoryReuseGap = clampUnit(Math.max(0, 0.25 - approvedEquivalentRate) / 0.25);
  const memoryWorthinessRisk = clampUnit(round2(
    surfaceCompressibilityRisk * 0.2
    + surfacePredictabilityRisk * 0.15
    + surfaceRepairabilityRisk * 0.15
    + participatoryRepairabilityRisk * 0.15
    + economicsRisk * 0.2
    + memoryReuseGap * 0.15
  ));
  const metaRisk = round2(averageNumbers([
    surfaceCompressibilityRisk,
    surfacePredictabilityRisk,
    surfaceRepairabilityRisk,
    participatoryRepairabilityRisk,
    memoryWorthinessRisk,
  ]));

  return [
    proofObligation({
      obligation: 'target-observability',
      propertyRefs: ['L'],
      risk: targetObservabilityRisk,
      evidence: `translationPrecision=${metrics.translationPrecision}, ambiguityRate=${ambiguityRate}, liveDomFallbackRate=${liveDomFallbackRate}, degradedLocatorRate=${metrics.degradedLocatorRate}`,
    }),
    ...(postureSeparabilityRisk !== null ? [proofObligation({
      obligation: 'posture-separability',
      propertyRefs: ['K'],
      risk: postureSeparabilityRisk,
      evidence: `postureCoverageRate=${knowledgeCoverage!.postureCoverageRate}, routeScreenCoverageRate=${knowledgeCoverage!.routeScreenCoverageRate}, routeVariantCoverageRate=${knowledgeCoverage!.routeVariantCoverageRate}, suspensionRate=${suspensionRate}, ambiguityRate=${ambiguityRate}`,
    })] : []),
    ...(affordanceRecoverabilityRisk !== null ? [proofObligation({
      obligation: 'affordance-recoverability',
      propertyRefs: ['S'],
      risk: affordanceRecoverabilityRisk,
      evidence: `roleCoverageRate=${knowledgeCoverage!.roleCoverageRate}, affordanceCoverageRate=${knowledgeCoverage!.affordanceCoverageRate}, locatorCoverageRate=${knowledgeCoverage!.locatorCoverageRate}, degradedLocatorRate=${metrics.degradedLocatorRate}, ambiguityRate=${ambiguityRate}`,
    })] : []),
    proofObligation({
      obligation: 'structural-legibility',
      propertyRefs: ['K', 'L', 'S'],
      risk: structuralRisk,
      evidence: `targetObservabilityRisk=${targetObservabilityRisk}, translationRecall=${metrics.translationRecall}, ambiguityRate=${ambiguityRate}, liveDomFallbackRate=${liveDomFallbackRate}`,
    }),
    proofObligation({
      obligation: 'semantic-persistence',
      propertyRefs: ['K', 'V', 'R'],
      risk: persistenceRisk,
      evidence: `degradedLocatorRate=${metrics.degradedLocatorRate}, recoverySuccessRate=${metrics.recoverySuccessRate}, agentFallbackRate=${agentFallbackRate}`,
    }),
    proofObligation({
      obligation: 'dynamic-topology',
      propertyRefs: ['D'],
      risk: topologyRisk,
      evidence: `routeMismatchRate=${routeMismatchRate}, suspensionRate=${suspensionRate}, ambiguityRate=${ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'variance-factorability',
      propertyRefs: ['V'],
      risk: factorabilityRisk,
      evidence: `approvedEquivalentRate=${approvedEquivalentRate}, ambiguityRate=${ambiguityRate}, routeMismatchRate=${routeMismatchRate}, degradedLocatorRate=${metrics.degradedLocatorRate}, needsHumanProposalShare=${needsHumanProposalShare}, routeDiscoveryProposalShare=${routeDiscoveryProposalShare}`,
    }),
    proofObligation({
      obligation: 'recoverability',
      propertyRefs: ['R'],
      risk: recoverabilityRisk,
      evidence: `recoverySuccessRate=${metrics.recoverySuccessRate}, degradedLocatorRate=${metrics.degradedLocatorRate}, routeMismatchRate=${routeMismatchRate}, suspensionRate=${suspensionRate}`,
    }),
    proofObligation({
      obligation: 'participatory-unresolvedness',
      propertyRefs: ['A'],
      risk: participationRisk,
      evidence: `proposalYield=${metrics.proposalYield}, recoverySuccessRate=${metrics.recoverySuccessRate}, agentFallbackRate=${agentFallbackRate}`,
    }),
    // Cohort-trajectory measurement when history is available, heuristic
    // proxy otherwise. The cohort-derived obligation is the honest one
    // and graduates from `heuristic-proxy` → `direct` once the trajectory
    // has DIRECT_TRAJECTORY_SAMPLES (3) cohort-comparable samples.
    compoundingTrajectory && compoundingTrajectory.samples.length >= 2
      ? {
          ...compoundingObligation({
            obligation: 'compounding-economics',
            propertyRefs: ['C', 'M'],
            trajectory: compoundingTrajectory,
            metricName: 'effectiveHitRate',
          }),
          measurementClass: trajectoryMeasurementClass(compoundingTrajectory),
        }
      : {
          ...proofObligation({
            obligation: 'compounding-economics',
            propertyRefs: ['C', 'M'],
            risk: economicsRisk,
            evidence: `gateHitRate=${gateHitRate}, proposalYield=${metrics.proposalYield}, degradedLocatorRate=${metrics.degradedLocatorRate} (heuristic — no cohort trajectory available)`,
          }),
          measurementClass: 'heuristic-proxy' as const,
        },
    proofObligation({
      obligation: 'surface-compressibility',
      propertyRefs: ['M'],
      risk: surfaceCompressibilityRisk,
      evidence: `translationRecall=${metrics.translationRecall}, ambiguityRate=${ambiguityRate}, liveDomFallbackRate=${liveDomFallbackRate}, coverageShare=${coverageShare === null ? 'n/a' : coverageShare}`,
    }),
    proofObligation({
      obligation: 'surface-predictability',
      propertyRefs: ['M'],
      risk: surfacePredictabilityRisk,
      evidence: `routeMismatchRate=${routeMismatchRate}, suspensionRate=${suspensionRate}, liveDomFallbackRate=${liveDomFallbackRate}, agentFallbackRate=${agentFallbackRate}, ambiguityRate=${ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'surface-repairability',
      propertyRefs: ['M'],
      risk: surfaceRepairabilityRisk,
      evidence: `recoverySuccessRate=${metrics.recoverySuccessRate}, degradedLocatorRate=${metrics.degradedLocatorRate}, routeMismatchRate=${routeMismatchRate}, suspensionRate=${suspensionRate}`,
    }),
    proofObligation({
      obligation: 'participatory-repairability',
      propertyRefs: ['M'],
      risk: participatoryRepairabilityRisk,
      evidence: `proposalYield=${metrics.proposalYield}, recoverySuccessRate=${metrics.recoverySuccessRate}, needsHumanProposalShare=${needsHumanProposalShare}, agentFallbackRate=${agentFallbackRate}`,
    }),
    proofObligation({
      obligation: 'memory-worthiness',
      propertyRefs: ['M'],
      risk: memoryWorthinessRisk,
      evidence: `surfaceCompressibilityRisk=${round2(surfaceCompressibilityRisk)}, surfacePredictabilityRisk=${round2(surfacePredictabilityRisk)}, surfaceRepairabilityRisk=${round2(surfaceRepairabilityRisk)}, participatoryRepairabilityRisk=${round2(participatoryRepairabilityRisk)}, economicsRisk=${round2(economicsRisk)}, approvedEquivalentRate=${approvedEquivalentRate}`,
    }),
    proofObligation({
      obligation: 'meta-worthiness',
      propertyRefs: ['M'],
      risk: metaRisk,
      evidence: `surfaceCompressibilityRisk=${round2(surfaceCompressibilityRisk)}, surfacePredictabilityRisk=${round2(surfacePredictabilityRisk)}, surfaceRepairabilityRisk=${round2(surfaceRepairabilityRisk)}, participatoryRepairabilityRisk=${round2(participatoryRepairabilityRisk)}, memoryWorthinessRisk=${round2(memoryWorthinessRisk)}`,
    }),
  ];
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

// Derived: maps improvement target kind → bottleneck signal
const TARGET_KIND_TO_SIGNAL: Readonly<Record<string, string>> = {
  recovery: 'repair-recovery-hotspot',
  translation: 'translation-fallback-dominant',
  resolution: 'high-unresolved-rate',
  scoring: 'thin-screen-coverage',
  'trust-policy': 'thin-screen-coverage',
} as const;

// Maps failure classes to the bottleneck signal via improvement target derivation
const FAILURE_TO_SIGNAL: Readonly<Record<string, string>> = Object.fromEntries(
  (['translation-threshold-miss', 'translation-normalization-gap', 'alias-coverage-gap',
    'resolution-rung-skip', 'scoring-weight-mismatch', 'recovery-strategy-miss',
    'convergence-stall', 'trust-policy-over-block'] as const).map((fc) => {
    const target = improvementTargetFor(fc);
    return [fc, TARGET_KIND_TO_SIGNAL[target.kind] ?? 'thin-screen-coverage'];
  }),
);

export function computeBottleneckCorrelations(
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
  const bySubstrate = groupByMap(experiments, (exp) => exp.substrateContext.substrate);

  // Collect delta signals from consecutive experiment pairs within each substrate
  const signalDeltas = [...bySubstrate.values()].flatMap((subExps) => {
    const sorted = [...subExps].sort((a, b) => a.runAt.localeCompare(b.runAt));
    return sorted.slice(0, -1).flatMap((current, i) => {
      const next = sorted[i + 1]!;
      const topFailure = current.fitnessReport.failureModes[0];
      if (!topFailure) return [];
      const signal = FAILURE_TO_SIGNAL[topFailure.class];
      if (!signal) return [];
      const currentGate = current.fitnessReport.metrics.effectiveHitRate ?? current.fitnessReport.metrics.knowledgeHitRate;
      const nextGate = next.fitnessReport.metrics.effectiveHitRate ?? next.fitnessReport.metrics.knowledgeHitRate;
      const delta = nextGate - currentGate;
      return [{ signal, delta }];
    });
  });

  const deltasBySignal = groupByMap(signalDeltas, (d) => d.signal);

  return BOTTLENECK_SIGNALS.map(({ signal, weight }) => {
    const deltaEntries = deltasBySignal.get(signal) ?? [];
    const correlation = deltaEntries.length > 0
      ? round4(deltaEntries.reduce((sum, d) => sum + d.delta, 0) / deltaEntries.length)
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
  readonly effectiveHitRate: number;
  readonly knowledgeHitRate: number;
  readonly ambiguityRate?: number | undefined;
  readonly suspensionRate?: number | undefined;
  readonly agentFallbackRate?: number | undefined;
  readonly liveDomFallbackRate?: number | undefined;
  readonly routeMismatchRate?: number | undefined;
  readonly degradedLocatorRate: number;
  readonly totalSteps: number;
}

export function buildPartialFitnessMetrics(input: PartialFitnessInput): PartialFitnessMetrics {
  const steps = extractStepOutcomes({ ...input, pipelineVersion: '', ledger: { iterations: [], completedIterations: 0, maxIterations: 0, converged: false, convergenceReason: null, kind: 'improvement-loop-ledger', version: 1, totalProposalsActivated: 0, totalInstructionCount: 0, knowledgeHitRateDelta: 0 }, proposalBundles: [] });
  const totalSteps = steps.length;
  const approvedKnowledge = steps.filter((s) => s.provenanceKind === 'approved-knowledge').length;
  const effectiveHits = steps.filter(isEffectiveHit).length;
  const ambiguities = steps.filter((s) => s.interpretationKind === 'needs-human').length;
  const suspensions = steps.filter((s) => s.interpretationKind === 'needs-human' || !isExecutionSuccess(s.executionStatus)).length;
  const liveDomFallbacks = steps.filter((s) => s.winningSource === 'live-dom').length;
  const agentFallbacks = steps.filter((s) => s.winningSource === 'live-dom' || s.winningSource === 'none').length;
  const routeMismatches = steps.filter((s) => s.routeMismatch).length;

  return {
    resolutionByRung: computeRungRates(steps),
    effectiveHitRate: totalSteps > 0 ? round4(effectiveHits / totalSteps) : 0,
    knowledgeHitRate: totalSteps > 0 ? round4(approvedKnowledge / totalSteps) : 0,
    ambiguityRate: totalSteps > 0 ? round4(ambiguities / totalSteps) : 0,
    suspensionRate: totalSteps > 0 ? round4(suspensions / totalSteps) : 0,
    agentFallbackRate: totalSteps > 0 ? round4(agentFallbacks / totalSteps) : 0,
    liveDomFallbackRate: totalSteps > 0 ? round4(liveDomFallbacks / totalSteps) : 0,
    routeMismatchRate: totalSteps > 0 ? round4(routeMismatches / totalSteps) : 0,
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
    (sum, bundle) => sum + bundle.payload.proposals.filter((p) => isBlocked(p.activation)).length,
    0,
  );
  const totalProposals = data.proposalBundles.reduce(
    (sum, bundle) => sum + bundle.payload.proposals.length,
    0,
  );

  // Classify failures. Phase 2.4 Big-O fix: single-pass O(N) instead of
  // O(N²). The mutable Map is local and never escapes; the value records
  // are still constructed immutably.
  const failureMap = (() => {
    const acc = new Map<PipelineFailureClass, { readonly count: number; readonly affectedSteps: number; readonly intents: readonly string[] }>();
    for (const step of steps) {
      const failureClass = classifyFailure(step);
      if (failureClass === null) continue;
      const existing = acc.get(failureClass) ?? { count: 0, affectedSteps: 0, intents: [] };
      acc.set(failureClass, {
        count: existing.count + 1,
        affectedSteps: existing.affectedSteps + 1,
        intents: existing.intents.length < 5 ? [...existing.intents, step.intent] : existing.intents,
      });
    }
    return acc as ReadonlyMap<PipelineFailureClass, { readonly count: number; readonly affectedSteps: number; readonly intents: readonly string[] }>;
  })();

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
  const effectiveHits = steps.filter(isEffectiveHit).length;
  const ambiguities = steps.filter((s) => s.interpretationKind === 'needs-human').length;
  const suspensions = steps.filter((s) => s.interpretationKind === 'needs-human' || !isExecutionSuccess(s.executionStatus)).length;
  const liveDomFallbacks = steps.filter((s) => s.winningSource === 'live-dom').length;
  const agentFallbacks = steps.filter((s) => s.winningSource === 'live-dom' || s.winningSource === 'none').length;
  const routeMismatches = steps.filter((s) => s.routeMismatch).length;

  // Extract execution health from learning signals on the last iteration
  const lastIteration = data.ledger.iterations[data.ledger.iterations.length - 1];
  const ls = data.learningSignals ?? lastIteration?.learningSignals;
  const executionHealth = ls ? {
    compositeScore: ls.compositeHealthScore,
    dimensions: [
      { name: 'timingRegression', value: ls.timingRegressionRate, status: ls.timingRegressionRate > 0.3 ? 'critical' : ls.timingRegressionRate > 0.1 ? 'warning' : 'healthy' },
      { name: 'selectorFlakiness', value: ls.selectorFlakinessRate, status: ls.selectorFlakinessRate > 0.3 ? 'critical' : ls.selectorFlakinessRate > 0.1 ? 'warning' : 'healthy' },
      { name: 'consoleNoise', value: ls.consoleNoiseLevel, status: ls.consoleNoiseLevel > 0.3 ? 'critical' : ls.consoleNoiseLevel > 0.1 ? 'warning' : 'healthy' },
      { name: 'recoveryEfficiency', value: ls.recoveryEfficiency, status: ls.recoveryEfficiency < 0.5 ? 'critical' : ls.recoveryEfficiency < 0.8 ? 'warning' : 'healthy' },
      { name: 'costEfficiency', value: ls.costEfficiency, status: ls.costEfficiency < 0.5 ? 'critical' : ls.costEfficiency < 0.8 ? 'warning' : 'healthy' },
      { name: 'rungStability', value: ls.rungStability, status: ls.rungStability < 0.5 ? 'critical' : ls.rungStability < 0.8 ? 'warning' : 'healthy' },
      { name: 'componentMaturity', value: ls.componentMaturityRate, status: ls.componentMaturityRate < 0.5 ? 'critical' : ls.componentMaturityRate < 0.8 ? 'warning' : 'healthy' },
    ],
  } : undefined;

  const memoryMaturityValue = data.memoryMaturityCounts !== undefined
    ? computeMemoryMaturity(data.memoryMaturityCounts) as number
    : undefined;
  const memoryMaturityEntries = data.memoryMaturityCounts !== undefined
    ? memoryMaturityEntryCount(data.memoryMaturityCounts)
    : undefined;

  const metrics: PipelineFitnessMetrics = {
    ...(memoryMaturityValue !== undefined ? { memoryMaturity: round4(memoryMaturityValue) } : {}),
    ...(memoryMaturityEntries !== undefined ? { memoryMaturityEntries } : {}),
    effectiveHitRate: totalSteps > 0
      ? round4(effectiveHits / totalSteps)
      : 0,
    knowledgeHitRate: data.ledger.iterations.length > 0
      ? data.ledger.iterations[data.ledger.iterations.length - 1]!.knowledgeHitRate
      : 0,
    ambiguityRate: totalSteps > 0 ? round4(ambiguities / totalSteps) : 0,
    suspensionRate: totalSteps > 0 ? round4(suspensions / totalSteps) : 0,
    agentFallbackRate: totalSteps > 0 ? round4(agentFallbacks / totalSteps) : 0,
    liveDomFallbackRate: totalSteps > 0 ? round4(liveDomFallbacks / totalSteps) : 0,
    routeMismatchRate: totalSteps > 0 ? round4(routeMismatches / totalSteps) : 0,
    proposalCategoryCounts: proposalCategoryCounts(data.proposalBundles),
    winningSourceDistribution: winningSourceDistribution(steps),
    knowledgeCoverage: data.knowledgeCoverage,
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
    executionHealth,
  };
  const compoundingTrajectory = data.existingScorecard?.history
    ? projectCompoundingTrajectory({
        history: data.existingScorecard.history,
        extractValue: (entry) => entry.effectiveHitRate ?? entry.knowledgeHitRate,
        direction: 'higher-is-better',
      })
    : undefined;
  const runtimeObligations = runtimeProofObligations(metrics, compoundingTrajectory);
  // Merge in out-of-band probe obligations (e.g. fingerprint-stability).
  // Extras override runtime obligations by name — a direct probe result
  // supersedes the heuristic-proxy entry for the same obligation name
  // when both exist.
  const extraByName = new Map((data.extraObligations ?? []).map((o) => [o.obligation, o] as const));
  const proofObligations = runtimeObligations
    .filter((o) => !extraByName.has(o.obligation))
    .concat([...extraByName.values()]);
  const metricsWithProofs: PipelineFitnessMetrics = {
    ...metrics,
    proofObligations,
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
    metrics: metricsWithProofs,
    failureModes,
    scoringEffectiveness,
  };
}

// ─── Scorecard comparison ───

export interface ScorecardComparison {
  readonly improved: boolean;
  readonly effectiveHitRateDelta: number;
  readonly knowledgeHitRateDelta: number;
  readonly translationPrecisionDelta: number;
  readonly convergenceVelocityDelta: number;
  readonly summary: string;
}

export function compareToScorecard(
  report: PipelineFitnessReport,
  scorecard: PipelineScorecard | null,
): ScorecardComparison {
  const currentEffectiveHitRate = report.metrics.effectiveHitRate ?? report.metrics.knowledgeHitRate;
  if (scorecard === null) {
    return {
      improved: true,
      effectiveHitRateDelta: currentEffectiveHitRate,
      knowledgeHitRateDelta: report.metrics.knowledgeHitRate,
      translationPrecisionDelta: report.metrics.translationPrecision,
      convergenceVelocityDelta: 0,
      summary: 'First run — establishing baseline high-water-mark.',
    };
  }

  const hwm = scorecard.highWaterMark;
  const scorecardUsesEffectiveHitRate = hwm.effectiveHitRate !== undefined;
  const currentGateHitRate = scorecardUsesEffectiveHitRate
    ? currentEffectiveHitRate
    : report.metrics.knowledgeHitRate;
  const highWaterGateHitRate = scorecardUsesEffectiveHitRate
    ? (hwm.effectiveHitRate ?? hwm.knowledgeHitRate)
    : hwm.knowledgeHitRate;
  const effectiveHitRateDelta = round4(currentGateHitRate - highWaterGateHitRate);
  const hitRateDelta = round4(report.metrics.knowledgeHitRate - hwm.knowledgeHitRate);
  const precisionDelta = round4(report.metrics.translationPrecision - hwm.translationPrecision);
  const velocityDelta = report.metrics.convergenceVelocity - hwm.convergenceVelocity;

  // Phase 3.2 veto gate: critical-floor target violations block
  // acceptance regardless of Pareto outcome. The wall-mounted
  // alignment targets are the doctrinal "did this scorecard pass
  // the floor?" check, not just diagnostic signals. A scorecard
  // that improves Pareto-wise but regresses below a critical floor
  // is not accepted.
  const criticalViolation = hasCriticalFloorViolation({
    effectiveHitRate: report.metrics.effectiveHitRate,
    knowledgeHitRate: report.metrics.knowledgeHitRate,
    ambiguityRate: report.metrics.ambiguityRate,
    suspensionRate: report.metrics.suspensionRate,
    degradedLocatorRate: report.metrics.degradedLocatorRate,
    proposalYield: report.metrics.proposalYield,
    recoverySuccessRate: report.metrics.recoverySuccessRate,
  });

  // Use Pareto comparison when frontier exists, fall back to single-metric
  const candidateObjectives = objectivesFromMetrics(report.metrics);
  const paretoOrSingle = scorecard.paretoFrontier
    ? isAcceptedByParetoFrontier(scorecard.paretoFrontier, candidateObjectives)
    : effectiveHitRateDelta > 0;
  const improved = paretoOrSingle && !criticalViolation;

  const gateLabel = scorecardUsesEffectiveHitRate ? 'effective hit rate' : 'knowledge hit rate';
  const gateCurrent = round4(currentGateHitRate);
  const gateHighWater = round4(highWaterGateHitRate);

  const summary = criticalViolation
    ? `Vetoed by critical-floor: a target metric regressed below its alignment floor (see docs/alignment-targets.md). ${gateLabel} ${gateCurrent} vs high-water ${gateHighWater} (${effectiveHitRateDelta}).`
    : improved
      ? scorecard.paretoFrontier
        ? `Accepted by Pareto frontier: not dominated by any existing entry`
        : `Beat the mark: ${gateLabel} ${gateHighWater} → ${gateCurrent} (+${effectiveHitRateDelta})`
      : scorecard.paretoFrontier
        ? `Rejected: dominated by existing Pareto frontier entry`
        : `Did not beat the mark: ${gateLabel} ${gateCurrent} vs high-water ${gateHighWater} (${effectiveHitRateDelta})`;

  return { improved, effectiveHitRateDelta, knowledgeHitRateDelta: hitRateDelta, translationPrecisionDelta: precisionDelta, convergenceVelocityDelta: velocityDelta, summary };
}

export function updateScorecard(
  report: PipelineFitnessReport,
  existing: PipelineScorecard | null,
  comparison: ScorecardComparison,
): PipelineScorecard {
  const theoremBaselineSummary = summarizeTheoremBaseline(
    theoremBaselineCoverageForObligations(report.metrics.proofObligations ?? []),
  );
  const memoryMaturityFields = report.metrics.memoryMaturity !== undefined
    ? {
        memoryMaturity: report.metrics.memoryMaturity,
        memoryMaturityEntries: report.metrics.memoryMaturityEntries,
      }
    : {};

  const historyEntry: ScorecardHistoryEntry = {
    runAt: report.runAt,
    pipelineVersion: report.pipelineVersion,
    effectiveHitRate: report.metrics.effectiveHitRate ?? report.metrics.knowledgeHitRate,
    knowledgeHitRate: report.metrics.knowledgeHitRate,
    translationPrecision: report.metrics.translationPrecision,
    convergenceVelocity: report.metrics.convergenceVelocity,
    theoremBaselineSummary,
    improved: comparison.improved,
    ...memoryMaturityFields,
  };

  const highWaterMark: ScorecardHighWaterMark = comparison.improved
    ? {
        setAt: report.runAt,
        pipelineVersion: report.pipelineVersion,
        effectiveHitRate: report.metrics.effectiveHitRate ?? report.metrics.knowledgeHitRate,
        knowledgeHitRate: report.metrics.knowledgeHitRate,
        translationPrecision: report.metrics.translationPrecision,
        convergenceVelocity: report.metrics.convergenceVelocity,
        proposalYield: report.metrics.proposalYield,
        proofObligations: report.metrics.proofObligations,
        theoremBaselineSummary,
        resolutionByRung: report.metrics.resolutionByRung,
        ...memoryMaturityFields,
      }
    : existing?.highWaterMark ?? {
        setAt: report.runAt,
        pipelineVersion: report.pipelineVersion,
        effectiveHitRate: report.metrics.effectiveHitRate ?? report.metrics.knowledgeHitRate,
        knowledgeHitRate: report.metrics.knowledgeHitRate,
        translationPrecision: report.metrics.translationPrecision,
        convergenceVelocity: report.metrics.convergenceVelocity,
        proposalYield: report.metrics.proposalYield,
        proofObligations: report.metrics.proofObligations,
        theoremBaselineSummary,
        resolutionByRung: report.metrics.resolutionByRung,
        ...memoryMaturityFields,
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
 * and summing counts/affected steps. Phase 2.4 Big-O fix: O(N) instead
 * of O(N²). Phase 2.8 averaging-bug fix happens in `meanFailureModes`
 * below — `mergeFailureModes` keeps SUM semantics (used by aggregators
 * that want totals). Callers that want per-seed averages use
 * `meanFailureModes(modes, seedCount)`.
 */
function mergeFailureModes(
  modes: readonly PipelineFailureMode[],
): readonly PipelineFailureMode[] {
  const byClass = new Map<PipelineFailureClass, PipelineFailureMode>();
  for (const mode of modes) {
    const existing = byClass.get(mode.class);
    byClass.set(
      mode.class,
      existing
        ? {
            ...existing,
            count: existing.count + mode.count,
            affectedSteps: existing.affectedSteps + mode.affectedSteps,
          }
        : mode,
    );
  }
  return [...byClass.values()].sort((a, b) => b.count - a.count);
}

/**
 * Mean of failure modes across N seeds. Phase 2.8 averaging-bug fix:
 * `mergeFailureModes` summed `affectedSteps` across seeds, inflating
 * the result by N×. `meanFailureModes` divides by `n` to produce the
 * average a multi-seed report should report. Counts are rounded.
 */
function meanFailureModes(
  modes: readonly PipelineFailureMode[],
  seedCount: number,
): readonly PipelineFailureMode[] {
  const n = Math.max(seedCount, 1);
  return mergeFailureModes(modes).map((mode) => ({
    ...mode,
    count: Math.round(mode.count / n),
    affectedSteps: Math.round(mode.affectedSteps / n),
  }));
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
  const sumCounts = (
    select: (report: PipelineFitnessReport) => Readonly<Record<string, number>> | undefined,
  ): Readonly<Record<string, number>> =>
    reports.reduce<Record<string, number>>((acc, report) => {
      const counts = select(report) ?? {};
      return Object.entries(counts).reduce<Record<string, number>>(
        (inner, [key, value]) => ({ ...inner, [key]: (inner[key] ?? 0) + value }),
        acc,
      );
    }, {});
  const averageWinningSourceDistribution = (): PipelineFitnessMetrics['winningSourceDistribution'] => {
    const totals = reports.reduce<Map<StepWinningSource, number>>((acc, report) => {
      for (const entry of report.metrics.winningSourceDistribution ?? []) {
        acc.set(entry.source, (acc.get(entry.source) ?? 0) + entry.rate);
      }
      return acc;
    }, new Map());
    return [...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([source, totalRate]) => ({
        source,
        count: 0,
        rate: round4(totalRate / n),
      }));
  };
  const averageKnowledgeCoverage = (): KnowledgeCoverageSummary | undefined => {
    const coverageReports = reports
      .map((report) => report.metrics.knowledgeCoverage)
      .filter((coverage): coverage is KnowledgeCoverageSummary => coverage !== undefined);
    if (coverageReports.length === 0) {
      return undefined;
    }
    return {
      totalElements: Math.round(avg((report) => report.metrics.knowledgeCoverage?.totalElements ?? 0)),
      totalScreens: Math.round(avg((report) => report.metrics.knowledgeCoverage?.totalScreens ?? 0)),
      roleCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.roleCoverageRate ?? 0),
      affordanceCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.affordanceCoverageRate ?? 0),
      locatorCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.locatorCoverageRate ?? 0),
      postureCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.postureCoverageRate ?? 0),
      routeScreenCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.routeScreenCoverageRate ?? 0),
      routeVariantCoverageRate: avg((report) => report.metrics.knowledgeCoverage?.routeVariantCoverageRate ?? 0),
    };
  };

  const base = reports[0]!;
  return {
    ...base,
    metrics: (() => {
      const averagedMetrics: PipelineFitnessMetrics = {
      ...base.metrics,
      effectiveHitRate: avg((r) => r.metrics.effectiveHitRate ?? r.metrics.knowledgeHitRate),
      knowledgeHitRate: avg((r) => r.metrics.knowledgeHitRate),
      ambiguityRate: avg((r) => r.metrics.ambiguityRate ?? 0),
      suspensionRate: avg((r) => r.metrics.suspensionRate ?? 0),
      agentFallbackRate: avg((r) => r.metrics.agentFallbackRate ?? 0),
      liveDomFallbackRate: avg((r) => r.metrics.liveDomFallbackRate ?? 0),
      routeMismatchRate: avg((r) => r.metrics.routeMismatchRate ?? 0),
      proposalCategoryCounts: sumCounts((report) => report.metrics.proposalCategoryCounts),
      winningSourceDistribution: averageWinningSourceDistribution(),
      knowledgeCoverage: averageKnowledgeCoverage(),
      translationPrecision: avg((r) => r.metrics.translationPrecision),
      translationRecall: avg((r) => r.metrics.translationRecall),
      convergenceVelocity: Math.round(avg((r) => r.metrics.convergenceVelocity)),
      proposalYield: avg((r) => r.metrics.proposalYield),
      degradedLocatorRate: avg((r) => r.metrics.degradedLocatorRate),
      recoverySuccessRate: avg((r) => r.metrics.recoverySuccessRate),
      };
      return {
        ...averagedMetrics,
        proofObligations: runtimeProofObligations(averagedMetrics, undefined),
      };
    })(),
    failureModes: meanFailureModes(reports.flatMap((r) => r.failureModes), reports.length),
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

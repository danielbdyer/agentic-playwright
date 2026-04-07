/**
 * Pipeline Fitness Report and Scorecard types.
 *
 * The fitness report is the "gradient" of the self-improving speedrun loop:
 * it classifies why the pipeline succeeded or failed at each step, aggregated
 * into improvement signals that map to specific pipeline code locations.
 *
 * The scorecard is the "loss curve": a monotonically improving high-water-mark
 * of pipeline fidelity measured from clean-slate runs.
 */

import type { ResolutionPrecedenceRung } from '../resolution/precedence';
import type { StepWinningSource } from '../governance/workflow-types';

// ─── Pipeline Failure Classification ───

export type PipelineFailureClass =
  | 'translation-threshold-miss'      // correct match scored below threshold
  | 'translation-normalization-gap'   // tokenization missed a phrasing pattern
  | 'alias-coverage-gap'             // no alias existed but pattern was predictable
  | 'resolution-rung-skip'           // a rung could have won but didn't fire
  | 'scoring-weight-mismatch'        // bottleneck signal weight didn't match actual impact
  | 'recovery-strategy-miss'         // recovery tried wrong strategy first
  | 'convergence-stall'              // proposals generated but didn't improve hit rate
  | 'trust-policy-over-block';       // policy blocked a proposal that would have helped

export type PipelineImprovementTarget =
  | { readonly kind: 'translation'; readonly detail: string }
  | { readonly kind: 'scoring'; readonly detail: string }
  | { readonly kind: 'resolution'; readonly detail: string }
  | { readonly kind: 'recovery'; readonly detail: string }
  | { readonly kind: 'trust-policy'; readonly detail: string };

export interface PipelineFailureMode {
  readonly class: PipelineFailureClass;
  readonly count: number;
  readonly affectedSteps: number;
  readonly exampleIntents: readonly string[];
  readonly improvementTarget: PipelineImprovementTarget;
}

// ─── Resolution Rung Metrics ───

export interface RungRate {
  readonly rung: ResolutionPrecedenceRung;
  readonly wins: number;
  readonly rate: number;
}

// ─── Scoring Effectiveness ───

export interface BottleneckWeightCorrelation {
  readonly signal: string;
  readonly weight: number;
  readonly correlationWithImprovement: number;
}

export interface ScoringEffectiveness {
  readonly bottleneckWeightCorrelations: readonly BottleneckWeightCorrelation[];
  readonly proposalRankingAccuracy: number;
}

export type LogicalProofObligationName =
  | 'target-observability'
  | 'posture-separability'
  | 'affordance-recoverability'
  | 'surface-compressibility'
  | 'surface-predictability'
  | 'surface-repairability'
  | 'participatory-repairability'
  | 'memory-worthiness'
  | 'structural-legibility'
  | 'semantic-persistence'
  | 'dynamic-topology'
  | 'variance-factorability'
  | 'recoverability'
  | 'participatory-unresolvedness'
  | 'actor-chain-coherence'
  | 'compounding-economics'
  | 'meta-worthiness'
  | 'handoff-integrity'
  /** K0: given identical canon, two compilations produce byte-identical
   *  derived artifacts (modulo timestamps). The strongest single test of
   *  the doctrine's compiler-determinism claim. */
  | 'fingerprint-stability';

export type LogicalTheoremGroup = 'K' | 'L' | 'S' | 'D' | 'V' | 'R' | 'A' | 'H' | 'C' | 'M';
export type TheoremBaselineStatus = 'direct' | 'proxy' | 'missing';

export interface LogicalProofObligation {
  readonly obligation: LogicalProofObligationName;
  readonly propertyRefs: readonly LogicalTheoremGroup[];
  readonly score: number;
  readonly status: 'healthy' | 'watch' | 'critical';
  readonly evidence: string;
  /** How the obligation was measured. Phase 1 of the temporal-epistemic
   *  realization adds this so the theorem-baseline reducer can honestly
   *  classify K/L/S/C/M groups as `direct` only when the underlying
   *  obligation is genuinely measured (not heuristically derived). */
  readonly measurementClass?: 'direct' | 'heuristic-proxy' | 'derived';
}

export interface KnowledgeCoverageSummary {
  readonly totalElements: number;
  readonly totalScreens: number;
  readonly roleCoverageRate: number;
  readonly affordanceCoverageRate: number;
  readonly locatorCoverageRate: number;
  readonly postureCoverageRate: number;
  readonly routeScreenCoverageRate: number;
  readonly routeVariantCoverageRate: number;
}

export interface TheoremBaselineCoverage {
  readonly theoremGroup: LogicalTheoremGroup;
  readonly status: TheoremBaselineStatus;
  readonly measuredBy: readonly LogicalProofObligationName[];
  readonly rationale: string;
}

export interface TheoremBaselineSummary {
  readonly total: number;
  readonly byStatus: Readonly<Record<TheoremBaselineStatus, number>>;
  readonly direct: number;
  readonly proxy: number;
  readonly missing: number;
  readonly fullyBaselined: boolean;
  readonly directGroups: readonly LogicalTheoremGroup[];
  readonly proxyGroups: readonly LogicalTheoremGroup[];
  readonly missingGroups: readonly LogicalTheoremGroup[];
}

function theoremBaselineEntry(input: {
  theoremGroup: LogicalTheoremGroup;
  status: TheoremBaselineStatus;
  measuredBy: readonly LogicalProofObligationName[];
  rationale: string;
}): TheoremBaselineCoverage {
  return {
    theoremGroup: input.theoremGroup,
    status: input.status,
    measuredBy: input.measuredBy,
    rationale: input.rationale,
  };
}

export function theoremBaselineCoverageForNames(
  names: ReadonlySet<LogicalProofObligationName>,
): readonly TheoremBaselineCoverage[] {
  const hasTargetObservability = names.has('target-observability');
  const hasPostureSeparability = names.has('posture-separability');
  const hasAffordanceRecoverability = names.has('affordance-recoverability');
  const hasStructural = names.has('structural-legibility');
  const hasPersistence = names.has('semantic-persistence');
  const hasTopology = names.has('dynamic-topology');
  const hasVariance = names.has('variance-factorability');
  const hasRecoverability = names.has('recoverability');
  const hasParticipation = names.has('participatory-unresolvedness');
  const hasActorChain = names.has('actor-chain-coherence');
  const hasEconomics = names.has('compounding-economics');
  const hasSurfaceCompressibility = names.has('surface-compressibility');
  const hasSurfacePredictability = names.has('surface-predictability');
  const hasSurfaceRepairability = names.has('surface-repairability');
  const hasParticipatoryRepairability = names.has('participatory-repairability');
  const hasMemoryWorthiness = names.has('memory-worthiness');
  const hasMeta = names.has('meta-worthiness');
  const hasHandoff = names.has('handoff-integrity');
  const hasFingerprintStability = names.has('fingerprint-stability');

  return [
    theoremBaselineEntry({
      theoremGroup: 'K',
      // K is only `direct` when BOTH posture-separability AND
      // fingerprint-stability are present. Posture separability covers
      // the structural side (K1, K2); fingerprint stability covers the
      // determinism side (the doctrine's compiler-determinism claim).
      // Without both, K stays at `proxy`.
      status: hasPostureSeparability && hasFingerprintStability
        ? 'direct'
        : (hasPostureSeparability || hasFingerprintStability || hasStructural)
          ? 'proxy'
          : 'missing',
      measuredBy: [
        ...(hasPostureSeparability ? ['posture-separability' as const] : []),
        ...(hasFingerprintStability ? ['fingerprint-stability' as const] : []),
        ...(!hasPostureSeparability && !hasFingerprintStability && hasStructural ? ['structural-legibility' as const] : []),
      ],
      rationale: hasPostureSeparability && hasFingerprintStability
        ? 'Kernel properties have BOTH a posture-separability obligation (structural side) AND a fingerprint-stability obligation (determinism side). K1+K2 (canonical target continuity) and the compiler-determinism doctrine are both directly measured.'
        : hasPostureSeparability
          ? 'Kernel structural side is direct via posture-separability, but fingerprint-stability (the determinism side) is not yet measured. K is therefore proxy until both are present.'
          : hasFingerprintStability
            ? 'Kernel determinism side is direct via fingerprint-stability, but posture-separability is missing. K stays proxy until both are present.'
            : hasStructural
              ? 'Kernel continuity is inferred through structural-legibility proxies such as ambiguity, translation precision, and fallback reliance.'
              : 'No live kernel obligation is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'L',
      status: hasTargetObservability ? 'direct' : hasStructural ? 'proxy' : 'missing',
      measuredBy: [
        ...(hasTargetObservability ? ['target-observability' as const] : []),
        ...(!hasTargetObservability && hasStructural ? ['structural-legibility' as const] : []),
      ],
      rationale: hasTargetObservability
        ? 'Legibility now has a dedicated observability obligation backed by first-pass target access, fallback pressure, and degraded locator signals.'
        : hasStructural
          ? 'Legibility is tracked indirectly via the structural-legibility obligation, not by separate theorem-specific observability counters.'
          : 'No live legibility baseline is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'S',
      status: hasAffordanceRecoverability ? 'direct' : hasStructural ? 'proxy' : 'missing',
      measuredBy: [
        ...(hasAffordanceRecoverability ? ['affordance-recoverability' as const] : []),
        ...(!hasAffordanceRecoverability && hasStructural ? ['structural-legibility' as const] : []),
      ],
      rationale: hasAffordanceRecoverability
        ? 'Surface semantics now have a dedicated affordance-recoverability obligation backed by role, affordance, locator, and ambiguity signals.'
        : hasStructural
          ? 'Semantic persistence at the target/evidence layer is still inferred from broader structural-legibility signals.'
          : 'No live semantic persistence proxy is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'D',
      status: hasTopology ? 'direct' : 'missing',
      measuredBy: hasTopology ? ['dynamic-topology'] : [],
      rationale: hasTopology
        ? 'Dynamic topology has a dedicated obligation backed by route mismatch, suspension, and bounded-topology runtime signals.'
        : 'No dedicated dynamic-topology obligation is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'V',
      status: hasVariance ? 'direct' : 'missing',
      measuredBy: hasVariance ? ['variance-factorability'] : [],
      rationale: hasVariance
        ? 'Structured variance now has a dedicated factorability obligation backed by overlay reuse and variation-stress signals.'
        : 'Structured variance and overlay factorability still lack a dedicated baseline; current signals do not directly measure role/data/phase factorization.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'R',
      status: hasRecoverability ? 'direct' : hasPersistence || hasTopology ? 'proxy' : 'missing',
      measuredBy: [
        ...(hasRecoverability ? ['recoverability' as const] : []),
        ...(hasPersistence ? ['semantic-persistence' as const] : []),
        ...(hasTopology ? ['dynamic-topology' as const] : []),
      ],
      rationale: hasRecoverability
        ? 'Recoverability now has a dedicated obligation backed by recovery success, drift pressure, and bounded repair signals.'
        : hasPersistence || hasTopology
          ? 'Recoverability is inferred from persistence, topology, and recovery signals rather than directly measured as drift-locality proof.'
          : 'No recoverability proxy is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'A',
      status: hasActorChain ? 'direct' : hasParticipation || hasHandoff ? 'proxy' : 'missing',
      measuredBy: [
        ...(hasActorChain ? ['actor-chain-coherence' as const] : []),
        ...(hasParticipation ? ['participatory-unresolvedness' as const] : []),
        ...(hasHandoff ? ['handoff-integrity' as const] : []),
      ],
      rationale: hasActorChain
        ? 'Participatory agency now has a dedicated actor-chain coherence obligation covering semantic-core preservation, drift detectability, continuation gradient, and competing-candidate preservation.'
        : hasParticipation || hasHandoff
          ? 'Participatory agency is visible through unresolvedness and handoff integrity, but cross-actor substitutability and deterministic leverage are still only partially direct.'
          : 'No participatory-unresolvedness baseline is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'H',
      status: hasHandoff ? 'direct' : 'missing',
      measuredBy: hasHandoff
        ? [
          'handoff-integrity',
          ...(hasActorChain ? ['actor-chain-coherence' as const] : []),
        ]
        : [],
      rationale: hasHandoff
        ? 'Inter-actor handoff integrity has a dedicated measured obligation covering status, semantic core, staleness, next moves, token impact, and chain completeness.'
        : 'No dedicated handoff-integrity measurement is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'C',
      status: hasEconomics ? 'direct' : 'missing',
      measuredBy: hasEconomics ? ['compounding-economics'] : [],
      rationale: hasEconomics
        ? 'Compounding economics has a dedicated obligation tied to hit-rate, proposal yield, and degradation signals.'
        : 'No dedicated compounding-economics obligation is available yet.',
    }),
    theoremBaselineEntry({
      theoremGroup: 'M',
      status: hasSurfaceCompressibility
        && hasSurfacePredictability
        && hasSurfaceRepairability
        && hasParticipatoryRepairability
        && hasMemoryWorthiness
        ? 'direct'
        : hasMeta || hasEconomics
          ? 'proxy'
          : 'missing',
      measuredBy: [
        ...(hasSurfaceCompressibility ? ['surface-compressibility' as const] : []),
        ...(hasSurfacePredictability ? ['surface-predictability' as const] : []),
        ...(hasSurfaceRepairability ? ['surface-repairability' as const] : []),
        ...(hasParticipatoryRepairability ? ['participatory-repairability' as const] : []),
        ...(hasMemoryWorthiness ? ['memory-worthiness' as const] : []),
        ...(hasMeta ? ['meta-worthiness' as const] : []),
        ...(!hasMeta && hasEconomics ? ['compounding-economics' as const] : []),
      ],
      rationale: hasSurfaceCompressibility
        && hasSurfacePredictability
        && hasSurfaceRepairability
        && hasParticipatoryRepairability
        && hasMemoryWorthiness
        ? 'Meta-properties now have dedicated obligations for compressibility, predictability, repairability, participatory repairability, and memory worthiness.'
        : hasMeta
          ? 'Meta-properties are tracked through a dedicated meta-worthiness obligation, but still summarize several theorem families rather than baselining each meta-property separately.'
        : hasEconomics
          ? 'Meta-worthiness is only weakly proxied by economic compounding until the dedicated meta obligation is present.'
          : 'No meta-worthiness baseline is available yet.',
    }),
  ];
}

export function theoremBaselineCoverageForObligations(
  obligations: readonly Pick<LogicalProofObligation, 'obligation' | 'measurementClass'>[],
): readonly TheoremBaselineCoverage[] {
  // Phase 1.7 honesty fix: previously every obligation that existed would
  // graduate its theorem group to `direct` regardless of whether the
  // underlying measurement was real or a hand-weighted heuristic. The
  // reducer now distinguishes those two regimes by reading
  // `measurementClass`.
  //
  // Algorithm:
  //   1. directNames = obligations with measurementClass === 'direct' (or
  //      undefined, for legacy backwards compat).
  //   2. allNames    = every obligation present (direct + heuristic).
  //   3. For each theorem group, take the direct view first. If the
  //      direct view says `direct`, the group is direct. Otherwise fall
  //      back to the all-view, which graduates the group to `proxy` for
  //      heuristic-only coverage.
  const directNames = new Set(
    obligations
      .filter((obligation) =>
        obligation.measurementClass === undefined || obligation.measurementClass === 'direct',
      )
      .map((obligation) => obligation.obligation),
  );
  const allNames = new Set(obligations.map((obligation) => obligation.obligation));
  const directView = theoremBaselineCoverageForNames(directNames);
  const allView = theoremBaselineCoverageForNames(allNames);
  return directView.map((direct, index) => {
    if (direct.status === 'direct') return direct;
    const proxy = allView[index]!;
    // Take the proxy view's status, but only if it's at least proxy
    // (not missing). If the proxy view is also missing, return missing.
    if (proxy.status === 'direct') {
      // The proxy view says direct because the obligation name is present,
      // but it's heuristic — demote to proxy.
      return { ...proxy, status: 'proxy' as TheoremBaselineStatus };
    }
    return proxy;
  });
}

/** Variant that returns BOTH direct-graduated and heuristic-proxy
 *  classifications. Useful for dashboards that want to show "what's
 *  measured" alongside "what's heuristically inferred". */
export function theoremBaselineCoverageForObligationsWithProxies(
  obligations: readonly Pick<LogicalProofObligation, 'obligation' | 'measurementClass'>[],
): readonly TheoremBaselineCoverage[] {
  return theoremBaselineCoverageForNames(new Set(obligations.map((obligation) => obligation.obligation)));
}

export function summarizeTheoremBaseline(
  entries: readonly TheoremBaselineCoverage[],
): TheoremBaselineSummary {
  const byStatus = entries.reduce<Record<TheoremBaselineStatus, number>>((acc, entry) => ({
    ...acc,
    [entry.status]: acc[entry.status] + 1,
  }), { direct: 0, proxy: 0, missing: 0 });
  return {
    total: entries.length,
    byStatus,
    direct: byStatus.direct,
    proxy: byStatus.proxy,
    missing: byStatus.missing,
    fullyBaselined: byStatus.proxy === 0 && byStatus.missing === 0,
    directGroups: entries.filter((entry) => entry.status === 'direct').map((entry) => entry.theoremGroup),
    proxyGroups: entries.filter((entry) => entry.status === 'proxy').map((entry) => entry.theoremGroup),
    missingGroups: entries.filter((entry) => entry.status === 'missing').map((entry) => entry.theoremGroup),
  };
}

// ─── Pipeline Fitness Report ───

export interface PipelineFitnessMetrics {
  /** Operational `MemoryMaturity(τ)` from the temporal-epistemic addendum.
   *  log2(1 + |approved knowledge entries|). Used by C-family obligations
   *  to determine cohort comparability and compounding direction. */
  readonly memoryMaturity?: number | undefined;
  /** Raw entry count behind `memoryMaturity`. Surfaced alongside the
   *  log-scale value so dashboards can show both. */
  readonly memoryMaturityEntries?: number | undefined;
  readonly effectiveHitRate?: number | undefined;
  readonly knowledgeHitRate: number;
  readonly ambiguityRate?: number | undefined;
  readonly suspensionRate?: number | undefined;
  readonly agentFallbackRate?: number | undefined;
  readonly liveDomFallbackRate?: number | undefined;
  readonly routeMismatchRate?: number | undefined;
  readonly proposalCategoryCounts?: Readonly<Record<string, number>> | undefined;
  readonly winningSourceDistribution?: readonly {
    readonly source: StepWinningSource;
    readonly count: number;
    readonly rate: number;
  }[] | undefined;
  readonly proofObligations?: readonly LogicalProofObligation[] | undefined;
  readonly knowledgeCoverage?: KnowledgeCoverageSummary | undefined;
  readonly translationPrecision: number;
  readonly translationRecall: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
  readonly resolutionByRung: readonly RungRate[];
  readonly degradedLocatorRate: number;
  readonly recoverySuccessRate: number;
  /** Execution health from intelligence modules — present when learning signals are available. */
  readonly executionHealth?: {
    readonly compositeScore: number;
    readonly dimensions: readonly { readonly name: string; readonly value: number; readonly status: string }[];
  } | undefined;
}

export interface PipelineFitnessReport {
  readonly kind: 'pipeline-fitness-report';
  readonly version: 1;
  readonly pipelineVersion: string;
  readonly runAt: string;
  readonly baseline: true;
  readonly metrics: PipelineFitnessMetrics;
  readonly failureModes: readonly PipelineFailureMode[];
  readonly scoringEffectiveness: ScoringEffectiveness;
}

// ─── Pipeline Scorecard (committed to git) ───

export interface ScorecardHighWaterMark {
  readonly setAt: string;
  readonly pipelineVersion: string;
  readonly effectiveHitRate?: number | undefined;
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
  readonly proofObligations?: readonly LogicalProofObligation[] | undefined;
  readonly theoremBaselineSummary?: TheoremBaselineSummary | undefined;
  readonly resolutionByRung: readonly RungRate[];
  /** Execution health score at the time of high-water mark. */
  readonly executionHealthScore?: number | undefined;
  /** Operational `MemoryMaturity(τ)` from the temporal-epistemic addendum.
   *  log2(1 + |approved knowledge entries|). Used by C-family obligations
   *  to determine cohort comparability and compounding direction. */
  readonly memoryMaturity?: number | undefined;
  /** Raw entry count behind `memoryMaturity`. Surfaced alongside the
   *  log-scale value so dashboards can show both. */
  readonly memoryMaturityEntries?: number | undefined;
}

export interface ScorecardHistoryEntry {
  readonly runAt: string;
  readonly pipelineVersion: string;
  readonly effectiveHitRate?: number | undefined;
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly theoremBaselineSummary?: TheoremBaselineSummary | undefined;
  readonly improved: boolean;
  /** Operational `MemoryMaturity(τ)` at the time of this entry. */
  readonly memoryMaturity?: number | undefined;
  readonly memoryMaturityEntries?: number | undefined;
}

// ─── Pareto Frontier ───

export interface ParetoObjectives {
  readonly effectiveHitRate?: number | undefined;
  readonly knowledgeHitRate: number;
  readonly translationPrecision: number;
  readonly convergenceVelocity: number;
  readonly proposalYield: number;
}

export interface ParetoFrontierEntry {
  readonly pipelineVersion: string;
  readonly addedAt: string;
  readonly objectives: ParetoObjectives;
}

/**
 * Pareto dominance: a dominates b iff a is >= b on ALL objectives and strictly > on at least one.
 * convergenceVelocity is inverted (lower = better).
 */
export function paretoDominates(a: ParetoObjectives, b: ParetoObjectives): boolean {
  const aEffective = a.effectiveHitRate ?? a.knowledgeHitRate;
  const bEffective = b.effectiveHitRate ?? b.knowledgeHitRate;
  const pairs: readonly [number, number][] = [
    [aEffective, bEffective],
    [a.translationPrecision, b.translationPrecision],
    [-a.convergenceVelocity, -b.convergenceVelocity], // invert: fewer iterations = better
    [a.proposalYield, b.proposalYield],
  ];
  const allGte = pairs.every(([av, bv]) => av >= bv);
  const someGt = pairs.some(([av, bv]) => av > bv);
  return allGte && someGt;
}

/**
 * Check if a new entry would be accepted by the Pareto frontier.
 * Accepted iff no existing frontier entry Pareto-dominates the candidate.
 */
export function isAcceptedByParetoFrontier(
  frontier: readonly ParetoFrontierEntry[],
  candidate: ParetoObjectives,
): boolean {
  return !frontier.some((entry) => paretoDominates(entry.objectives, candidate));
}

/**
 * Add a new entry to the Pareto frontier, pruning dominated entries.
 */
export function addToParetoFrontier(
  frontier: readonly ParetoFrontierEntry[],
  entry: ParetoFrontierEntry,
): readonly ParetoFrontierEntry[] {
  // Remove entries dominated by the new one
  const surviving = frontier.filter((existing) => !paretoDominates(entry.objectives, existing.objectives));
  return [...surviving, entry];
}

export function objectivesFromMetrics(metrics: PipelineFitnessMetrics): ParetoObjectives {
  return {
    effectiveHitRate: metrics.effectiveHitRate ?? metrics.knowledgeHitRate,
    knowledgeHitRate: metrics.knowledgeHitRate,
    translationPrecision: metrics.translationPrecision,
    convergenceVelocity: metrics.convergenceVelocity,
    proposalYield: metrics.proposalYield,
  };
}

// ─── Pipeline Scorecard (committed to git) ───

export interface PipelineScorecard {
  readonly kind: 'pipeline-scorecard';
  readonly version: 1;
  readonly highWaterMark: ScorecardHighWaterMark;
  readonly history: readonly ScorecardHistoryEntry[];
  readonly paretoFrontier?: readonly ParetoFrontierEntry[];
}

// ─── Generalization Metrics (held-out validation) ───

/** Metrics comparing training and validation performance to detect overfitting.
 *  The generalization gap is the difference between training and held-out hit rates.
 *  A small gap (< 0.15) indicates genuine improvement; a large gap indicates memorization. */
export interface GeneralizationMetrics {
  readonly kind: 'generalization-metrics';
  readonly version: 1;
  readonly trainingMetrics: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly convergenceVelocity: number;
    readonly proposalYield: number;
    readonly degradedLocatorRate: number;
  };
  readonly validationMetrics: {
    readonly knowledgeHitRate: number;
    readonly translationPrecision: number;
    readonly degradedLocatorRate: number;
  };
  readonly gaps: {
    readonly hitRateGap: number;
    readonly precisionGap: number;
    readonly degradationGap: number;
  };
  readonly passes: {
    readonly noOverfitting: boolean;
    readonly validationSignificant: boolean;
    readonly robustness: boolean;
  };
  readonly verdict: 'pass' | 'warn' | 'fail';
}

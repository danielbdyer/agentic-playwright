import { Effect, Either, Schema } from 'effect';
import { loadWorkspaceCatalog } from '../catalog';
import { runScenarioSelection } from '../commitment/run';
import type { ProjectPaths } from '../paths';
import {
  benchmarkImprovementProjectionPath,
  benchmarkDogfoodRunPath,
  benchmarkScorecardJsonPath,
  benchmarkScorecardMarkdownPath,
  benchmarkVariantsReviewPath,
  benchmarkVariantsSpecPath,
  benchmarkVariantsTracePath,
  relativeProjectPath,
} from '../paths';
import { resolveEffectConcurrency } from '../runtime-support/concurrency';
import { ExecutionContext, FileSystem } from '../ports';
import { TesseractError } from '../../domain/kernel/errors';
import { groupBy, uniqueSorted } from '../../domain/kernel/collections';
import { WINNING_SOURCE_TO_RUNG } from '../../domain/kernel/visitors';
import { concatAll } from '../../domain/algebra/monoid';
import { numberRecordSumMonoid, structMonoid, sumMonoid } from '../../domain/algebra/envelope-mergers';
import type { InterpretationDriftRecord, ProposalBundle } from '../../domain/execution/types';
import type { LogicalProofObligation } from '../../domain/fitness/types';
import type { ImprovementRun } from '../../domain/improvement/types';
import type { LearningScorecard } from '../../domain/learning/types';
import type {
  BenchmarkContext,
  BenchmarkImprovementProjection,
  BenchmarkScorecard,
  DogfoodRun,
  ImprovementProjectionSummary,
} from '../../domain/projection/types';
import { resolutionPrecedenceLaw, type ResolutionPrecedenceRung } from '../../domain/resolution/precedence';
import { createAdoId } from '../../domain/kernel/identity';
import { decodeUnknownEither } from '../../domain/schemas/decode';
import { summarizeKnowledgeCoverage } from './knowledge-coverage';

const decodeScenarioIds = decodeUnknownEither(
  Schema.Array(Schema.String),
);



type TimingTotals = {
  setup: number;
  resolution: number;
  action: number;
  assertion: number;
  retries: number;
  teardown: number;
  total: number;
};

const timingTotalsMonoid = structMonoid<TimingTotals>({
  setup: sumMonoid,
  resolution: sumMonoid,
  action: sumMonoid,
  assertion: sumMonoid,
  retries: sumMonoid,
  teardown: sumMonoid,
  total: sumMonoid,
});

type ExecutionCostTotals = {
  instructionCount: number;
  diagnosticCount: number;
};

const executionCostTotalsMonoid = structMonoid<ExecutionCostTotals>({
  instructionCount: sumMonoid,
  diagnosticCount: sumMonoid,
});

interface BenchmarkVariant {
  id: string;
  fieldId: string;
  screen: string;
  element: string;
  posture: string;
  sourceRuleIndex: number;
}

interface BenchmarkRunbookSelection {
  readonly runbook: string;
  readonly tag?: string | null | undefined;
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function averageNumbers(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1);
}

function benchmarkByName(benchmarks: readonly BenchmarkContext[], name: string): BenchmarkContext {
  const benchmark = benchmarks.find((entry) => entry.name === name) ?? null;
  if (!benchmark) {
    throw new TesseractError('missing-required', `Unknown benchmark ${name}`);
  }
  return benchmark;
}

function variantsForBenchmark(benchmark: BenchmarkContext): BenchmarkVariant[] {
  return benchmark.expansionRules.flatMap((rule, ruleIndex) =>
    rule.fieldIds.flatMap((fieldId) => {
      const field = benchmark.fieldCatalog.find((entry) => entry.id === fieldId) ?? null;
      if (!field) {
        return [];
      }
      return rule.postures.flatMap((posture) =>
        Array.from({ length: rule.variantsPerField }).map((_, variantIndex) => ({
          id: `${fieldId}-${posture}-${variantIndex + 1}`,
          fieldId,
          screen: field.screen,
          element: field.element,
          posture,
          sourceRuleIndex: ruleIndex,
        })),
      );
    }),
  );
}

function proposalsForScenarios(bundles: readonly ProposalBundle[], scenarioIds: readonly string[]): ProposalBundle[] {
  return bundles.filter((bundle) => scenarioIds.includes(bundle.payload.adoId));
}

export function collectRunbookScenarioIds<R>(options: {
  readonly runbooks: readonly BenchmarkRunbookSelection[];
  readonly concurrency: number;
  readonly selectRunbook: (runbook: BenchmarkRunbookSelection) => Effect.Effect<readonly string[], unknown, R>;
}): Effect.Effect<string[], unknown, R> {
  return Effect.gen(function* () {
    const selections = yield* Effect.forEach(options.runbooks, options.selectRunbook, {
      concurrency: options.concurrency,
    });
    return uniqueSorted(selections.flatMap((selection) => selection));
  });
}

function knowledgeChurnForBundles(bundles: readonly ProposalBundle[]): Record<string, number> {
  const grouped = groupBy(
    bundles.flatMap((bundle) => bundle.payload.proposals),
    (proposal) => proposal.artifactType,
  );
  return Object.fromEntries(
    Object.entries(grouped).map(([artifactType, proposals]) => [artifactType, proposals.length]),
  );
}

function proposalCategoryCountsForBundles(bundles: readonly ProposalBundle[]): Record<string, number> {
  return bundles
    .flatMap((bundle) => bundle.payload.proposals)
    .reduce<Record<string, number>>((acc, proposal) => ({
      ...acc,
      [proposal.category ?? 'uncategorized']: (acc[proposal.category ?? 'uncategorized'] ?? 0) + 1,
    }), {});
}

function rate(count: number, total: number): number {
  return round(count / Math.max(total, 1));
}

function recordTotal(record: Readonly<Record<string, number>>): number {
  return Object.values(record).reduce((sum, value) => sum + value, 0);
}

function recordKeyCount(record: Readonly<Record<string, number>>): number {
  return Object.keys(record).length;
}

function isExecutionSuccess(status: string): boolean {
  return status === 'ok' || status === 'passed';
}

const EFFECTIVE_HIT_MAX_RUNG_INDEX = 5;

function rungForWinningSource(source: string): ResolutionPrecedenceRung {
  return (WINNING_SOURCE_TO_RUNG[source as keyof typeof WINNING_SOURCE_TO_RUNG]
    ?? 'needs-human') as ResolutionPrecedenceRung;
}

function isEffectiveHit(step: {
  winningSource: string;
  executionStatus: string;
  degraded: boolean;
}): boolean {
  if (!isExecutionSuccess(step.executionStatus) || step.degraded) {
    return false;
  }
  const rungIndex = resolutionPrecedenceLaw.indexOf(rungForWinningSource(step.winningSource));
  return rungIndex >= 0 && rungIndex <= EFFECTIVE_HIT_MAX_RUNG_INDEX;
}

function winningSourceDistribution(steps: readonly {
  winningSource: string;
}[]): NonNullable<BenchmarkScorecard['winningSourceDistribution']> {
  // Phase 2.4 Big-O fix: O(N²) → O(N). See fitness.ts:winningSourceDistribution
  // for the rationale.
  const total = Math.max(steps.length, 1);
  const counts = new Map<string, number>();
  for (const step of steps) {
    counts.set(step.winningSource, (counts.get(step.winningSource) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([source, count]) => ({
      source: source as NonNullable<BenchmarkScorecard['winningSourceDistribution']>[number]['source'],
      count,
      rate: round(count / total),
    }));
}

function benchmarkFalsifierSignals(input: {
  effectiveHitRate: number;
  ambiguityRate: number;
  suspensionRate: number;
  routeMismatchRate: number;
  degradedLocatorRate: number;
  interpretationDriftHotspotCount: number;
  overlayChurn: number;
  operatorTouchCount: number;
  repairLoopCount: number;
  approvedEquivalentCount: number;
}): NonNullable<BenchmarkScorecard['falsifierSignals']> {
  const semanticScore = Math.max(
    input.degradedLocatorRate,
    input.interpretationDriftHotspotCount > 0 ? 0.35 : 0,
    input.overlayChurn > 0 ? 0.2 : 0,
  );
  const behavioralScore = Math.max(input.suspensionRate, input.routeMismatchRate);
  const opaqueSuspensionScore = Math.max(input.ambiguityRate, input.suspensionRate);
  const economicScore = 1 - input.effectiveHitRate;
  const inertInterventionScore = input.repairLoopCount === 0 && input.operatorTouchCount === 0
    ? 0
    : input.effectiveHitRate < 0.5 && input.approvedEquivalentCount === 0
      ? 0.85
      : input.effectiveHitRate < 0.7
        ? 0.45
        : 0.15;

  const signalStatus = (score: number): 'healthy' | 'watch' | 'critical' =>
    score >= 0.7 ? 'critical' : score >= 0.3 ? 'watch' : 'healthy';

  return [
    {
      name: 'semantic-non-persistence',
      status: signalStatus(semanticScore),
      evidence: `degradedLocatorRate=${input.degradedLocatorRate}, interpretationDriftHotspots=${input.interpretationDriftHotspotCount}, overlayChurn=${input.overlayChurn}`,
    },
    {
      name: 'behavioral-non-boundedness',
      status: signalStatus(behavioralScore),
      evidence: `suspensionRate=${input.suspensionRate}, routeMismatchRate=${input.routeMismatchRate}`,
    },
    {
      name: 'opaque-suspension',
      status: signalStatus(opaqueSuspensionScore),
      evidence: `ambiguityRate=${input.ambiguityRate}, suspensionRate=${input.suspensionRate}`,
    },
    {
      name: 'economic-flatness',
      status: signalStatus(economicScore),
      evidence: `effectiveHitRate=${input.effectiveHitRate}, operatorTouchCount=${input.operatorTouchCount}, repairLoopCount=${input.repairLoopCount}`,
    },
    {
      name: 'inert-intervention',
      status: signalStatus(inertInterventionScore),
      evidence: `operatorTouchCount=${input.operatorTouchCount}, repairLoopCount=${input.repairLoopCount}, approvedEquivalentCount=${input.approvedEquivalentCount}, effectiveHitRate=${input.effectiveHitRate}`,
    },
  ];
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
  const normalizedRisk = Math.max(0, Math.min(1, input.risk));
  return {
    obligation: input.obligation,
    propertyRefs: input.propertyRefs,
    score: round(1 - normalizedRisk),
    status: proofStatusFromRisk(normalizedRisk),
    evidence: input.evidence,
    // Phase 1.7 honesty: see comment in fitness.ts:proofObligation.
    measurementClass: 'heuristic-proxy',
  };
}

function benchmarkProofObligations(input: {
  knowledgeCoverage: import('../../domain/fitness/types').KnowledgeCoverageSummary;
  firstPassScreenResolutionRate: number;
  firstPassElementResolutionRate: number;
  effectiveHitRate: number;
  ambiguityRate: number;
  suspensionRate: number;
  agentFallbackRate: number;
  liveDomFallbackRate: number;
  routeMismatchRate: number;
  degradedLocatorRate: number;
  translationHitRate: number;
  repairLoopCount: number;
  reviewRequiredCount: number;
  approvedEquivalentCount: number;
  operatorTouchCount: number;
  interpretationDriftHotspotCount: number;
  overlayChurn: number;
  thinKnowledgeScreenCount: number;
  totalScreens: number;
  totalSteps: number;
  recoveryFamilies: Readonly<Record<string, number>>;
  recoveryStrategies: Readonly<Record<string, number>>;
}): readonly LogicalProofObligation[] {
  const postureSeparabilityRisk = Math.max(
    1 - input.knowledgeCoverage.postureCoverageRate,
    1 - input.knowledgeCoverage.routeScreenCoverageRate,
    1 - input.knowledgeCoverage.routeVariantCoverageRate,
    input.suspensionRate,
    input.ambiguityRate * 0.75,
  );
  const affordanceRecoverabilityRisk = Math.max(
    1 - input.knowledgeCoverage.roleCoverageRate,
    1 - input.knowledgeCoverage.affordanceCoverageRate,
    1 - input.knowledgeCoverage.locatorCoverageRate,
    input.degradedLocatorRate,
    input.ambiguityRate,
  );
  const targetObservabilityRisk = Math.max(
    1 - input.firstPassScreenResolutionRate,
    1 - input.firstPassElementResolutionRate,
    input.degradedLocatorRate,
    input.liveDomFallbackRate,
  );
  const structuralRisk = Math.max(targetObservabilityRisk, 1 - input.translationHitRate, input.ambiguityRate);
  const persistenceRisk = Math.max(
    input.degradedLocatorRate,
    input.interpretationDriftHotspotCount > 0 ? 0.5 : 0,
    Math.min(1, input.overlayChurn / 5),
  );
  const topologyRisk = Math.max(
    input.routeMismatchRate,
    input.suspensionRate,
    input.totalScreens > 0 ? input.thinKnowledgeScreenCount / input.totalScreens : 0,
  );
  const approvedEquivalentRate = rate(input.approvedEquivalentCount, input.totalSteps);
  const factorabilityReuseGap = Math.max(0, Math.min(1, (0.35 - approvedEquivalentRate) / 0.35));
  const factorabilityStress = Math.max(
    input.routeMismatchRate,
    input.ambiguityRate,
    input.totalScreens > 0 ? input.thinKnowledgeScreenCount / input.totalScreens : 0,
    input.totalScreens > 0 ? Math.min(1, input.overlayChurn / input.totalScreens) : 0,
  );
  const factorabilityRisk = Math.max(0, Math.min(1, round(factorabilityStress * 0.7 + factorabilityReuseGap * 0.3)));
  const recoveryFamilyTotal = recordTotal(input.recoveryFamilies);
  const recoveryStrategyTotal = recordTotal(input.recoveryStrategies);
  const recoveryFamilyKinds = recordKeyCount(input.recoveryFamilies);
  const recoveryStrategyKinds = recordKeyCount(input.recoveryStrategies);
  const recoveryCoverage = (
    input.repairLoopCount === 0
    && input.interpretationDriftHotspotCount === 0
    && input.routeMismatchRate === 0
  )
    ? 1
    : Math.min(
      1,
      (recoveryFamilyTotal + recoveryStrategyTotal + recoveryFamilyKinds + recoveryStrategyKinds)
      / Math.max(input.repairLoopCount + input.interpretationDriftHotspotCount, 1),
  );
  const recoverabilityRisk = Math.max(
    input.degradedLocatorRate,
    input.routeMismatchRate,
    input.interpretationDriftHotspotCount > 0 ? 0.35 : 0,
    1 - recoveryCoverage,
  );
  const participationRisk = Math.max(
    input.repairLoopCount > 0 ? input.reviewRequiredCount / Math.max(input.repairLoopCount, 1) : 0,
    input.repairLoopCount > 0 && input.approvedEquivalentCount === 0 ? 0.75 : 0.15,
    input.operatorTouchCount > 0 && input.effectiveHitRate < 0.7 ? 0.5 : 0.15,
  );
  const economicsRisk = Math.max(1 - input.effectiveHitRate, input.agentFallbackRate, input.degradedLocatorRate);
  const coverageShare = round(averageNumbers([
    input.knowledgeCoverage.roleCoverageRate,
    input.knowledgeCoverage.affordanceCoverageRate,
    input.knowledgeCoverage.locatorCoverageRate,
    input.knowledgeCoverage.postureCoverageRate,
    input.knowledgeCoverage.routeScreenCoverageRate,
    input.knowledgeCoverage.routeVariantCoverageRate,
  ]));
  const surfaceCompressibilityRisk = Math.max(
    1 - coverageShare,
    1 - input.translationHitRate,
    1 - input.firstPassElementResolutionRate,
    input.totalScreens > 0 ? input.thinKnowledgeScreenCount / input.totalScreens : 0,
    input.ambiguityRate * 0.75,
  );
  const surfacePredictabilityRisk = Math.max(
    input.routeMismatchRate,
    input.suspensionRate,
    input.liveDomFallbackRate,
    input.agentFallbackRate * 0.5,
    input.interpretationDriftHotspotCount > 0 ? 0.35 : 0,
  );
  const surfaceRepairabilityRisk = Math.max(
    input.degradedLocatorRate,
    1 - recoveryCoverage,
    input.interpretationDriftHotspotCount > 0 ? 0.35 : 0,
    input.totalScreens > 0 ? Math.min(1, input.overlayChurn / input.totalScreens) : 0,
  );
  const reviewPressure = input.repairLoopCount > 0
    ? input.reviewRequiredCount / Math.max(input.repairLoopCount, 1)
    : 0;
  const operatorPressure = input.totalSteps > 0
    ? Math.min(1, input.operatorTouchCount / input.totalSteps * 2)
    : 0;
  const approvedEquivalentReuse = input.repairLoopCount > 0
    ? Math.min(1, input.approvedEquivalentCount / Math.max(input.repairLoopCount, 1))
    : 1;
  const participatoryRepairabilityRisk = Math.max(
    reviewPressure,
    operatorPressure,
    1 - approvedEquivalentReuse,
    input.agentFallbackRate,
  );
  const memoryReuseGap = Math.max(0, Math.min(1, (0.35 - approvedEquivalentRate) / 0.35));
  const memoryWorthinessRisk = round(
    surfaceCompressibilityRisk * 0.2
    + surfacePredictabilityRisk * 0.15
    + surfaceRepairabilityRisk * 0.15
    + participatoryRepairabilityRisk * 0.15
    + economicsRisk * 0.2
    + memoryReuseGap * 0.15,
  );
  const metaRisk = round(averageNumbers([
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
      evidence: `firstPassScreenResolutionRate=${input.firstPassScreenResolutionRate}, firstPassElementResolutionRate=${input.firstPassElementResolutionRate}, degradedLocatorRate=${input.degradedLocatorRate}, liveDomFallbackRate=${input.liveDomFallbackRate}`,
    }),
    proofObligation({
      obligation: 'posture-separability',
      propertyRefs: ['K'],
      risk: postureSeparabilityRisk,
      evidence: `postureCoverageRate=${input.knowledgeCoverage.postureCoverageRate}, routeScreenCoverageRate=${input.knowledgeCoverage.routeScreenCoverageRate}, routeVariantCoverageRate=${input.knowledgeCoverage.routeVariantCoverageRate}, suspensionRate=${input.suspensionRate}, ambiguityRate=${input.ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'affordance-recoverability',
      propertyRefs: ['S'],
      risk: affordanceRecoverabilityRisk,
      evidence: `roleCoverageRate=${input.knowledgeCoverage.roleCoverageRate}, affordanceCoverageRate=${input.knowledgeCoverage.affordanceCoverageRate}, locatorCoverageRate=${input.knowledgeCoverage.locatorCoverageRate}, degradedLocatorRate=${input.degradedLocatorRate}, ambiguityRate=${input.ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'structural-legibility',
      propertyRefs: ['K', 'L', 'S'],
      risk: structuralRisk,
      evidence: `targetObservabilityRisk=${targetObservabilityRisk}, translationHitRate=${input.translationHitRate}, ambiguityRate=${input.ambiguityRate}, liveDomFallbackRate=${input.liveDomFallbackRate}`,
    }),
    proofObligation({
      obligation: 'semantic-persistence',
      propertyRefs: ['K', 'V', 'R'],
      risk: persistenceRisk,
      evidence: `degradedLocatorRate=${input.degradedLocatorRate}, interpretationDriftHotspots=${input.interpretationDriftHotspotCount}, overlayChurn=${input.overlayChurn}`,
    }),
    proofObligation({
      obligation: 'dynamic-topology',
      propertyRefs: ['D'],
      risk: topologyRisk,
      evidence: `routeMismatchRate=${input.routeMismatchRate}, suspensionRate=${input.suspensionRate}, thinKnowledgeScreenCount=${input.thinKnowledgeScreenCount}`,
    }),
    proofObligation({
      obligation: 'variance-factorability',
      propertyRefs: ['V'],
      risk: factorabilityRisk,
      evidence: `approvedEquivalentRate=${approvedEquivalentRate}, thinKnowledgeScreenCount=${input.thinKnowledgeScreenCount}, overlayChurn=${input.overlayChurn}, routeMismatchRate=${input.routeMismatchRate}, ambiguityRate=${input.ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'recoverability',
      propertyRefs: ['R'],
      risk: recoverabilityRisk,
      evidence: `recoveryFamilies=${recoveryFamilyKinds}/${recoveryFamilyTotal}, recoveryStrategies=${recoveryStrategyKinds}/${recoveryStrategyTotal}, interpretationDriftHotspots=${input.interpretationDriftHotspotCount}, degradedLocatorRate=${input.degradedLocatorRate}, routeMismatchRate=${input.routeMismatchRate}`,
    }),
    proofObligation({
      obligation: 'participatory-unresolvedness',
      propertyRefs: ['A'],
      risk: participationRisk,
      evidence: `repairLoopCount=${input.repairLoopCount}, reviewRequiredCount=${input.reviewRequiredCount}, approvedEquivalentCount=${input.approvedEquivalentCount}, operatorTouchCount=${input.operatorTouchCount}`,
    }),
    proofObligation({
      obligation: 'compounding-economics',
      propertyRefs: ['C', 'M'],
      risk: economicsRisk,
      evidence: `effectiveHitRate=${input.effectiveHitRate}, agentFallbackRate=${input.agentFallbackRate}, degradedLocatorRate=${input.degradedLocatorRate}`,
    }),
    proofObligation({
      obligation: 'surface-compressibility',
      propertyRefs: ['M'],
      risk: surfaceCompressibilityRisk,
      evidence: `coverageShare=${coverageShare}, translationHitRate=${input.translationHitRate}, firstPassElementResolutionRate=${input.firstPassElementResolutionRate}, thinKnowledgeScreenCount=${input.thinKnowledgeScreenCount}, ambiguityRate=${input.ambiguityRate}`,
    }),
    proofObligation({
      obligation: 'surface-predictability',
      propertyRefs: ['M'],
      risk: surfacePredictabilityRisk,
      evidence: `routeMismatchRate=${input.routeMismatchRate}, suspensionRate=${input.suspensionRate}, liveDomFallbackRate=${input.liveDomFallbackRate}, agentFallbackRate=${input.agentFallbackRate}, interpretationDriftHotspots=${input.interpretationDriftHotspotCount}`,
    }),
    proofObligation({
      obligation: 'surface-repairability',
      propertyRefs: ['M'],
      risk: surfaceRepairabilityRisk,
      evidence: `degradedLocatorRate=${input.degradedLocatorRate}, recoveryCoverage=${round(recoveryCoverage)}, interpretationDriftHotspots=${input.interpretationDriftHotspotCount}, overlayChurn=${input.overlayChurn}`,
    }),
    proofObligation({
      obligation: 'participatory-repairability',
      propertyRefs: ['M'],
      risk: participatoryRepairabilityRisk,
      evidence: `reviewPressure=${round(reviewPressure)}, operatorPressure=${round(operatorPressure)}, approvedEquivalentReuse=${round(approvedEquivalentReuse)}, agentFallbackRate=${input.agentFallbackRate}`,
    }),
    proofObligation({
      obligation: 'memory-worthiness',
      propertyRefs: ['M'],
      risk: memoryWorthinessRisk,
      evidence: `surfaceCompressibilityRisk=${round(surfaceCompressibilityRisk)}, surfacePredictabilityRisk=${round(surfacePredictabilityRisk)}, surfaceRepairabilityRisk=${round(surfaceRepairabilityRisk)}, participatoryRepairabilityRisk=${round(participatoryRepairabilityRisk)}, economicsRisk=${round(economicsRisk)}, approvedEquivalentRate=${approvedEquivalentRate}`,
    }),
    proofObligation({
      obligation: 'meta-worthiness',
      propertyRefs: ['M'],
      risk: metaRisk,
      evidence: `surfaceCompressibilityRisk=${round(surfaceCompressibilityRisk)}, surfacePredictabilityRisk=${round(surfacePredictabilityRisk)}, surfaceRepairabilityRisk=${round(surfaceRepairabilityRisk)}, participatoryRepairabilityRisk=${round(participatoryRepairabilityRisk)}, memoryWorthinessRisk=${round(memoryWorthinessRisk)}`,
    }),
  ];
}

function scorecardForBenchmark(input: {
  benchmark: BenchmarkContext;
  scenarioIds: string[];
  proposalBundles: ProposalBundle[];
  approvalCount: number;
  generatedVariantCount: number;
  runRecords: Array<{
    adoId: string;
    executionMetrics: {
      timingTotals: {
        setupMs: number;
        resolutionMs: number;
        actionMs: number;
        assertionMs: number;
        retriesMs: number;
        teardownMs: number;
        totalMs: number;
      };
      costTotals: {
        instructionCount: number;
        diagnosticCount: number;
      };
      budgetBreaches: number;
      failureFamilies: Record<string, number>;
      recoveryFamilies: Record<string, number>;
      recoveryStrategies: Record<string, number>;
    };
    steps: Array<{
      resolutionMode: 'deterministic' | 'translation' | 'agentic';
      interpretationKind: string;
      winningSource: string;
      executionStatus: string;
      routeMismatch: boolean;
      degraded: boolean;
    }>;
  }>;
  confidenceRecords: Array<{
    id: string;
    status: string;
    screen?: string | null | undefined;
    failureCount: number;
  }>;
  interpretationDriftRecords: InterpretationDriftRecord[];
  learningScorecard?: LearningScorecard | null | undefined;
  knowledgeCoverage: import('../../domain/fitness/types').KnowledgeCoverageSummary;
}): BenchmarkScorecard {
  const uniqueScreens = uniqueSorted(input.benchmark.fieldCatalog.flatMap((field) => field.screen.length > 0 ? [field.screen] : []));
  const driftCount = input.benchmark.driftEvents.length;
  const locatorDriftCount = input.benchmark.driftEvents.filter((event) => event.kind === 'locator-degradation').length;
  const widgetDriftCount = input.benchmark.driftEvents.filter((event) => event.kind === 'widget-swap').length;
  const uniqueFieldAwarenessCount = input.benchmark.fieldCatalog.length;
  const firstPassScreenResolutionRate = round(Math.max(0, (uniqueScreens.length - driftCount * 0.2) / Math.max(uniqueScreens.length, 1)));
  const firstPassElementResolutionRate = round(
    Math.max(0, (uniqueFieldAwarenessCount - locatorDriftCount - widgetDriftCount) / Math.max(uniqueFieldAwarenessCount, 1)),
  );
  const degradedLocatorRate = round(locatorDriftCount / Math.max(uniqueFieldAwarenessCount, 1));
  const reviewRequiredCount = input.proposalBundles.reduce((count, bundle) =>
    count + bundle.payload.proposals.filter((proposal) => proposal.trustPolicy.decision !== 'allow').length,
  0);
  const repairLoopCount = input.proposalBundles.reduce((count, bundle) => count + bundle.payload.proposals.length, 0);
  const benchmarkRuns = input.runRecords.filter((record) => input.scenarioIds.includes(record.adoId));
  const benchmarkSteps = benchmarkRuns.flatMap((record) => record.steps);
  const translationHitRate = rate(benchmarkSteps.filter((step) => step.resolutionMode === 'translation').length, benchmarkSteps.length);
  const agenticHitRate = rate(benchmarkSteps.filter((step) => step.resolutionMode === 'agentic').length, benchmarkSteps.length);
  const approvedEquivalentCount = benchmarkSteps.filter((step) => step.winningSource === 'approved-equivalent').length;
  const effectiveHitRate = rate(benchmarkSteps.filter(isEffectiveHit).length, benchmarkSteps.length);
  const ambiguityRate = rate(benchmarkSteps.filter((step) => step.interpretationKind === 'needs-human').length, benchmarkSteps.length);
  const suspensionRate = rate(
    benchmarkSteps.filter((step) => step.interpretationKind === 'needs-human' || !isExecutionSuccess(step.executionStatus)).length,
    benchmarkSteps.length,
  );
  const agentFallbackRate = rate(
    benchmarkSteps.filter((step) => step.winningSource === 'live-dom' || step.winningSource === 'none').length,
    benchmarkSteps.length,
  );
  const liveDomFallbackRate = rate(
    benchmarkSteps.filter((step) => step.winningSource === 'live-dom').length,
    benchmarkSteps.length,
  );
  const routeMismatchRate = rate(
    benchmarkSteps.filter((step) => step.routeMismatch).length,
    benchmarkSteps.length,
  );
  const thinKnowledgeScreenCount = uniqueScreens.filter((screen) =>
    input.benchmark.fieldCatalog.filter((field) => field.screen === screen).length < 3,
  ).length;
  const degradedLocatorHotspotCount = uniqueSorted(
    benchmarkRuns.flatMap((record) =>
      record.steps.flatMap((step) => step.degraded ? [record.adoId] : []),
    ).filter((value) => value.length > 0),
  ).length;
  const interpretationDriftHotspotCount = input.interpretationDriftRecords
    .reduce((sum, record) => sum + (input.scenarioIds.includes(record.adoId) && record.hasDrift ? record.changedStepCount : 0), 0);
  const overlayChurn = input.confidenceRecords.filter((record) =>
    record.failureCount > 0 && uniqueScreens.includes(record.screen ?? ''),
  ).length;
  const timingTotals = concatAll(
    timingTotalsMonoid,
    benchmarkRuns.map((run) => ({
      setup: run.executionMetrics.timingTotals.setupMs,
      resolution: run.executionMetrics.timingTotals.resolutionMs,
      action: run.executionMetrics.timingTotals.actionMs,
      assertion: run.executionMetrics.timingTotals.assertionMs,
      retries: run.executionMetrics.timingTotals.retriesMs,
      teardown: run.executionMetrics.timingTotals.teardownMs,
      total: run.executionMetrics.timingTotals.totalMs,
    })),
  );
  const executionCostTotals = concatAll(
    executionCostTotalsMonoid,
    benchmarkRuns.map((run) => ({
      instructionCount: run.executionMetrics.costTotals.instructionCount,
      diagnosticCount: run.executionMetrics.costTotals.diagnosticCount,
    })),
  );
  const executionFailureFamilies = concatAll(numberRecordSumMonoid, benchmarkRuns.map((run) => run.executionMetrics.failureFamilies));
  const recoveryFamilies = concatAll(numberRecordSumMonoid, benchmarkRuns.map((run) => run.executionMetrics.recoveryFamilies ?? {}));
  const recoveryStrategies = concatAll(numberRecordSumMonoid, benchmarkRuns.map((run) => run.executionMetrics.recoveryStrategies ?? {}));
  const budgetBreachCount = concatAll(sumMonoid, benchmarkRuns.map((run) => run.executionMetrics.budgetBreaches));
  const thresholds = input.benchmark.fieldAwarenessThresholds;
  const thresholdStatus = uniqueFieldAwarenessCount < thresholds.minFieldAwarenessCount
    || firstPassScreenResolutionRate < thresholds.minFirstPassScreenResolutionRate
    || firstPassElementResolutionRate < thresholds.minFirstPassElementResolutionRate
    || degradedLocatorRate > thresholds.maxDegradedLocatorRate
    ? 'fail'
    : reviewRequiredCount > 0
      ? 'warn'
      : 'pass';
  const proofObligations = benchmarkProofObligations({
    knowledgeCoverage: input.knowledgeCoverage,
    firstPassScreenResolutionRate,
    firstPassElementResolutionRate,
    effectiveHitRate,
    ambiguityRate,
    suspensionRate,
    agentFallbackRate,
    liveDomFallbackRate,
    routeMismatchRate,
    degradedLocatorRate,
    translationHitRate,
    repairLoopCount,
    reviewRequiredCount,
    approvedEquivalentCount,
    operatorTouchCount: input.approvalCount,
    interpretationDriftHotspotCount,
    overlayChurn,
    thinKnowledgeScreenCount,
    totalScreens: uniqueScreens.length,
    totalSteps: benchmarkSteps.length,
    recoveryFamilies,
    recoveryStrategies,
  });

  return {
    kind: 'benchmark-scorecard',
    version: 1,
    benchmark: input.benchmark.name,
    generatedAt: new Date().toISOString(),
    uniqueFieldAwarenessCount,
    firstPassScreenResolutionRate,
    firstPassElementResolutionRate,
    effectiveHitRate,
    ambiguityRate,
    suspensionRate,
    agentFallbackRate,
    liveDomFallbackRate,
    routeMismatchRate,
    degradedLocatorRate,
    reviewRequiredCount,
    repairLoopCount,
    operatorTouchCount: input.approvalCount,
    knowledgeChurn: knowledgeChurnForBundles(input.proposalBundles),
    proposalCategoryCounts: proposalCategoryCountsForBundles(input.proposalBundles),
    generatedVariantCount: input.generatedVariantCount,
    translationHitRate,
    agenticHitRate,
    approvedEquivalentCount,
    winningSourceDistribution: winningSourceDistribution(benchmarkSteps),
    proofObligations,
    falsifierSignals: benchmarkFalsifierSignals({
      effectiveHitRate,
      ambiguityRate,
      suspensionRate,
      routeMismatchRate,
      degradedLocatorRate,
      interpretationDriftHotspotCount,
      overlayChurn,
      operatorTouchCount: input.approvalCount,
      repairLoopCount,
      approvedEquivalentCount,
    }),
    thinKnowledgeScreenCount,
    degradedLocatorHotspotCount,
    interpretationDriftHotspotCount,
    overlayChurn,
    executionTimingTotalsMs: timingTotals,
    executionCostTotals,
    executionFailureFamilies,
    recoveryFamilies,
    recoveryStrategies,
    budgetBreachCount,
    thresholdStatus,
    learning: input.learningScorecard ?? null,
  };
}

function renderVariantSpec(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[]): string {
  const lines: string[] = [
    `// Benchmark variants for ${benchmark.name}`,
    `import { literal, workflow } from '../../lib/domain/governance/workflow-facade';`,
    '',
    'export const benchmarkVariants = [',
    ...variants.map((variant) =>
      `  workflow.screen('${variant.screen}').element('${variant.element}').input(literal('${variant.id}'), '${variant.posture}'),`,
    ),
    '] as const;',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

function renderVariantReview(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[], scorecard: BenchmarkScorecard): string {
  const header: string[] = [
    `# ${benchmark.name} benchmark`,
    '',
    `- Field awareness count: ${scorecard.uniqueFieldAwarenessCount}`,
    `- Generated variants: ${scorecard.generatedVariantCount}`,
    `- Threshold status: ${scorecard.thresholdStatus}`,
    `- Next commands: tesseract benchmark --benchmark ${benchmark.name} | tesseract scorecard --benchmark ${benchmark.name} | tesseract inbox`,
    '',
  ];

  const variantLines = variants.flatMap((variant) => [
    `## ${variant.id}`,
    '',
    `- Field: ${variant.fieldId}`,
    `- Screen: ${variant.screen}`,
    `- Element: ${variant.element}`,
    `- Posture: ${variant.posture}`,
    '',
  ]);

  return `${[...header, ...variantLines].join('\n').trim()}\n`;
}

function variantTrace(benchmark: BenchmarkContext, variants: readonly BenchmarkVariant[], scorecard: BenchmarkScorecard) {
  return {
    kind: 'benchmark-variant-trace',
    version: 1,
    benchmark: benchmark.name,
    generatedAt: new Date().toISOString(),
    scorecard,
    variants,
  };
}

function relatedImprovementRuns(
  runs: readonly ImprovementRun[],
  scenarioIds: readonly string[],
): readonly ImprovementRun[] {
  const scenarioIdSet = new Set(scenarioIds);
  return [...runs]
    .filter((run) => run.iterations.some((iteration) => iteration.scenarioIds.some((scenarioId) => scenarioIdSet.has(String(scenarioId)))))
    .sort((left, right) => (right.completedAt ?? right.startedAt).localeCompare(left.completedAt ?? left.startedAt));
}

function summarizeImprovementRuns(
  runs: readonly ImprovementRun[],
): ImprovementProjectionSummary | null {
  if (runs.length === 0) {
    return null;
  }

  const latestImprovementRun = runs[0] ?? null;
  const latestDecision = latestImprovementRun?.acceptanceDecisions[0] ?? null;
  return {
    relatedRunIds: runs.map((run) => run.improvementRunId),
    latestRunId: latestImprovementRun?.improvementRunId ?? null,
    latestAccepted: latestImprovementRun?.accepted ?? null,
    latestVerdict: latestDecision?.verdict ?? null,
    latestDecisionId: latestDecision?.decisionId ?? null,
    signalCount: latestImprovementRun?.signals.length ?? 0,
    candidateInterventionCount: latestImprovementRun?.candidateInterventions.length ?? 0,
    checkpointRef: latestDecision?.checkpointRef ?? null,
  };
}

function renderScorecardMarkdown(
  benchmark: BenchmarkContext,
  scorecard: BenchmarkScorecard,
  run: BenchmarkImprovementProjection | null,
): string {
  const lines = [
    `# ${benchmark.name} scorecard`,
    '',
    `- Threshold status: ${scorecard.thresholdStatus}`,
    `- Unique field awareness count: ${scorecard.uniqueFieldAwarenessCount}`,
    `- First-pass screen resolution rate: ${scorecard.firstPassScreenResolutionRate}`,
    `- First-pass element resolution rate: ${scorecard.firstPassElementResolutionRate}`,
    `- Effective hit rate: ${scorecard.effectiveHitRate ?? 0}`,
    `- Ambiguity rate: ${scorecard.ambiguityRate ?? 0}`,
    `- Suspension rate: ${scorecard.suspensionRate ?? 0}`,
    `- Agent fallback rate: ${scorecard.agentFallbackRate ?? 0}`,
    `- Live DOM fallback rate: ${scorecard.liveDomFallbackRate ?? 0}`,
    `- Route mismatch rate: ${scorecard.routeMismatchRate ?? 0}`,
    `- Degraded locator rate: ${scorecard.degradedLocatorRate}`,
    `- Review-required count: ${scorecard.reviewRequiredCount}`,
    `- Repair-loop count: ${scorecard.repairLoopCount}`,
    `- Operator-touch count: ${scorecard.operatorTouchCount}`,
    `- Proposal categories: ${JSON.stringify(scorecard.proposalCategoryCounts ?? {})}`,
    `- Translation hit rate: ${scorecard.translationHitRate}`,
    `- Agentic hit rate: ${scorecard.agenticHitRate}`,
    `- Approved-equivalent count: ${scorecard.approvedEquivalentCount}`,
    `- Winning source distribution: ${JSON.stringify(scorecard.winningSourceDistribution ?? [])}`,
    `- Thin-knowledge screens: ${scorecard.thinKnowledgeScreenCount}`,
    `- Degraded locator hotspots: ${scorecard.degradedLocatorHotspotCount}`,
    `- Interpretation drift hotspots: ${scorecard.interpretationDriftHotspotCount}`,
    `- Overlay churn: ${scorecard.overlayChurn}`,
    `- Execution timing totals (ms): ${JSON.stringify(scorecard.executionTimingTotalsMs)}`,
    `- Execution cost totals: ${JSON.stringify(scorecard.executionCostTotals)}`,
    `- Execution failure families: ${JSON.stringify(scorecard.executionFailureFamilies)}`,
    `- Recovery families: ${JSON.stringify(scorecard.recoveryFamilies)}`,
    `- Recovery strategies: ${JSON.stringify(scorecard.recoveryStrategies)}`,
    `- Budget breach count: ${scorecard.budgetBreachCount}`,
    `- Knowledge churn: ${JSON.stringify(scorecard.knowledgeChurn)}`,
    `- Generated variants: ${scorecard.generatedVariantCount}`,
    `- Next commands: tesseract benchmark --benchmark ${benchmark.name} | tesseract scorecard --benchmark ${benchmark.name} | tesseract inbox`,
    '',
    ...(scorecard.proofObligations && scorecard.proofObligations.length > 0 ? [
      '## Logical Proof Obligations',
      '',
      ...scorecard.proofObligations.map((obligation) =>
        `- ${obligation.obligation}: ${obligation.status} score=${obligation.score} refs=${obligation.propertyRefs.join('/')} (${obligation.evidence})`),
      '',
    ] : []),
    ...(scorecard.falsifierSignals && scorecard.falsifierSignals.length > 0 ? [
      '## Proof Signals',
      '',
      ...scorecard.falsifierSignals.map((signal) => `- ${signal.name}: ${signal.status} (${signal.evidence})`),
      '',
    ] : []),
    ...(scorecard.learning ? [
      '## Learning',
      '',
      `- Corpus fragment count: ${scorecard.learning.corpusFragmentCount}`,
      `- Replay example count: ${scorecard.learning.replayExampleCount}`,
      `- Avg reproducibility score: ${scorecard.learning.avgReproducibilityScore}`,
      `- Fragment provenance completeness: ${scorecard.learning.fragmentProvenanceCompleteness}`,
      `- Thin screen count: ${scorecard.learning.thinScreenCount}`,
      `- Thin action family count: ${scorecard.learning.thinActionFamilyCount}`,
      `- Top bottleneck screen: ${scorecard.learning.topBottleneckScreen ?? 'none'}`,
      `- Top bottleneck impact: ${scorecard.learning.topBottleneckImpact}`,
      `- Ranked proposal count: ${scorecard.learning.rankedProposalCount}`,
      `- Top proposal id: ${scorecard.learning.topProposalId ?? 'none'}`,
      `- Top proposal score: ${scorecard.learning.topProposalScore}`,
      '',
    ] : []),
    ...(run?.improvement ? [
      '## Recursive Improvement',
      '',
      `- Related runs: ${run.improvement.relatedRunIds.join(', ') || 'none'}`,
      `- Latest run: ${run.improvement.latestRunId ?? 'none'}`,
      `- Latest accepted: ${run.improvement.latestAccepted === null ? 'none' : run.improvement.latestAccepted ? 'yes' : 'no'}`,
      `- Latest verdict: ${run.improvement.latestVerdict ?? 'none'}`,
      `- Latest decision id: ${run.improvement.latestDecisionId ?? 'none'}`,
      `- Latest checkpoint: ${run.improvement.checkpointRef ?? 'none'}`,
      `- Latest signal count: ${run.improvement.signalCount}`,
      `- Latest candidate interventions: ${run.improvement.candidateInterventionCount}`,
      '',
    ] : []),
    ...(run ? [
      '## Benchmark Improvement Projection',
      '',
      `- Run id: ${run.runId}`,
      `- Runbooks: ${run.runbooks.join(', ') || 'none'}`,
      `- Scenario ids: ${run.scenarioIds.join(', ') || 'none'}`,
      '',
    ] : []),
  ];
  return `${lines.join('\n').trim()}\n`;
}

export function projectBenchmarkScorecard(options: {
  paths: ProjectPaths;
  benchmarkName: string;
  includeExecution?: boolean | undefined;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const executionContext = yield* ExecutionContext;
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const benchmark = benchmarkByName(catalog.benchmarks.map((entry) => entry.artifact), options.benchmarkName);
    const variants = variantsForBenchmark(benchmark);

    const scenarioIds: string[] = options.includeExecution
      ? yield* collectRunbookScenarioIds({
        runbooks: benchmark.benchmarkRunbooks,
        concurrency: resolveEffectConcurrency({ ceiling: 4 }),
        selectRunbook: (runbook) =>
          Effect.map(
            runScenarioSelection({
              paths: options.paths,
              runbookName: runbook.runbook,
              tag: runbook.tag ?? undefined,
              interpreterMode: executionContext.posture.interpreterMode === 'playwright'
                ? 'diagnostic'
                : executionContext.posture.interpreterMode,
              posture: executionContext.posture,
            }),
            (selection) => selection.selection.adoIds,
          ),
      })
      : uniqueSorted(
        catalog.scenarios
          .flatMap((entry) => entry.artifact.metadata.suite.startsWith(benchmark.suite) ? [entry.artifact.source.ado_id] : []),
      );

    // After execution, reload post-run scope to pick up new run records; otherwise reuse the initial catalog
    const scorecardCatalog = options.includeExecution
      ? yield* loadWorkspaceCatalog({ paths: options.paths, scope: 'post-run' })
      : catalog;
    const proposalBundles = proposalsForScenarios(scorecardCatalog.proposalBundles.map((entry) => entry.artifact), scenarioIds);
    const scorecard = scorecardForBenchmark({
      benchmark,
      scenarioIds,
      proposalBundles,
      approvalCount: scorecardCatalog.approvalReceipts.length,
      generatedVariantCount: variants.length,
      runRecords: scorecardCatalog.runRecords.map((entry) => ({
        adoId: entry.artifact.adoId,
        executionMetrics: entry.artifact.executionMetrics,
        steps: entry.artifact.steps.map((step) => ({
          resolutionMode: step.interpretation.resolutionMode,
          interpretationKind: step.interpretation.kind,
          winningSource: step.interpretation.winningSource,
          executionStatus: step.execution.execution.status,
          routeMismatch: step.execution.navigation?.mismatch ?? false,
          degraded: step.execution.degraded,
        })),
      })),
      confidenceRecords: (scorecardCatalog.confidenceCatalog?.artifact.records ?? []).map((record) => ({
        id: record.id,
        status: record.status,
        screen: record.screen ?? null,
        failureCount: record.failureCount,
      })),
      interpretationDriftRecords: scorecardCatalog.interpretationDriftRecords.map((entry) => entry.artifact),
      knowledgeCoverage: summarizeKnowledgeCoverage(scorecardCatalog),
    });
    const improvementRuns = relatedImprovementRuns(
      scorecardCatalog.improvementRuns.map((entry) => entry.artifact),
      scenarioIds,
    );
    const typedScenarioIds = Either.match(decodeScenarioIds(scenarioIds), {
      onLeft: (error) => {
        throw new TesseractError(
          'benchmark-scenario-ids-decode-failed',
          `benchmark ${benchmark.name} scenarioIds decode failed${error.path ? ` at ${error.path}` : ''}`,
          error,
        );
      },
      onRight: (value) => value.map((scenarioId) => createAdoId(scenarioId)),
    });
    const benchmarkImprovementProjection: BenchmarkImprovementProjection = {
      kind: 'benchmark-improvement-projection',
      version: 1,
      benchmark: benchmark.name,
      runId: new Date().toISOString().replace(/[:.]/g, '-'),
      executedAt: new Date().toISOString(),
      posture: executionContext.posture,
      runbooks: benchmark.benchmarkRunbooks.map((entry) => entry.runbook),
      scenarioIds: typedScenarioIds,
      driftEventIds: benchmark.driftEvents.map((event) => event.id),
      scorecard,
      improvement: summarizeImprovementRuns(improvementRuns),
      nextCommands: [
        `tesseract scorecard --benchmark ${benchmark.name}`,
        `tesseract inbox`,
      ],
    };
    const dogfoodRun: DogfoodRun = {
      ...benchmarkImprovementProjection,
      kind: 'dogfood-run',
    };
    const variantSpec = renderVariantSpec(benchmark, variants);
    const variantTraceArtifact = variantTrace(benchmark, variants, scorecard);
    const variantReview = renderVariantReview(benchmark, variants, scorecard);
    const scorecardMarkdown = renderScorecardMarkdown(benchmark, scorecard, benchmarkImprovementProjection);

    const benchmarkImprovementPath = benchmarkImprovementProjectionPath(options.paths, benchmark.name, benchmarkImprovementProjection.runId);
    const dogfoodPath = benchmarkDogfoodRunPath(options.paths, benchmark.name, dogfoodRun.runId);
    const scorecardJsonPath = benchmarkScorecardJsonPath(options.paths, benchmark.name);
    const scorecardMarkdownPath = benchmarkScorecardMarkdownPath(options.paths, benchmark.name);
    const variantsSpecPath = benchmarkVariantsSpecPath(options.paths, benchmark.name);
    const variantsTracePath = benchmarkVariantsTracePath(options.paths, benchmark.name);
    const variantsReviewPath = benchmarkVariantsReviewPath(options.paths, benchmark.name);

    yield* fs.writeJson(benchmarkImprovementPath, benchmarkImprovementProjection);
    yield* fs.writeJson(dogfoodPath, dogfoodRun);
    yield* fs.writeJson(scorecardJsonPath, scorecard);
    yield* fs.writeText(scorecardMarkdownPath, scorecardMarkdown);
    yield* fs.writeText(variantsSpecPath, variantSpec);
    yield* fs.writeJson(variantsTracePath, variantTraceArtifact);
    yield* fs.writeText(variantsReviewPath, variantReview);

    return {
      benchmark: benchmark.name,
      scorecard,
      benchmarkImprovementProjection,
      dogfoodRun,
      benchmarkImprovementPath,
      scorecardJsonPath,
      scorecardMarkdownPath,
      variantsSpecPath,
      variantsTracePath,
      variantsReviewPath,
      rewritten: [
        relativeProjectPath(options.paths, benchmarkImprovementPath),
        relativeProjectPath(options.paths, dogfoodPath),
        relativeProjectPath(options.paths, scorecardJsonPath),
        relativeProjectPath(options.paths, scorecardMarkdownPath),
        relativeProjectPath(options.paths, variantsSpecPath),
        relativeProjectPath(options.paths, variantsTracePath),
        relativeProjectPath(options.paths, variantsReviewPath),
      ],
    };
  });
}

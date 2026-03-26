import type {
  BottleneckSignal,
  BottleneckWeightCorrelation,
  BottleneckWeights,
  CorpusHealthReport,
  GroundedSpecFragment,
  KnowledgeBottleneck,
  KnowledgeBottleneckReport,
} from '../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../domain/types';
import { groupBy, uniqueSorted } from '../domain/collections';
import {
  round4,
  screenFromGraphNodeIds,
  actionFamilyOf,
  combineScoringRules,
  weightedScoringRule,
  type ScoringRule,
} from './learning-shared';

interface ScreenActionContext {
  readonly screen: string;
  readonly action: string;
  readonly repairDensity: number;
  readonly translationRate: number;
  readonly unresolvedRate: number;
  readonly screenFragmentShare: number;
}

interface RunStepSummary {
  readonly adoId: string;
  readonly winningSource: string;
  readonly resolutionMode: string;
  readonly screen: string;
  readonly action: string;
}

// ─── Composable scoring rules for bottleneck impact ───

const repairDensityRule: ScoringRule<ScreenActionContext> = { score: (ctx) => ctx.repairDensity };
const translationRateRule: ScoringRule<ScreenActionContext> = { score: (ctx) => ctx.translationRate };
const unresolvedRateRule: ScoringRule<ScreenActionContext> = { score: (ctx) => ctx.unresolvedRate };
const inverseFragmentShareRule: ScoringRule<ScreenActionContext> = { score: (ctx) => 1 - ctx.screenFragmentShare };

function buildBottleneckScoring(weights: BottleneckWeights = DEFAULT_PIPELINE_CONFIG.bottleneckWeights): ScoringRule<ScreenActionContext> {
  return combineScoringRules<ScreenActionContext>(
    weightedScoringRule(weights.repairDensity, repairDensityRule),
    weightedScoringRule(weights.translationRate, translationRateRule),
    weightedScoringRule(weights.unresolvedRate, unresolvedRateRule),
    weightedScoringRule(weights.inverseFragmentShare, inverseFragmentShareRule),
  );
}

const bottleneckScoring = buildBottleneckScoring();

// ─── Self-calibrating weights from correlation data ───
//
// Maps bottleneck signals to weight keys, then adjusts weights proportionally
// to observed correlations. Signals with higher observed correlation with
// improvement get higher weights. The total sum is preserved.

const SIGNAL_TO_WEIGHT_KEY: Readonly<Record<string, keyof BottleneckWeights>> = {
  'repair-recovery-hotspot': 'repairDensity',
  'translation-fallback-dominant': 'translationRate',
  'high-unresolved-rate': 'unresolvedRate',
  'thin-screen-coverage': 'inverseFragmentShare',
};

export function calibrateWeightsFromCorrelations(
  baseWeights: BottleneckWeights,
  correlations: readonly BottleneckWeightCorrelation[],
  learningRate = 0.1,
): BottleneckWeights {
  // If no meaningful correlations, return base weights unchanged
  const hasSignal = correlations.some((c) => c.correlationWithImprovement !== 0);
  if (!hasSignal) {
    return baseWeights;
  }

  // Compute adjustment factors: positive correlation → increase weight
  const adjustments = new Map<keyof BottleneckWeights, number>();
  for (const corr of correlations) {
    const weightKey = SIGNAL_TO_WEIGHT_KEY[corr.signal];
    if (weightKey) {
      // Nudge weight in the direction of the correlation
      adjustments.set(weightKey, corr.correlationWithImprovement * learningRate);
    }
  }

  // Apply adjustments and normalize to preserve sum
  const keys: readonly (keyof BottleneckWeights)[] = ['repairDensity', 'translationRate', 'unresolvedRate', 'inverseFragmentShare'];
  const raw = keys.map((k) => Math.max(0.05, baseWeights[k] + (adjustments.get(k) ?? 0)));
  const sum = raw.reduce((s, v) => s + v, 0);
  const normalized = raw.map((v) => round4(v / sum));

  return {
    repairDensity: normalized[0]!,
    translationRate: normalized[1]!,
    unresolvedRate: normalized[2]!,
    inverseFragmentShare: normalized[3]!,
  };
}

function detectSignal(input: {
  readonly screen: string;
  readonly healthReport: CorpusHealthReport;
  readonly repairDensity: number;
  readonly translationRate: number;
  readonly unresolvedRate: number;
}): BottleneckSignal {
  if (input.repairDensity > 0.5) {
    return 'repair-recovery-hotspot';
  }
  if (input.translationRate > 0.5) {
    return 'translation-fallback-dominant';
  }
  if (input.unresolvedRate > 0.3) {
    return 'high-unresolved-rate';
  }
  const screenEntry = input.healthReport.screenCoverage.find((s) => s.screen === input.screen);
  if (screenEntry?.thin) {
    return 'thin-screen-coverage';
  }
  return 'low-provenance-completeness';
}

function recommendArtifacts(screen: string, signal: BottleneckSignal): readonly string[] {
  switch (signal) {
    case 'thin-screen-coverage':
      return [`knowledge/surfaces/${screen}.surface.yaml`, `knowledge/screens/${screen}.hints.yaml`];
    case 'repair-recovery-hotspot':
      return [`knowledge/screens/${screen}.hints.yaml`, `knowledge/screens/${screen}.elements.yaml`];
    case 'low-provenance-completeness':
      return [`knowledge/screens/${screen}.elements.yaml`];
    case 'high-unresolved-rate':
      return [`knowledge/screens/${screen}.hints.yaml`, `knowledge/screens/${screen}.elements.yaml`];
    case 'translation-fallback-dominant':
      return [`knowledge/screens/${screen}.hints.yaml`, `knowledge/patterns/`];
  }
}

function buildScreenActionPairs(fragments: readonly GroundedSpecFragment[]): readonly { readonly screen: string; readonly action: string }[] {
  const groups = groupBy(fragments, (f) => screenFromGraphNodeIds(f.graphNodeIds));
  return Object.entries(groups).flatMap(([screen, screenFragments]) => {
    const actions = uniqueSorted(screenFragments.map((f) => actionFamilyOf(f.action)));
    return actions.map((action) => ({ screen, action }));
  });
}

export function projectBottlenecks(input: {
  readonly healthReport: CorpusHealthReport;
  readonly fragments: readonly GroundedSpecFragment[];
  readonly runStepSummaries: readonly RunStepSummary[];
  readonly generatedAt?: string | undefined;
  readonly bottleneckWeights?: BottleneckWeights | undefined;
}): KnowledgeBottleneckReport {
  const scoring = input.bottleneckWeights ? buildBottleneckScoring(input.bottleneckWeights) : bottleneckScoring;
  const totalFragments = Math.max(input.fragments.length, 1);
  const pairs = buildScreenActionPairs(input.fragments);

  // Pre-group by screen: O(n) each, then O(1) lookups per pair
  const fragmentsByScreen = groupBy(input.fragments, (f) => screenFromGraphNodeIds(f.graphNodeIds));
  const repairsByScreen = groupBy(
    input.fragments.filter((f) => f.runtime === 'repair-recovery'),
    (f) => screenFromGraphNodeIds(f.graphNodeIds),
  );
  const stepsByScreen = groupBy(input.runStepSummaries, (s) => s.screen);

  const bottlenecks: readonly KnowledgeBottleneck[] = pairs
    .map(({ screen, action }) => {
      const screenFragments = fragmentsByScreen[screen] ?? [];
      const screenRepairs = repairsByScreen[screen] ?? [];
      const screenSteps = stepsByScreen[screen] ?? [];
      const translationSteps = screenSteps.filter((s) => s.resolutionMode === 'translation');
      const unresolvedSteps = screenSteps.filter((s) => s.winningSource === 'none' || s.winningSource === 'unresolved');

      const repairDensity = screenFragments.length === 0 ? 0 : screenRepairs.length / screenFragments.length;
      const translationRate = screenSteps.length === 0 ? 0 : translationSteps.length / screenSteps.length;
      const unresolvedRate = screenSteps.length === 0 ? 0 : unresolvedSteps.length / screenSteps.length;

      const ctx: ScreenActionContext = {
        screen,
        action,
        repairDensity,
        translationRate,
        unresolvedRate,
        screenFragmentShare: screenFragments.length / totalFragments,
      };

      const signal = detectSignal({
        screen,
        healthReport: input.healthReport,
        repairDensity,
        translationRate,
        unresolvedRate,
      });

      return {
        rank: 0,
        screen,
        element: null,
        actionFamily: action,
        signal,
        impactScore: round4(scoring.score(ctx)),
        recommendedArtifacts: recommendArtifacts(screen, signal),
      };
    })
    .sort((a, b) => b.impactScore - a.impactScore || a.screen.localeCompare(b.screen))
    .map((b, i) => ({ ...b, rank: i + 1 }));

  return {
    kind: 'knowledge-bottleneck-report',
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    bottlenecks,
    topScreens: uniqueSorted(bottlenecks.slice(0, 5).map((b) => b.screen)),
    topActionFamilies: uniqueSorted(bottlenecks.slice(0, 5).map((b) => b.actionFamily)),
  };
}

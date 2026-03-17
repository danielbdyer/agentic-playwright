import type {
  BottleneckSignal,
  CorpusHealthReport,
  GroundedSpecFragment,
  KnowledgeBottleneck,
  KnowledgeBottleneckReport,
} from '../domain/types';
import { groupBy, uniqueSorted } from '../domain/collections';
import {
  round4,
  screenFromGraphNodeIds,
  actionFamilyOf,
  combineScoringRules,
  weightedScoringRule,
  contramapScoringRule,
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

const bottleneckScoring = combineScoringRules<ScreenActionContext>(
  weightedScoringRule(0.3, repairDensityRule),
  weightedScoringRule(0.25, translationRateRule),
  weightedScoringRule(0.25, unresolvedRateRule),
  weightedScoringRule(0.2, inverseFragmentShareRule),
);

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
}): KnowledgeBottleneckReport {
  const repairFragments = input.fragments.filter((f) => f.runtime === 'repair-recovery');
  const totalFragments = Math.max(input.fragments.length, 1);
  const pairs = buildScreenActionPairs(input.fragments);

  const bottlenecks: readonly KnowledgeBottleneck[] = pairs
    .map(({ screen, action }) => {
      const screenFragments = input.fragments.filter((f) =>
        screenFromGraphNodeIds(f.graphNodeIds) === screen,
      );
      const screenRepairs = repairFragments.filter((f) =>
        screenFromGraphNodeIds(f.graphNodeIds) === screen,
      );
      const screenSteps = input.runStepSummaries.filter((s) => s.screen === screen);
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
        impactScore: round4(bottleneckScoring.score(ctx)),
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

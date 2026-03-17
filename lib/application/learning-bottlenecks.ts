import type {
  BottleneckSignal,
  CorpusHealthReport,
  GroundedSpecFragment,
  KnowledgeBottleneck,
  KnowledgeBottleneckReport,
} from '../domain/types';
import { uniqueSorted } from '../domain/collections';

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function screenFromGraphNodeIds(graphNodeIds: readonly string[]): string {
  const screenRef = graphNodeIds.find((id) => id.startsWith('screen:') || id.startsWith('target:'));
  return screenRef?.replace(/^(screen:|target:)/, '') ?? 'unknown';
}

interface RunStepSummary {
  readonly adoId: string;
  readonly winningSource: string;
  readonly resolutionMode: string;
  readonly screen: string;
  readonly action: string;
}

function detectSignal(input: {
  readonly screen: string;
  readonly action: string;
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

export function projectBottlenecks(input: {
  readonly healthReport: CorpusHealthReport;
  readonly fragments: readonly GroundedSpecFragment[];
  readonly runStepSummaries: readonly RunStepSummary[];
  readonly generatedAt?: string | undefined;
}): KnowledgeBottleneckReport {
  const repairFragments = input.fragments.filter((f) => f.runtime === 'repair-recovery');
  const screenActions = new Map<string, Set<string>>();

  for (const fragment of input.fragments) {
    const screen = screenFromGraphNodeIds(fragment.graphNodeIds);
    const actions = screenActions.get(screen) ?? new Set();
    actions.add(fragment.action === 'composite' ? 'composite' : fragment.action);
    screenActions.set(screen, actions);
  }

  const bottlenecks: KnowledgeBottleneck[] = [];

  for (const [screen, actions] of screenActions.entries()) {
    for (const action of actions) {
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

      const signal = detectSignal({
        screen,
        action,
        healthReport: input.healthReport,
        repairDensity,
        translationRate,
        unresolvedRate,
      });

      const impactScore = round4(
        0.3 * repairDensity +
        0.25 * translationRate +
        0.25 * unresolvedRate +
        0.2 * (1 - (screenFragments.length / Math.max(input.fragments.length, 1))),
      );

      bottlenecks.push({
        rank: 0,
        screen,
        element: null,
        actionFamily: action,
        signal,
        impactScore,
        recommendedArtifacts: recommendArtifacts(screen, signal),
      });
    }
  }

  const ranked = bottlenecks
    .sort((a, b) => b.impactScore - a.impactScore || a.screen.localeCompare(b.screen))
    .map((b, i) => ({ ...b, rank: i + 1 }));

  return {
    kind: 'knowledge-bottleneck-report',
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    bottlenecks: ranked,
    topScreens: uniqueSorted(ranked.slice(0, 5).map((b) => b.screen)),
    topActionFamilies: uniqueSorted(ranked.slice(0, 5).map((b) => b.actionFamily)),
  };
}

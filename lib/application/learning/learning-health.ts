import type {
  ActionFamilyCoverageEntry,
  CorpusHealthReport,
  GroundedSpecFragment,
  LearningRuntime,
  RuntimeCoverageEntry,
  ScreenCoverageEntry,
  TrainingCorpusManifest,
} from '../../domain/learning/types';
import { sha256, stableStringify } from '../../domain/kernel/hash';
import { groupBy, uniqueSorted } from '../../domain/kernel/collections';
import { round4, screenFromGraphNodeIds, actionFamilyOf } from './learning-shared';

const THIN_SCREEN_THRESHOLD = 3;
const THIN_ACTION_THRESHOLD = 2;

function confidenceDistribution(
  fragments: readonly GroundedSpecFragment[],
): Readonly<Record<GroundedSpecFragment['confidence'], number>> {
  const total = Math.max(fragments.length, 1);
  const counts = fragments.reduce(
    (acc, f) => ({ ...acc, [f.confidence]: (acc[f.confidence] ?? 0) + 1 }),
    { 'compiler-derived': 0, 'agent-verified': 0, 'agent-proposed': 0 } as Record<GroundedSpecFragment['confidence'], number>,
  );
  return {
    'compiler-derived': round4(counts['compiler-derived'] / total),
    'agent-verified': round4(counts['agent-verified'] / total),
    'agent-proposed': round4(counts['agent-proposed'] / total),
  };
}

function buildRuntimeCoverage(fragments: readonly GroundedSpecFragment[]): readonly RuntimeCoverageEntry[] {
  const runtimes: readonly LearningRuntime[] = ['decomposition', 'repair-recovery', 'workflow'];
  return runtimes.map((runtime) => {
    const runtimeFragments = fragments.filter((f) => f.runtime === runtime);
    const screens = uniqueSorted(runtimeFragments.map((f) => screenFromGraphNodeIds(f.graphNodeIds)));
    const actions = uniqueSorted(runtimeFragments.map((f) => actionFamilyOf(f.action)));
    const scenarios = uniqueSorted(runtimeFragments.map((f) => f.adoId));
    return {
      runtime,
      fragmentCount: runtimeFragments.length,
      scenarioCount: scenarios.length,
      uniqueScreenCount: screens.length,
      uniqueActionCount: actions.length,
      avgConfidenceDistribution: confidenceDistribution(runtimeFragments),
    };
  });
}

function buildScreenCoverage(fragments: readonly GroundedSpecFragment[]): readonly ScreenCoverageEntry[] {
  const groups = groupBy(fragments, (f) => screenFromGraphNodeIds(f.graphNodeIds));
  return Object.entries(groups)
    .map(([screen, screenFragments]) => ({
      screen,
      fragmentCount: screenFragments.length,
      runtimes: uniqueSorted(screenFragments.map((f) => f.runtime)) as readonly LearningRuntime[],
      actionFamilies: uniqueSorted(screenFragments.map((f) => actionFamilyOf(f.action))),
      thin: screenFragments.length < THIN_SCREEN_THRESHOLD,
    }))
    .sort((a, b) => a.screen.localeCompare(b.screen));
}

function buildActionFamilyCoverage(fragments: readonly GroundedSpecFragment[]): readonly ActionFamilyCoverageEntry[] {
  const confidenceValues: Readonly<Record<GroundedSpecFragment['confidence'], number>> = {
    'compiler-derived': 1.0,
    'agent-verified': 0.7,
    'agent-proposed': 0.4,
  };
  const groups = groupBy(fragments, (f) => actionFamilyOf(f.action));
  return Object.entries(groups)
    .map(([action, actionFragments]) => {
      const screens = uniqueSorted(actionFragments.map((f) => screenFromGraphNodeIds(f.graphNodeIds)));
      const avgConfidence = actionFragments.length === 0
        ? 0
        : round4(actionFragments.reduce((sum, f) => sum + (confidenceValues[f.confidence] ?? 0), 0) / actionFragments.length);
      return {
        action,
        fragmentCount: actionFragments.length,
        screenCount: screens.length,
        avgConfidence,
        thin: actionFragments.length < THIN_ACTION_THRESHOLD,
      };
    })
    .sort((a, b) => a.action.localeCompare(b.action));
}

function computeProvenanceCompleteness(fragments: readonly GroundedSpecFragment[]): number {
  if (fragments.length === 0) {
    return 1;
  }
  const complete = fragments.filter((f) => f.graphNodeIds.length > 0 && f.selectorRefs.length > 0).length;
  return round4(complete / fragments.length);
}

export function projectCorpusHealth(input: {
  readonly manifest: TrainingCorpusManifest;
  readonly fragments: readonly GroundedSpecFragment[];
  readonly generatedAt?: string | undefined;
}): CorpusHealthReport {
  const runtimeCoverage = buildRuntimeCoverage(input.fragments);
  const screenCoverage = buildScreenCoverage(input.fragments);
  const actionFamilyCoverage = buildActionFamilyCoverage(input.fragments);

  return {
    kind: 'corpus-health-report',
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    manifestFingerprint: sha256(stableStringify(input.manifest)),
    runtimeCoverage,
    screenCoverage,
    actionFamilyCoverage,
    thinScreens: screenCoverage.flatMap((s) => s.thin ? [s.screen] : []),
    thinActionFamilies: actionFamilyCoverage.flatMap((a) => a.thin ? [a.action] : []),
    fragmentProvenanceCompleteness: computeProvenanceCompleteness(input.fragments),
  };
}

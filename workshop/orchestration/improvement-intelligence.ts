/**
 * Improvement Intelligence Orchestrator — composes fitness reports,
 * workflow hotspots, and improvement signals into a unified improvement
 * strategy with cross-module correlation.
 *
 * Today these three modules operate independently:
 * - fitness.ts → PipelineFitnessReport (failure classification + 8 metrics)
 * - hotspots.ts → WorkflowHotspot[] (recurring patterns by screen/field/action)
 * - improvement.ts → failureSignals() (severity-tagged improvement signals)
 *
 * The improvement loop reads fitness but ignores hotspots. Nobody asks:
 * - Does the #1 failure class match the #1 recurring hotspot?
 * - Are failure patterns improving or worsening across iterations?
 * - Which screens are simultaneously a fitness failure AND a hotspot?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type { InterpretationDriftRecord, ResolutionGraphRecord, RunRecord } from '../../product/domain/execution/types';
import {
  summarizeTheoremBaseline,
  theoremBaselineCoverageForObligations,
  type LogicalProofObligationName,
  type LogicalTheoremGroup,
  type TheoremBaselineCoverage,
  type TheoremBaselineSummary,
  type PipelineFailureMode,
  type PipelineFitnessReport,
} from '../../product/domain/fitness/types';
import { buildWorkflowHotspots, type WorkflowHotspot } from '../../product/application/projections/hotspots';

// ─── Types ───

export interface FailureHotspotCorrelation {
  readonly failureClass: string;
  readonly hotspotKind: string;
  readonly sharedScreens: readonly string[];
  readonly correlationStrength: number;
  readonly fitnessImpact: number;
  readonly hotspotOccurrences: number;
}

export interface ImprovementPriority {
  readonly rank: number;
  readonly screen: string;
  readonly failureClasses: readonly string[];
  readonly hotspotKinds: readonly string[];
  readonly combinedScore: number;
  readonly fitnessContribution: number;
  readonly recurrenceCount: number;
  readonly suggestion: string;
}

export interface ImprovementTrend {
  readonly dimension: string;
  readonly values: readonly number[];
  readonly direction: 'improving' | 'stable' | 'degrading';
  readonly currentValue: number;
}

export interface ImprovementIntelligenceReport {
  readonly kind: 'improvement-intelligence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly fitnessReport: PipelineFitnessReport;
  readonly hotspots: readonly WorkflowHotspot[];

  readonly correlations: readonly FailureHotspotCorrelation[];
  readonly priorities: readonly ImprovementPriority[];
  readonly trends: readonly ImprovementTrend[];
  readonly theoremBaseline: readonly TheoremBaselineCoverage[];
  readonly theoremBaselineSummary: TheoremBaselineSummary;

  readonly topFailureIsHotspot: boolean;
  readonly correlationRate: number;
  readonly overallHealthScore: number;
}

// ─── Failure class → hotspot kind mapping ───

const FAILURE_TO_HOTSPOT_KIND: Readonly<Record<string, string>> = {
  'translation-threshold-miss': 'translation-win',
  'translation-normalization-gap': 'translation-win',
  'alias-coverage-gap': 'agentic-fallback-win',
  'resolution-rung-skip': 'agentic-fallback-win',
  'recovery-strategy-miss': 'recovery-policy-win',
  'convergence-stall': 'interpretation-drift',
  'trust-policy-over-block': 'resolution-graph-needs-human',
};

// ─── Correlation ───

/**
 * Correlate fitness failure classes with hotspot patterns.
 * A correlation exists when a failure class maps to a hotspot kind AND
 * they share the same screen.
 */
function computeCorrelations(
  fitnessReport: PipelineFitnessReport,
  hotspots: readonly WorkflowHotspot[],
): readonly FailureHotspotCorrelation[] {
  const totalSteps = fitnessReport.failureModes.reduce(
    (sum, fm) => sum + fm.affectedSteps, 0,
  );

  const correlations: FailureHotspotCorrelation[] = [];

  for (const fm of fitnessReport.failureModes) {
    const expectedHotspotKind = FAILURE_TO_HOTSPOT_KIND[fm.class];
    if (!expectedHotspotKind) continue;

    const matchingHotspots = hotspots.filter((h) => h.kind === expectedHotspotKind);
    if (matchingHotspots.length === 0) continue;

    // Find shared screens between failure mode examples and hotspot screens
    const failureScreens = extractScreensFromFailureMode(fm);
    const hotspotScreens = matchingHotspots.map((h) => h.screen);
    const sharedScreens = failureScreens.filter((s) => hotspotScreens.includes(s));

    const totalOccurrences = matchingHotspots.reduce(
      (sum, h) => sum + h.occurrenceCount, 0,
    );

    correlations.push({
      failureClass: fm.class,
      hotspotKind: expectedHotspotKind,
      sharedScreens,
      correlationStrength: sharedScreens.length > 0
        ? Math.min(sharedScreens.length / Math.max(failureScreens.length, 1), 1)
        : matchingHotspots.length > 0 ? 0.3 : 0,
      fitnessImpact: totalSteps > 0 ? fm.affectedSteps / totalSteps : 0,
      hotspotOccurrences: totalOccurrences,
    });
  }

  return correlations.sort((a, b) =>
    b.correlationStrength * b.fitnessImpact - a.correlationStrength * a.fitnessImpact,
  );
}

/**
 * Extract screen references from a failure mode's example intents.
 * Intents often contain screen references in format "screen:action" or similar.
 */
function extractScreensFromFailureMode(fm: PipelineFailureMode): readonly string[] {
  // Extract unique screen-like tokens from example intents
  const screens = new Set<string>();
  for (const intent of fm.exampleIntents) {
    // Intents may contain "Navigate to PolicySearch" or "Fill PolicySearch.PolicyNumber"
    const match = intent.match(/^(?:Navigate to |Fill |Click |Select |Assert )?(\w+)/);
    if (match?.[1]) {
      screens.add(match[1]);
    }
  }
  return [...screens];
}

// ─── Priority computation ───

/**
 * Compute improvement priorities: screens ranked by combined impact of
 * fitness failures AND hotspot recurrence.
 */
function computePriorities(
  fitnessReport: PipelineFitnessReport,
  hotspots: readonly WorkflowHotspot[],
  _correlations: readonly FailureHotspotCorrelation[],
): readonly ImprovementPriority[] {
  // Collect all unique screens from both sources
  const screenData = new Map<string, {
    failureClasses: Set<string>;
    hotspotKinds: Set<string>;
    fitnessContribution: number;
    recurrenceCount: number;
  }>();

  const totalSteps = fitnessReport.failureModes.reduce(
    (sum, fm) => sum + fm.affectedSteps, 0,
  ) || 1;

  // From failure modes
  for (const fm of fitnessReport.failureModes) {
    const screens = extractScreensFromFailureMode(fm);
    for (const screen of screens) {
      const existing = screenData.get(screen) ?? {
        failureClasses: new Set(),
        hotspotKinds: new Set(),
        fitnessContribution: 0,
        recurrenceCount: 0,
      };
      existing.failureClasses.add(fm.class);
      existing.fitnessContribution += fm.affectedSteps / totalSteps;
      screenData.set(screen, existing);
    }
  }

  // From hotspots
  for (const hotspot of hotspots) {
    const existing = screenData.get(hotspot.screen) ?? {
      failureClasses: new Set(),
      hotspotKinds: new Set(),
      fitnessContribution: 0,
      recurrenceCount: 0,
    };
    existing.hotspotKinds.add(hotspot.kind);
    existing.recurrenceCount += hotspot.occurrenceCount;
    screenData.set(hotspot.screen, existing);
  }

  // Score and rank
  const priorities: ImprovementPriority[] = [...screenData.entries()]
    .map(([screen, data]) => {
      const fitnessWeight = Math.min(data.fitnessContribution, 1);
      const recurrenceWeight = Math.min(data.recurrenceCount / 10, 1);
      const combinedScore = fitnessWeight * 0.6 + recurrenceWeight * 0.4;

      const suggestion = data.failureClasses.size > 0 && data.hotspotKinds.size > 0
        ? `Screen "${screen}" is both a fitness failure (${[...data.failureClasses].join(', ')}) and a recurring hotspot (${[...data.hotspotKinds].join(', ')}) — high-priority target`
        : data.failureClasses.size > 0
          ? `Screen "${screen}" has fitness failures (${[...data.failureClasses].join(', ')}) but no recurring hotspot pattern — investigate root cause`
          : `Screen "${screen}" is a recurring hotspot (${[...data.hotspotKinds].join(', ')}) but not a fitness failure — may resolve naturally`;

      return {
        rank: 0,
        screen,
        failureClasses: [...data.failureClasses].sort(),
        hotspotKinds: [...data.hotspotKinds].sort(),
        combinedScore,
        fitnessContribution: data.fitnessContribution,
        recurrenceCount: data.recurrenceCount,
        suggestion,
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore)
    .map((p, i) => ({ ...p, rank: i + 1 }));

  return priorities;
}

// ─── Trend analysis ───

/**
 * Compute improvement trends from a sequence of fitness reports.
 * Tracks whether key metrics are improving, stable, or degrading.
 */
export function computeImprovementTrends(
  reports: readonly PipelineFitnessReport[],
): readonly ImprovementTrend[] {
  if (reports.length === 0) return [];

  const proofObligationNames = [...new Set(
    reports.flatMap((report) => report.metrics.proofObligations?.map((entry) => entry.obligation) ?? []),
  )].sort();

  const theoremGroups: readonly LogicalTheoremGroup[] = ['K', 'L', 'S', 'D', 'V', 'R', 'A', 'H', 'C', 'M'];
  const theoremStatusScore = (report: PipelineFitnessReport, theoremGroup: LogicalTheoremGroup): number => {
    const entry = theoremBaselineCoverageForObligations(report.metrics.proofObligations ?? [])
      .find((coverage) => coverage.theoremGroup === theoremGroup);
    return entry?.status === 'direct' ? 1 : entry?.status === 'proxy' ? 0.5 : 0;
  };

  const dimensions: { name: string; extract: (r: PipelineFitnessReport) => number; higherIsBetter: boolean }[] = [
    { name: 'effectiveHitRate', extract: (r) => r.metrics.effectiveHitRate ?? r.metrics.knowledgeHitRate, higherIsBetter: true },
    { name: 'knowledgeHitRate', extract: (r) => r.metrics.knowledgeHitRate, higherIsBetter: true },
    { name: 'translationPrecision', extract: (r) => r.metrics.translationPrecision, higherIsBetter: true },
    { name: 'proposalYield', extract: (r) => r.metrics.proposalYield, higherIsBetter: true },
    { name: 'degradedLocatorRate', extract: (r) => r.metrics.degradedLocatorRate, higherIsBetter: false },
    { name: 'recoverySuccessRate', extract: (r) => r.metrics.recoverySuccessRate, higherIsBetter: true },
    {
      name: 'baseline:direct-count',
      extract: (report) => summarizeTheoremBaseline(theoremBaselineCoverageForObligations(report.metrics.proofObligations ?? [])).direct,
      higherIsBetter: true,
    },
    {
      name: 'baseline:proxy-count',
      extract: (report) => summarizeTheoremBaseline(theoremBaselineCoverageForObligations(report.metrics.proofObligations ?? [])).proxy,
      higherIsBetter: false,
    },
    {
      name: 'baseline:missing-count',
      extract: (report) => summarizeTheoremBaseline(theoremBaselineCoverageForObligations(report.metrics.proofObligations ?? [])).missing,
      higherIsBetter: false,
    },
    ...theoremGroups.map((group) => ({
      name: `baseline:${group}`,
      extract: (report: PipelineFitnessReport) => theoremStatusScore(report, group),
      higherIsBetter: true,
    })),
    ...proofObligationNames.map((obligation) => ({
      name: `proof:${obligation}`,
      extract: (report: PipelineFitnessReport) => proofObligationScore(report, obligation),
      higherIsBetter: true,
    })),
  ];

  return dimensions.map(({ name, extract, higherIsBetter }) => {
    const values = reports.map(extract);
    const currentValue = values[values.length - 1]!;

    let direction: 'improving' | 'stable' | 'degrading' = 'stable';
    if (values.length >= 2) {
      const first = values[0]!;
      const last = currentValue;
      const delta = last - first;
      const threshold = 0.05;

      if (higherIsBetter) {
        direction = delta > threshold ? 'improving' : delta < -threshold ? 'degrading' : 'stable';
      } else {
        direction = delta < -threshold ? 'improving' : delta > threshold ? 'degrading' : 'stable';
      }
    }

    return { dimension: name, values, direction, currentValue };
  });
}

function proofObligationScore(
  report: PipelineFitnessReport,
  obligation: LogicalProofObligationName,
): number {
  return report.metrics.proofObligations?.find((entry) => entry.obligation === obligation)?.score ?? 0;
}

// ─── Main orchestration ───

export interface ImprovementIntelligenceInput {
  readonly fitnessReport: PipelineFitnessReport;
  readonly runRecords: readonly RunRecord[];
  readonly driftRecords?: readonly InterpretationDriftRecord[];
  readonly resolutionGraphs?: readonly ResolutionGraphRecord[];
  readonly historicalReports?: readonly PipelineFitnessReport[];
  readonly generatedAt?: string;
}

/**
 * Compose fitness + hotspots + signals into a unified improvement strategy.
 *
 * Pure function: all inputs → single correlated report.
 */
export function buildImprovementIntelligence(
  input: ImprovementIntelligenceInput,
): ImprovementIntelligenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Build hotspots from run records
  const hotspots = buildWorkflowHotspots(
    input.runRecords,
    input.driftRecords ?? [],
    input.resolutionGraphs ?? [],
  );

  // 2. Correlate failure classes with hotspot patterns
  const correlations = computeCorrelations(input.fitnessReport, hotspots);

  // 3. Compute improvement priorities (combined fitness + hotspot)
  const priorities = computePriorities(input.fitnessReport, hotspots, correlations);

  // 4. Compute trends from historical reports
  const allReports = [
    ...(input.historicalReports ?? []),
    input.fitnessReport,
  ];
  const trends = computeImprovementTrends(allReports);
  const theoremBaseline = theoremBaselineCoverageForObligations(input.fitnessReport.metrics.proofObligations ?? []);
  const theoremBaselineSummary = summarizeTheoremBaseline(theoremBaseline);

  // 5. Aggregate scores
  const topFailure = input.fitnessReport.failureModes[0];
  const topFailureHotspotKind = topFailure
    ? FAILURE_TO_HOTSPOT_KIND[topFailure.class]
    : undefined;
  const topFailureIsHotspot = topFailureHotspotKind
    ? hotspots.some((h) => h.kind === topFailureHotspotKind)
    : false;

  const correlatedFailureClasses = new Set(correlations.map((c) => c.failureClass));
  const totalFailureClasses = input.fitnessReport.failureModes.length;
  const correlationRate = totalFailureClasses > 0
    ? correlatedFailureClasses.size / totalFailureClasses
    : 0;

  // Health score: weighted average of key fitness metrics
  const m = input.fitnessReport.metrics;
  const gateHitRate = m.effectiveHitRate ?? m.knowledgeHitRate;
  const overallHealthScore = (
    gateHitRate * 0.3 +
    m.knowledgeHitRate * 0.1 +
    m.translationPrecision * 0.2 +
    m.proposalYield * 0.15 +
    m.recoverySuccessRate * 0.15 +
    (1 - m.degradedLocatorRate) * 0.1
  );

  return {
    kind: 'improvement-intelligence-report',
    version: 1,
    generatedAt,
    fitnessReport: input.fitnessReport,
    hotspots,
    correlations,
    priorities,
    trends,
    theoremBaseline,
    theoremBaselineSummary,
    topFailureIsHotspot,
    correlationRate,
    overallHealthScore,
  };
}

/**
 * Extract the top N actionable priorities from an improvement intelligence report.
 */
export function extractTopPriorities(
  report: ImprovementIntelligenceReport,
  n: number = 5,
): readonly ImprovementPriority[] {
  return report.priorities.slice(0, n);
}

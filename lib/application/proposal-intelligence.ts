/**
 * Proposal Intelligence Orchestrator — composes three independent learning
 * modules (health, bottlenecks, rankings) into a unified proposal
 * intelligence report with cross-module correlation.
 *
 * Today these three modules are called separately:
 * - learning-health.ts → CorpusHealthReport (coverage, thinness, provenance)
 * - learning-bottlenecks.ts → KnowledgeBottleneckReport (ranked bottlenecks, signals)
 * - learning-rankings.ts → ProposalRankingReport (ranked proposals with scores)
 *
 * Nobody correlates their outputs. This orchestrator answers:
 * - Does the top-ranked proposal address the #1 bottleneck?
 * - Does a thin-coverage screen explain a bottleneck?
 * - What's the proposal-to-bottleneck alignment score?
 * - Which bottlenecks have NO proposals targeting them?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type {
  CorpusHealthReport,
  GroundedSpecFragment,
  KnowledgeBottleneckReport,
  ProposalBundle,
  ProposalRankingReport,
  RankedProposal,
  TrainingCorpusManifest,
} from '../domain/types';
import { projectCorpusHealth } from './learning-health';
import { projectBottlenecks } from './learning-bottlenecks';
import { rankProposals } from './learning-rankings';

// ─── Run Step Summary (mirrors learning-bottlenecks.ts internal type) ───

export interface RunStepSummary {
  readonly adoId: string;
  readonly winningSource: string;
  readonly resolutionMode: string;
  readonly screen: string;
  readonly action: string;
}

// ─── Types ───

export interface BottleneckProposalAlignment {
  readonly bottleneckRank: number;
  readonly bottleneckScreen: string;
  readonly bottleneckSignal: string;
  readonly bottleneckImpactScore: number;
  readonly matchingProposals: readonly RankedProposal[];
  readonly covered: boolean;
}

export interface CoverageBottleneckCorrelation {
  readonly screen: string;
  readonly isThinCoverage: boolean;
  readonly bottleneckRank: number | null;
  readonly bottleneckSignal: string | null;
  readonly explanation: string;
}

export interface ProposalIntelligenceReport {
  readonly kind: 'proposal-intelligence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly health: CorpusHealthReport;
  readonly bottlenecks: KnowledgeBottleneckReport;
  readonly rankings: ProposalRankingReport;

  readonly alignments: readonly BottleneckProposalAlignment[];
  readonly uncoveredBottlenecks: readonly BottleneckProposalAlignment[];
  readonly coverageCorrelations: readonly CoverageBottleneckCorrelation[];

  readonly alignmentScore: number;
  readonly coverageExplanationRate: number;
  readonly topBottleneckCovered: boolean;
}

// ─── Alignment computation ───

/**
 * For each bottleneck, find proposals that target the same screen.
 * A proposal "covers" a bottleneck if its artifact affects the bottleneck's screen.
 */
function computeAlignments(
  bottlenecks: KnowledgeBottleneckReport,
  rankings: ProposalRankingReport,
): readonly BottleneckProposalAlignment[] {
  return bottlenecks.bottlenecks.map((bn) => {
    const matchingProposals = rankings.rankings.filter((rp) => {
      const screens = rp.expectedImpact.affectedScreens ?? [];
      return screens.includes(bn.screen);
    });

    return {
      bottleneckRank: bn.rank,
      bottleneckScreen: bn.screen,
      bottleneckSignal: bn.signal,
      bottleneckImpactScore: bn.impactScore,
      matchingProposals,
      covered: matchingProposals.length > 0,
    };
  });
}

// ─── Coverage-bottleneck correlation ───

/**
 * For each thin-coverage screen from health report, check if it also
 * appears as a bottleneck. If so, thin coverage may explain the bottleneck.
 */
function computeCoverageCorrelations(
  health: CorpusHealthReport,
  bottlenecks: KnowledgeBottleneckReport,
): readonly CoverageBottleneckCorrelation[] {
  const bottleneckByScreen = new Map(
    bottlenecks.bottlenecks.map((bn) => [bn.screen, bn]),
  );

  return health.screenCoverage.map((sc) => {
    const bn = bottleneckByScreen.get(sc.screen);
    const isThin = health.thinScreens.includes(sc.screen);

    if (isThin && bn) {
      return {
        screen: sc.screen,
        isThinCoverage: true,
        bottleneckRank: bn.rank,
        bottleneckSignal: bn.signal,
        explanation: `Thin coverage (${sc.fragmentCount} fragments) likely explains ${bn.signal} bottleneck`,
      };
    }

    if (isThin) {
      return {
        screen: sc.screen,
        isThinCoverage: true,
        bottleneckRank: null,
        bottleneckSignal: null,
        explanation: `Thin coverage (${sc.fragmentCount} fragments) — not yet a bottleneck`,
      };
    }

    if (bn) {
      return {
        screen: sc.screen,
        isThinCoverage: false,
        bottleneckRank: bn.rank,
        bottleneckSignal: bn.signal,
        explanation: `Adequate coverage but still a ${bn.signal} bottleneck — coverage alone doesn't explain it`,
      };
    }

    return {
      screen: sc.screen,
      isThinCoverage: false,
      bottleneckRank: null,
      bottleneckSignal: null,
      explanation: 'Healthy',
    };
  });
}

// ─── Main orchestration ───

export interface ProposalIntelligenceInput {
  readonly manifest: TrainingCorpusManifest;
  readonly fragments: readonly GroundedSpecFragment[];
  readonly runStepSummaries: readonly RunStepSummary[];
  readonly proposalBundles: readonly ProposalBundle[];
  readonly generatedAt?: string;
}

/**
 * Compose health + bottlenecks + rankings into a unified intelligence report.
 *
 * Pure function: all inputs → single correlated report.
 */
export function buildProposalIntelligence(
  input: ProposalIntelligenceInput,
): ProposalIntelligenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Run the three independent modules
  const health = projectCorpusHealth({
    manifest: input.manifest,
    fragments: input.fragments,
    generatedAt,
  });

  const bottlenecks = projectBottlenecks({
    healthReport: health,
    fragments: input.fragments,
    runStepSummaries: input.runStepSummaries,
    generatedAt,
  });

  const rankings = rankProposals({
    proposalBundles: input.proposalBundles,
    bottleneckReport: bottlenecks,
    generatedAt,
  });

  // 2. Correlate outputs
  const alignments = computeAlignments(bottlenecks, rankings);
  const uncoveredBottlenecks = alignments.filter((a) => !a.covered);
  const coverageCorrelations = computeCoverageCorrelations(health, bottlenecks);

  // 3. Compute aggregate scores
  const alignmentScore = alignments.length > 0
    ? alignments.filter((a) => a.covered).length / alignments.length
    : 1;

  const thinWithBottleneck = coverageCorrelations.filter(
    (c) => c.isThinCoverage && c.bottleneckRank !== null,
  );
  const totalThin = coverageCorrelations.filter((c) => c.isThinCoverage);
  const coverageExplanationRate = totalThin.length > 0
    ? thinWithBottleneck.length / totalThin.length
    : 0;

  const topBottleneckCovered = alignments.length > 0
    ? alignments[0]!.covered
    : true;

  return {
    kind: 'proposal-intelligence-report',
    version: 1,
    generatedAt,
    health,
    bottlenecks,
    rankings,
    alignments,
    uncoveredBottlenecks,
    coverageCorrelations,
    alignmentScore,
    coverageExplanationRate,
    topBottleneckCovered,
  };
}

/**
 * From a ProposalIntelligenceReport, extract the top actionable items:
 * uncovered bottlenecks that need new proposals.
 */
export function extractUncoveredGaps(
  report: ProposalIntelligenceReport,
): readonly { readonly screen: string; readonly signal: string; readonly impactScore: number }[] {
  return report.uncoveredBottlenecks
    .map((a) => ({
      screen: a.bottleneckScreen,
      signal: a.bottleneckSignal,
      impactScore: a.bottleneckImpactScore,
    }))
    .sort((a, b) => b.impactScore - a.impactScore);
}

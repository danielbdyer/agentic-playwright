/**
 * Strategic Intelligence Orchestrator — composes proposal intelligence
 * and improvement intelligence into a unified strategic view.
 *
 * Today these two reports operate independently:
 * - proposal-intelligence.ts → ProposalIntelligenceReport (ranked proposals, bottleneck alignment)
 * - improvement-intelligence.ts → ImprovementIntelligenceReport (failure priorities, hotspot correlation)
 *
 * Nobody asks:
 * - Does the #1 ranked proposal address the #1 improvement priority?
 * - Which improvement priorities have no proposals targeting them?
 * - Which ranked proposals don't address any improvement priority?
 * - What's the overall strategic alignment score?
 *
 * All functions are pure: immutable inputs, immutable outputs, no side effects.
 */

import type {
  GroundedSpecFragment,
  ProposalBundle,
  RankedProposal,
  TrainingCorpusManifest,
} from '../domain/types';
import type { PipelineFitnessReport, RunRecord } from '../domain/types';
import {
  buildProposalIntelligence,
  type ProposalIntelligenceReport,
  type RunStepSummary,
} from './governance/proposal-intelligence';
import {
  buildImprovementIntelligence,
  type ImprovementIntelligenceReport,
  type ImprovementPriority,
} from './improvement-intelligence';

// ─── Types ───

export interface ProposalPriorityAlignment {
  readonly priorityRank: number;
  readonly priorityScreen: string;
  readonly priorityCombinedScore: number;
  readonly matchingProposals: readonly RankedProposal[];
  readonly covered: boolean;
  readonly coverageStrength: number;
}

export interface StrategicGap {
  readonly screen: string;
  readonly priorityRank: number;
  readonly combinedScore: number;
  readonly failureClasses: readonly string[];
  readonly suggestion: string;
}

export interface StrategicIntelligenceReport {
  readonly kind: 'strategic-intelligence-report';
  readonly version: 1;
  readonly generatedAt: string;

  readonly proposalIntelligence: ProposalIntelligenceReport;
  readonly improvementIntelligence: ImprovementIntelligenceReport;

  readonly strategicAlignments: readonly ProposalPriorityAlignment[];
  readonly uncoveredPriorities: readonly ProposalPriorityAlignment[];
  readonly unalignedProposals: readonly RankedProposal[];

  readonly strategicAlignmentScore: number;
  readonly topPriorityAddressed: boolean;
  readonly strategicEfficiency: number;
}

// ─── Alignment computation ───

/**
 * For each improvement priority, find ranked proposals that target the same screen.
 * A proposal "covers" a priority if its affected screens include the priority's screen.
 */
function computeStrategicAlignments(
  priorities: readonly ImprovementPriority[],
  rankings: readonly RankedProposal[],
): readonly ProposalPriorityAlignment[] {
  return priorities.map((priority) => {
    const matchingProposals = rankings.filter((rp) => {
      const screens = rp.expectedImpact.affectedScreens ?? [];
      return screens.includes(priority.screen);
    });

    const coverageStrength = matchingProposals.length > 0
      ? matchingProposals.reduce((sum, rp) => sum + rp.overallScore, 0) / matchingProposals.length
      : 0;

    return {
      priorityRank: priority.rank,
      priorityScreen: priority.screen,
      priorityCombinedScore: priority.combinedScore,
      matchingProposals,
      covered: matchingProposals.length > 0,
      coverageStrength,
    };
  });
}

/**
 * Find ranked proposals that don't target any improvement priority screen.
 */
function findUnalignedProposals(
  alignments: readonly ProposalPriorityAlignment[],
  rankings: readonly RankedProposal[],
): readonly RankedProposal[] {
  const coveredProposalIds = new Set(
    alignments.flatMap((a) => a.matchingProposals.map((rp) => rp.proposalId)),
  );
  return rankings.filter((rp) => !coveredProposalIds.has(rp.proposalId));
}

// ─── Main orchestration ───

export interface StrategicIntelligenceInput {
  readonly manifest: TrainingCorpusManifest;
  readonly fragments: readonly GroundedSpecFragment[];
  readonly runStepSummaries: readonly RunStepSummary[];
  readonly proposalBundles: readonly ProposalBundle[];
  readonly fitnessReport: PipelineFitnessReport;
  readonly runRecords: readonly RunRecord[];
  readonly generatedAt?: string;
}

/**
 * Compose proposal intelligence + improvement intelligence into a unified
 * strategic view with cross-report correlation.
 *
 * Pure function: all inputs → single strategic report.
 */
export function buildStrategicIntelligence(
  input: StrategicIntelligenceInput,
): StrategicIntelligenceReport {
  const generatedAt = input.generatedAt ?? new Date().toISOString();

  // 1. Build the two sibling reports
  const proposalIntelligence = buildProposalIntelligence({
    manifest: input.manifest,
    fragments: input.fragments,
    runStepSummaries: input.runStepSummaries,
    proposalBundles: input.proposalBundles,
    generatedAt,
  });

  const improvementIntelligence = buildImprovementIntelligence({
    fitnessReport: input.fitnessReport,
    runRecords: input.runRecords,
    generatedAt,
  });

  // 2. Correlate: match proposals to priorities
  const strategicAlignments = computeStrategicAlignments(
    improvementIntelligence.priorities,
    proposalIntelligence.rankings.rankings,
  );

  const uncoveredPriorities = strategicAlignments.filter((a) => !a.covered);
  const unalignedProposals = findUnalignedProposals(
    strategicAlignments,
    proposalIntelligence.rankings.rankings,
  );

  // 3. Aggregate scores
  const strategicAlignmentScore = strategicAlignments.length > 0
    ? strategicAlignments.filter((a) => a.covered).length / strategicAlignments.length
    : 1;

  const topPriorityAddressed = strategicAlignments.length > 0
    ? strategicAlignments[0]!.covered
    : true;

  // Strategic efficiency: ratio of proposals that address at least one priority
  const totalProposals = proposalIntelligence.rankings.rankings.length;
  const alignedProposalCount = totalProposals - unalignedProposals.length;
  const strategicEfficiency = totalProposals > 0
    ? alignedProposalCount / totalProposals
    : 1;

  return {
    kind: 'strategic-intelligence-report',
    version: 1,
    generatedAt,
    proposalIntelligence,
    improvementIntelligence,
    strategicAlignments,
    uncoveredPriorities,
    unalignedProposals,
    strategicAlignmentScore,
    topPriorityAddressed,
    strategicEfficiency,
  };
}

/**
 * Extract the top actionable strategic gaps: improvement priorities
 * that have no proposals targeting them, sorted by combinedScore descending.
 */
export function extractStrategicGaps(
  report: StrategicIntelligenceReport,
): readonly StrategicGap[] {
  return report.uncoveredPriorities
    .map((a) => {
      const priority = report.improvementIntelligence.priorities.find(
        (p) => p.rank === a.priorityRank,
      );
      return {
        screen: a.priorityScreen,
        priorityRank: a.priorityRank,
        combinedScore: a.priorityCombinedScore,
        failureClasses: priority?.failureClasses ?? [],
        suggestion: priority?.suggestion ?? 'No matching priority found',
      };
    })
    .sort((a, b) => b.combinedScore - a.combinedScore);
}

/**
 * Compute how efficiently the proposal portfolio addresses improvement priorities.
 * Returns a number in [0, 1] where 1 means every priority is covered by
 * high-scoring proposals and every proposal addresses a priority.
 */
export function computeStrategicEfficiency(
  report: StrategicIntelligenceReport,
): number {
  const alignmentComponent = report.strategicAlignmentScore;
  const efficiencyComponent = report.strategicEfficiency;
  return alignmentComponent * 0.6 + efficiencyComponent * 0.4;
}

import { isPending } from '../../domain/governance/proposal-lifecycle';
import type {
  KnowledgeBottleneckReport,
  ProposalBundle,
  ProposalEntry,
  ProposalRankingReport,
  RankedProposal,
  RankingWeights,
} from '../../domain/types';
import { DEFAULT_PIPELINE_CONFIG } from '../../domain/types';
import { uniqueSorted } from '../../domain/kernel/collections';
import {
  round4,
  combineScoringRules,
  weightedScoringRule,
  type ScoringRule,
} from './learning-shared';

// ─── Composable scoring rules for proposal ranking ───

interface ProposalContext {
  readonly affectedScenarioCount: number;
  readonly bottleneckReduction: number;
  readonly trustPolicyWeight: number;
  readonly hasEvidence: boolean;
}

const scenarioImpactRule: ScoringRule<ProposalContext> = {
  score: (ctx) => Math.min(ctx.affectedScenarioCount / 10, 1),
};
const bottleneckReductionRule: ScoringRule<ProposalContext> = {
  score: (ctx) => ctx.bottleneckReduction,
};
const trustWeightRule: ScoringRule<ProposalContext> = {
  score: (ctx) => ctx.trustPolicyWeight,
};
const evidenceRule: ScoringRule<ProposalContext> = {
  score: (ctx) => ctx.hasEvidence ? 0.8 : 0.3,
};

function buildProposalScoring(weights: RankingWeights = DEFAULT_PIPELINE_CONFIG.proposalRankingWeights): ScoringRule<ProposalContext> {
  return combineScoringRules<ProposalContext>(
    weightedScoringRule(weights.scenarioImpact, scenarioImpactRule),
    weightedScoringRule(weights.bottleneckReduction, bottleneckReductionRule),
    weightedScoringRule(weights.trustPolicy, trustWeightRule),
    weightedScoringRule(weights.evidence, evidenceRule),
  );
}

const proposalScoring = buildProposalScoring();

function pendingProposals(bundles: readonly ProposalBundle[]): ReadonlyArray<{
  readonly bundle: ProposalBundle;
  readonly proposal: ProposalEntry;
}> {
  return bundles.flatMap((bundle) =>
    bundle.proposals
      .flatMap((p) => isPending(p.activation) ? [{ bundle, proposal: p }] : []),
  );
}

/** Pre-compute a Map from screen name → Set of adoIds whose proposals touch that screen. */
function buildScreenAffinity(allBundles: readonly ProposalBundle[]): ReadonlyMap<string, ReadonlySet<string>> {
  const index = new Map<string, Set<string>>();
  for (const bundle of allBundles) {
    for (const p of bundle.proposals) {
      const screen = extractScreenFromTargetPath(p.targetPath);
      if (screen.length > 0) {
        const existing = index.get(screen);
        if (existing) {
          existing.add(bundle.adoId);
        } else {
          index.set(screen, new Set([bundle.adoId]));
        }
      }
    }
  }
  return index;
}

function extractScreenFromTargetPath(targetPath: string): string {
  return targetPath.split('/').find((seg) =>
    seg.endsWith('.elements.yaml') || seg.endsWith('.hints.yaml') || seg.endsWith('.surface.yaml'),
  )?.replace(/\.(elements|hints|surface)\.yaml$/, '') ?? '';
}

function computeAffectedScenarioCount(
  proposal: ProposalEntry,
  bundle: ProposalBundle,
  screenAffinity: ReadonlyMap<string, ReadonlySet<string>>,
): number {
  const screen = extractScreenFromTargetPath(proposal.targetPath);
  if (screen.length === 0) {
    return 1;
  }
  const affected = screenAffinity.get(screen);
  return affected ? Math.max(affected.size, 1) : 1;
}

function computeBottleneckReduction(
  proposal: ProposalEntry,
  bottleneckReport: KnowledgeBottleneckReport | null,
): number {
  if (!bottleneckReport || bottleneckReport.bottlenecks.length === 0) {
    return 0;
  }
  const topBottleneck = bottleneckReport.bottlenecks[0]!;
  const targetScreen = proposal.targetPath.split('/').find((seg) =>
    seg.endsWith('.elements.yaml') || seg.endsWith('.hints.yaml') || seg.endsWith('.surface.yaml'),
  )?.replace(/\.(elements|hints|surface)\.yaml$/, '') ?? '';

  return targetScreen === topBottleneck.screen
    ? round4(topBottleneck.impactScore * 0.5)
    : 0;
}

/** Trust policy decision → scoring weight. Strategy record instead of switch. */
const TRUST_POLICY_WEIGHTS: Readonly<Record<string, number>> = {
  allow: 1.0, review: 0.6, block: 0.1,
};

const trustPolicyWeight = (decision: string): number =>
  TRUST_POLICY_WEIGHTS[decision] ?? 0.5;

function buildRationale(
  proposal: ProposalEntry,
  affectedCount: number,
  bottleneckReduction: number,
): readonly string[] {
  return [
    ...(affectedCount > 1 ? [`Affects ${affectedCount} scenarios`] : []),
    ...(bottleneckReduction > 0 ? [`Reduces top bottleneck by ${(bottleneckReduction * 100).toFixed(1)}%`] : []),
    `Trust policy: ${proposal.trustPolicy.decision}`,
    `Artifact type: ${proposal.artifactType}`,
  ];
}

export function rankProposals(input: {
  readonly proposalBundles: readonly ProposalBundle[];
  readonly bottleneckReport: KnowledgeBottleneckReport | null;
  readonly generatedAt?: string | undefined;
  readonly rankingWeights?: RankingWeights | undefined;
}): ProposalRankingReport {
  const scoring = input.rankingWeights ? buildProposalScoring(input.rankingWeights) : proposalScoring;
  const pending = pendingProposals(input.proposalBundles);
  const screenAffinity = buildScreenAffinity(input.proposalBundles);

  const scored: readonly RankedProposal[] = pending.map(({ bundle, proposal }) => {
    const affectedScenarioCount = computeAffectedScenarioCount(proposal, bundle, screenAffinity);
    const bottleneckReduction = computeBottleneckReduction(proposal, input.bottleneckReport);
    const tpWeight = trustPolicyWeight(proposal.trustPolicy.decision);
    const affectedScreens = uniqueSorted(
      proposal.targetPath.split('/')
        .flatMap((seg) => seg.endsWith('.yaml') ? [seg.replace(/\.(elements|hints|surface|postures|behavior)\.yaml$/, '')] : []),
    );

    const ctx: ProposalContext = {
      affectedScenarioCount,
      bottleneckReduction,
      trustPolicyWeight: tpWeight,
      hasEvidence: proposal.evidenceIds.length > 0,
    };

    return {
      rank: 0,
      proposalId: proposal.proposalId ?? `${bundle.adoId}:${proposal.artifactType}:${proposal.stepIndex}`,
      adoId: bundle.adoId,
      artifactType: proposal.artifactType,
      expectedImpact: {
        affectedScenarioCount,
        affectedScreens,
        bottleneckReduction,
        expectedReproducibilityDelta: round4(bottleneckReduction * 0.3),
        trustPolicyDecision: proposal.trustPolicy.decision,
      },
      overallScore: round4(scoring.score(ctx)),
      rationale: buildRationale(proposal, affectedScenarioCount, bottleneckReduction),
    };
  });

  const ranked = [...scored]
    .sort((a, b) => b.overallScore - a.overallScore || a.proposalId.localeCompare(b.proposalId))
    .map((r, i) => ({ ...r, rank: i + 1 }));

  return {
    kind: 'proposal-ranking-report',
    version: 1,
    generatedAt: input.generatedAt ?? new Date(0).toISOString(),
    rankings: ranked,
    totalPending: pending.length,
    totalRanked: ranked.length,
  };
}

import type {
  KnowledgeBottleneckReport,
  ProposalBundle,
  ProposalEntry,
  ProposalRankingReport,
  RankedProposal,
} from '../domain/types';
import { uniqueSorted } from '../domain/collections';

function round4(value: number): number {
  return Number(value.toFixed(4));
}

function pendingProposals(bundles: readonly ProposalBundle[]): ReadonlyArray<{
  readonly bundle: ProposalBundle;
  readonly proposal: ProposalEntry;
}> {
  return bundles.flatMap((bundle) =>
    bundle.proposals
      .filter((p) => p.activation.status === 'pending')
      .map((proposal) => ({ bundle, proposal })),
  );
}

function computeAffectedScenarioCount(
  proposal: ProposalEntry,
  bundle: ProposalBundle,
  allBundles: readonly ProposalBundle[],
): number {
  const screen = proposal.targetPath.split('/').find((seg) =>
    seg.endsWith('.elements.yaml') || seg.endsWith('.hints.yaml') || seg.endsWith('.surface.yaml'),
  )?.replace(/\.(elements|hints|surface)\.yaml$/, '') ?? '';
  if (screen.length === 0) {
    return 1;
  }
  const affected = new Set<string>();
  affected.add(bundle.adoId);
  for (const other of allBundles) {
    for (const p of other.proposals) {
      if (p.targetPath.includes(screen)) {
        affected.add(other.adoId);
      }
    }
  }
  return affected.size;
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

function trustPolicyWeight(decision: string): number {
  switch (decision) {
    case 'allow': return 1.0;
    case 'review': return 0.6;
    case 'block': return 0.1;
    default: return 0.5;
  }
}

function buildRationale(
  proposal: ProposalEntry,
  affectedCount: number,
  bottleneckReduction: number,
): readonly string[] {
  const lines: string[] = [];
  if (affectedCount > 1) {
    lines.push(`Affects ${affectedCount} scenarios`);
  }
  if (bottleneckReduction > 0) {
    lines.push(`Reduces top bottleneck by ${(bottleneckReduction * 100).toFixed(1)}%`);
  }
  lines.push(`Trust policy: ${proposal.trustPolicy.decision}`);
  lines.push(`Artifact type: ${proposal.artifactType}`);
  return lines;
}

export function rankProposals(input: {
  readonly proposalBundles: readonly ProposalBundle[];
  readonly bottleneckReport: KnowledgeBottleneckReport | null;
  readonly generatedAt?: string | undefined;
}): ProposalRankingReport {
  const pending = pendingProposals(input.proposalBundles);

  const scored: RankedProposal[] = pending.map(({ bundle, proposal }) => {
    const affectedScenarioCount = computeAffectedScenarioCount(proposal, bundle, input.proposalBundles);
    const bottleneckReduction = computeBottleneckReduction(proposal, input.bottleneckReport);
    const tpWeight = trustPolicyWeight(proposal.trustPolicy.decision);
    const affectedScreens = uniqueSorted(
      proposal.targetPath.split('/')
        .filter((seg) => seg.endsWith('.yaml'))
        .map((seg) => seg.replace(/\.(elements|hints|surface|postures|behavior)\.yaml$/, '')),
    );

    const overallScore = round4(
      0.3 * Math.min(affectedScenarioCount / 10, 1) +
      0.3 * bottleneckReduction +
      0.2 * tpWeight +
      0.2 * (proposal.evidenceIds.length > 0 ? 0.8 : 0.3),
    );

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
      overallScore,
      rationale: buildRationale(proposal, affectedScenarioCount, bottleneckReduction),
    };
  });

  const ranked = scored
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

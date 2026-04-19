import { fingerprintFor } from '../../domain/kernel/hash';
import { isBlocked } from '../../domain/proposal/lifecycle';
import type { AdoId } from '../../domain/kernel/identity';
import type { ProposalBundle, ProposalEntry, RunRecord } from '../../domain/execution/types';
import type { StepWinningSource, WorkflowLane } from '../../domain/governance/workflow-types';
import type {
  InterventionAuthority,
  InterventionCompetingCandidate,
  InterventionHandoff,
  InterventionParticipationMode,
  InterventionStaleness,
} from '../../domain/handshake/intervention';
import { epistemicStatusForSource } from '../../domain/handshake/epistemic-brand';
import { createSemanticCore } from '../../domain/handshake/semantic-core';
import type { ImprovementRun } from '../../domain/improvement/types';
import { foldOperatorInboxKind } from '../../domain/resolution/inbox-fold';
import type { OperatorInboxItem } from '../../domain/resolution/types';
import type { WorkspaceCatalog } from '../catalog';
import { compareStrings, uniqueSorted } from '../../domain/kernel/collections';
import type { WorkflowHotspot } from '../../../workshop/orchestration/hotspots';
import type { RerunPlan } from '../../domain/resolution/types';

function latestRuns(catalog: WorkspaceCatalog): Map<AdoId, RunRecord> {
  return new Map(
    [...catalog.runRecords]
      .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))
      .map((entry) => [entry.artifact.adoId, entry.artifact] as const),
  );
}

function proposalId(
  bundle: { readonly payload: Pick<ProposalBundle['payload'], 'adoId' | 'suite'> },
  proposal: Pick<ProposalEntry, 'artifactType' | 'targetPath' | 'title' | 'patch' | 'impactedSteps'>,
): string {
  return `proposal-${fingerprintFor('proposal-id', {
    adoId: bundle.payload.adoId,
    suite: bundle.payload.suite,
    artifactType: proposal.artifactType,
    targetPath: proposal.targetPath,
    title: proposal.title,
    patch: proposal.patch,
    impactedSteps: proposal.impactedSteps,
  })}`;
}

function inboxItemId(input: {
  kind: OperatorInboxItem['kind'];
  adoId?: AdoId | null | undefined;
  runId?: string | null | undefined;
  proposalId?: string | null | undefined;
  stepIndex?: number | null | undefined;
  targetPath?: string | null | undefined;
}): string {
  return `inbox-${fingerprintFor('inbox-item-id', input)}`;
}

/** Handoff profile — the tuple of fields that depend only on the inbox
 *  `kind`. Phase 2.3 migration: previously these 5 fields were computed
 *  by 5 separate `switch` statements. Now they come from a single
 *  `foldOperatorInboxKind` call that the compiler checks exhaustively.
 *  Adding a new `OperatorInboxItemKind` variant breaks the build here
 *  and nowhere else. */
interface InboxHandoffProfile {
  readonly requestedParticipation: InterventionParticipationMode;
  readonly blockageType: InterventionHandoff['blockageType'];
  readonly blastRadius: InterventionHandoff['blastRadius'];
  readonly requiredCapabilities: NonNullable<InterventionHandoff['requiredCapabilities']>;
  readonly requiredAuthorities: readonly InterventionAuthority[];
}

function inboxHandoffProfile(item: OperatorInboxItem): InboxHandoffProfile {
  return foldOperatorInboxKind<InboxHandoffProfile>(item, {
    proposal: () => ({
      requestedParticipation: 'approve',
      blockageType: 'knowledge-gap',
      blastRadius: 'review-bound',
      requiredCapabilities: ['inspect-artifacts', 'approve-proposals'],
      requiredAuthorities: ['approve-canonical-change'],
    }),
    blockedPolicy: () => ({
      requestedParticipation: 'approve',
      blockageType: 'policy-block',
      blastRadius: 'review-bound',
      requiredCapabilities: ['inspect-artifacts', 'approve-proposals'],
      requiredAuthorities: ['approve-canonical-change'],
    }),
    degradedLocator: () => ({
      requestedParticipation: 'inspect',
      blockageType: 'locator-degradation',
      blastRadius: 'local',
      requiredCapabilities: ['inspect-artifacts', 'review-execution'],
      requiredAuthorities: [],
    }),
    needsHuman: () => ({
      requestedParticipation: 'interpret',
      blockageType: 'target-ambiguity',
      blastRadius: 'local',
      requiredCapabilities: ['inspect-artifacts', 'discover-surfaces', 'propose-fragments'],
      requiredAuthorities: [],
    }),
    approvedEquivalent: () => ({
      requestedParticipation: 'verify',
      blockageType: 'execution-review',
      blastRadius: 'local',
      requiredCapabilities: ['inspect-artifacts', 'review-execution'],
      requiredAuthorities: [],
    }),
    recovery: () => ({
      requestedParticipation: 'choose',
      blockageType: 'recovery-gap',
      blastRadius: 'local',
      requiredCapabilities: ['inspect-artifacts', 'request-reruns'],
      requiredAuthorities: ['request-rerun'],
    }),
  });
}

function epistemicStatus(item: OperatorInboxItem): InterventionHandoff['epistemicStatus'] {
  // Phase 2.2/T6 migration: route through the audited source-to-status
  // mapping in `product/domain/handshake/epistemic-brand.ts` so this site can
  // never accidentally mint `observed` from a non-runtime source. The
  // inbox item's `status` discriminator is mapped to an explicit source
  // string that the brand's `epistemicStatusForSource` understands.
  switch (item.status) {
    case 'approved':
      return epistemicStatusForSource('approved-canon');
    case 'blocked':
      return epistemicStatusForSource('trust-policy-block');
    case 'informational':
      return 'informational';
    case 'actionable':
      return epistemicStatusForSource('review-pending');
  }
}

function estimateReadTokens(parts: readonly string[]): number {
  return Math.max(1, Math.ceil(parts.join(' ').length / 4));
}

function nextMoves(item: OperatorInboxItem, requested: InterventionParticipationMode): NonNullable<InterventionHandoff['nextMoves']> {
  return item.nextCommands.slice(0, 3).map((command) => ({
    action: command,
    command,
    rationale: `Supports the requested participation mode "${requested}".`,
  }));
}

function handoffStaleness(observedAt: string | null): InterventionStaleness | null {
  return observedAt
    ? {
        observedAt,
        reviewBy: null,
        status: 'fresh',
        rationale: 'Freshly derived from the latest known run or proposal surface.',
      }
    : null;
}

function finalizeInboxItem(
  item: OperatorInboxItem,
  options: {
    readonly observedAt?: string | null | undefined;
    readonly competingCandidates?: readonly InterventionCompetingCandidate[] | undefined;
  } = {},
): OperatorInboxItem {
  // Phase 2.3 migration: one exhaustive fold replaces 5 separate switches
  // (requestedParticipation, blockageType, blastRadius, requiredCapabilities,
  // requiredAuthorities). The compiler now checks that adding a new
  // OperatorInboxItemKind breaks the build at exactly one site instead of
  // silently allowing missing branches to return undefined.
  const profile = inboxHandoffProfile(item);
  const requested = profile.requestedParticipation;
  const evidencePaths = [item.artifactPath, item.targetPath].filter((value): value is string => Boolean(value));
  return {
    ...item,
    requestedParticipation: requested,
    handoff: {
      unresolvedIntent: item.summary,
      attemptedStrategies: [item.winningSource, item.resolutionMode].flatMap((value) => (value ? [value] : [])),
      evidenceSlice: {
        artifactPaths: evidencePaths,
        summaries: [item.summary],
      },
      blockageType: profile.blockageType,
      requestedParticipation: requested,
      requiredCapabilities: profile.requiredCapabilities,
      requiredAuthorities: profile.requiredAuthorities,
      blastRadius: profile.blastRadius,
      epistemicStatus: epistemicStatus(item),
      semanticCore: createSemanticCore({
        namespace: 'operator-inbox',
        summary: item.title,
        stableFields: {
          id: item.id,
          kind: item.kind,
          status: item.status,
          adoId: item.adoId ?? null,
          proposalId: item.proposalId ?? null,
          runId: item.runId ?? null,
          stepIndex: item.stepIndex ?? null,
          targetPath: item.targetPath ?? null,
          artifactPath: item.artifactPath ?? null,
        },
      }),
      staleness: handoffStaleness(options.observedAt ?? null),
      nextMoves: nextMoves(item, requested),
      competingCandidates: options.competingCandidates ?? [],
      tokenImpact: {
        payloadSizeBytes: item.title.length + item.summary.length,
        estimatedReadTokens: estimateReadTokens([item.title, item.summary, ...item.nextCommands]),
      },
      chain: {
        depth: 1,
        previousSemanticToken: null,
        semanticCorePreserved: true,
        driftDetectable: true,
        competingCandidateCount: (options.competingCandidates ?? []).length,
      },
    },
  };
}

interface ProposalCandidateContext {
  readonly proposalId: string;
  readonly targetPath: string;
  readonly title: string;
  readonly source: string;
  readonly status: InterventionHandoff['epistemicStatus'];
}

function proposalCandidateStatus(
  proposal: ProposalEntry,
  approved: boolean,
): InterventionHandoff['epistemicStatus'] {
  if (isBlocked(proposal.activation)) return 'blocked';
  if (proposal.certification === 'certified' || approved) return 'approved';
  return 'review-required';
}

function competingCandidatesFor(
  proposalIdValue: string,
  targetPath: string,
  allCandidates: readonly ProposalCandidateContext[],
): readonly InterventionCompetingCandidate[] {
  return allCandidates
    .filter((candidate) => candidate.targetPath === targetPath && candidate.proposalId !== proposalIdValue)
    .map((candidate) => ({
      ref: candidate.proposalId,
      summary: candidate.title,
      source: candidate.source,
      status: candidate.status,
    }))
    .sort((left, right) => compareStrings(left.ref, right.ref));
}

function runStepMetadata(
  run: RunRecord | null,
  stepIndex: number | null,
): { winningConcern: WorkflowLane | null; winningSource: StepWinningSource | null; resolutionMode: RunRecord['steps'][number]['interpretation']['resolutionMode'] | null } {
  if (!run || stepIndex === null) {
    return { winningConcern: null, winningSource: null, resolutionMode: null };
  }
  const step = run.steps.find((entry) => entry.stepIndex === stepIndex) ?? null;
  return {
    winningConcern: step?.interpretation.winningConcern ?? null,
    winningSource: step?.interpretation.winningSource ?? null,
    resolutionMode: step?.interpretation.resolutionMode ?? null,
  };
}

export function proposalIdForEntry(
  bundle: { readonly payload: Pick<ProposalBundle['payload'], 'adoId' | 'suite'> },
  proposal: Pick<ProposalEntry, 'artifactType' | 'targetPath' | 'title' | 'patch' | 'impactedSteps'>,
): string {
  return proposalId(bundle, proposal);
}

export function buildOperatorInboxItems(catalog: WorkspaceCatalog): OperatorInboxItem[] {
  const approvals = new Set(catalog.approvalReceipts.map((entry) => entry.artifact.proposalId));
  const latestRunByAdo = latestRuns(catalog);
  const seenProposalIds = new Set<string>();
  const proposalContexts = catalog.proposalBundles.flatMap((bundleEntry) =>
    bundleEntry.artifact.payload.proposals.map((proposal) => {
      const stableProposalId = proposal.proposalId || proposalId(bundleEntry.artifact, proposal);
      return {
        proposalId: stableProposalId,
        targetPath: proposal.targetPath,
        title: proposal.title,
        source: proposal.category ?? 'uncategorized',
        status: proposalCandidateStatus(proposal, approvals.has(stableProposalId)),
      } satisfies ProposalCandidateContext;
    }),
  );

  // Source 1: proposal bundles → proposal + blocked-policy items
  const proposalItems = [...catalog.proposalBundles]
    .sort((a, b) => b.artifact.payload.runId.localeCompare(a.artifact.payload.runId))
    .flatMap((bundleEntry) => {
      const bundle = bundleEntry.artifact;
      const run = latestRunByAdo.get(bundle.payload.adoId) ?? null;
      return bundle.payload.proposals.flatMap((proposal): readonly OperatorInboxItem[] => {
        const stableProposalId = proposal.proposalId || proposalId(bundle, proposal);
        if (seenProposalIds.has(stableProposalId)) return [];
        seenProposalIds.add(stableProposalId);
        const metadata = runStepMetadata(run, proposal.stepIndex);
        const kind = isBlocked(proposal.activation) ? 'blocked-policy' as const : 'proposal' as const;
        return [finalizeInboxItem({
          id: inboxItemId({ kind, adoId: bundle.payload.adoId, runId: bundle.payload.runId, proposalId: stableProposalId, stepIndex: proposal.stepIndex, targetPath: proposal.targetPath }),
          kind,
          status: isBlocked(proposal.activation) ? 'blocked'
            : proposal.certification === 'certified' || approvals.has(stableProposalId) ? 'approved' : 'actionable',
          title: proposal.title,
          summary: isBlocked(proposal.activation)
            ? `Active-canon activation failed for ${proposal.artifactType} at ${proposal.targetPath}: ${proposal.activation.reason ?? 'unknown reason'}.`
            : proposal.certification === 'certified'
              ? `Certified canon is active for ${proposal.artifactType} at ${proposal.targetPath}.`
              : `Active canon is live for ${proposal.artifactType} at ${proposal.targetPath} and remains uncertified.`,
          adoId: bundle.payload.adoId, suite: bundle.payload.suite, runId: bundle.payload.runId, stepIndex: proposal.stepIndex,
          proposalId: stableProposalId, artifactPath: bundleEntry.artifactPath, targetPath: proposal.targetPath,
          winningConcern: metadata.winningConcern, winningSource: metadata.winningSource, resolutionMode: metadata.resolutionMode,
          nextCommands: isBlocked(proposal.activation)
            ? uniqueSorted([`tesseract workflow --ado-id ${bundle.payload.adoId}`, `tesseract inbox`])
            : uniqueSorted([`tesseract certify --proposal-id ${stableProposalId}`, `tesseract approve --proposal-id ${stableProposalId}`, `tesseract rerun-plan --proposal-id ${stableProposalId}`, `tesseract workflow --ado-id ${bundle.payload.adoId}`]),
        }, {
          observedAt: run?.payload.completedAt ?? null,
          competingCandidates: competingCandidatesFor(stableProposalId, proposal.targetPath, proposalContexts),
        })];
      });
    });

  // Source 2: resolution graphs → needs-human items
  const graphItems = catalog.resolutionGraphRecords.flatMap((graphEntry): readonly OperatorInboxItem[] => {
    const graph = graphEntry.artifact;
    const liveDomWins = graph.steps.filter((s) => s.graph.winner.rung === 'live-dom').length;
    const needsHumanWins = graph.steps.filter((s) => s.graph.winner.rung === 'needs-human').length;
    if (liveDomWins === 0 && needsHumanWins === 0) return [];
    return [finalizeInboxItem({
      id: inboxItemId({ kind: 'needs-human', adoId: graph.adoId, runId: graph.runId, stepIndex: null }),
      kind: 'needs-human', status: needsHumanWins > 0 ? 'actionable' : 'informational',
      title: `Resolution graph hotspot for run ${graph.runId}`,
      summary: `Resolution graph winners include live-dom=${liveDomWins}, needs-human=${needsHumanWins}.`,
      adoId: graph.adoId, suite: null, runId: graph.runId, stepIndex: null,
      proposalId: null, artifactPath: null, targetPath: null,
      winningConcern: 'resolution', winningSource: needsHumanWins > 0 ? 'none' : 'live-dom', resolutionMode: 'agentic',
      nextCommands: uniqueSorted([`tesseract replay-interpretation --ado-id ${graph.adoId}`, `tesseract inbox`]),
    }, {
      observedAt: latestRunByAdo.get(graph.adoId)?.payload.completedAt ?? null,
    })];
  });

  // Source 3: run steps → degraded-locator + needs-human + approved-equivalent items
  const stepItems = [...latestRunByAdo.values()].flatMap((run) =>
    run.steps.flatMap((step): readonly OperatorInboxItem[] => {
      const base = {
        adoId: run.adoId, suite: run.suite, runId: run.runId, stepIndex: step.stepIndex,
        artifactPath: null as string | null, targetPath: null as string | null,
        winningConcern: step.interpretation.winningConcern, winningSource: step.interpretation.winningSource,
        resolutionMode: step.interpretation.resolutionMode,
        nextCommands: uniqueSorted([`tesseract workflow --ado-id ${run.adoId}`, `tesseract inbox`]),
      };
      return [
        ...(step.execution.degraded ? [{
          ...base, id: inboxItemId({ kind: 'degraded-locator' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'degraded-locator' as const, status: 'actionable' as const, proposalId: null as string | null,
          title: `Degraded locator on step ${step.stepIndex}`,
          summary: `Runtime resolved step ${step.stepIndex} with a degraded locator strategy.`,
        }].map((item) => finalizeInboxItem(item, { observedAt: run.payload.completedAt })) : []),
        ...(step.interpretation.kind === 'needs-human' ? [{
          ...base, id: inboxItemId({ kind: 'needs-human' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'needs-human' as const, status: 'actionable' as const, proposalId: null as string | null,
          title: `Needs human on step ${step.stepIndex}`,
          summary: `Runtime exhausted approved knowledge and live DOM resolution for step ${step.stepIndex}.`,
        }].map((item) => finalizeInboxItem(item, { observedAt: run.payload.completedAt })) : []),
        ...(step.interpretation.winningSource === 'approved-equivalent' && step.execution.execution.status === 'ok' ? [{
          ...base, id: inboxItemId({ kind: 'approved-equivalent' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'approved-equivalent' as const, status: 'informational' as const, proposalId: null as string | null,
          title: `Approved-equivalent overlay on step ${step.stepIndex}`,
          summary: `Step ${step.stepIndex} executed green using derived confidence overlays instead of approved canon.`,
          targetPath: step.interpretation.overlayRefs[0] ?? null,
        }].map((item) => finalizeInboxItem(item, { observedAt: run.payload.completedAt })) : []),
      ];
    }),
  );

  return [...proposalItems, ...graphItems, ...stepItems].sort((a, b) => compareStrings(a.id, b.id));
}

export function operatorInboxItemsForScenario(items: readonly OperatorInboxItem[], adoId: AdoId): OperatorInboxItem[] {
  return items
    .filter((item) => item.adoId === adoId)
    .sort((left, right) => compareStrings(left.id, right.id));
}

export function findProposalById(catalog: WorkspaceCatalog, proposalIdValue: string): {
  bundle: ProposalBundle;
  proposal: ProposalEntry;
  artifactPath: string;
} | null {
  return catalog.proposalBundles
    .flatMap((entry) => entry.artifact.payload.proposals.map((p: ProposalEntry) => ({ bundle: entry.artifact, proposal: p, artifactPath: entry.artifactPath })))
    .find(({ bundle, proposal }) => proposal.proposalId === proposalIdValue || proposalId(bundle, proposal) === proposalIdValue)
    ?? null;
}

// ─── Markdown Section Renderers (pure: data → string[]) ───

const renderImprovementSection = (runs: readonly ImprovementRun[]): readonly string[] => [
  '## Recursive improvement', '',
  ...(runs.length === 0
    ? ['- No recursive-improvement runs currently reference this inbox scope.']
    : runs.slice(0, 5).flatMap((run) => {
        const d = run.acceptanceDecisions[0] ?? null;
        const scenarios = run.iterations.flatMap((i) => i.scenarioIds).filter((v, i, a) => a.indexOf(v) === i).join(', ') || 'none';
        return [
          `- ${run.improvementRunId}: accepted=${run.accepted ? 'yes' : 'no'}, verdict=${d?.verdict ?? 'none'}, signals=${run.signals.length}, candidates=${run.candidateInterventions.length}, scenarios=${scenarios}`,
          `  - checkpoint: ${d?.checkpointRef ?? 'none'}`,
          `  - convergence: ${run.converged ? `yes (${run.convergenceReason ?? 'none'})` : 'no'}`,
        ];
      })),
  '',
];

const renderHotspotSection = (hotspots: readonly WorkflowHotspot[]): readonly string[] => [
  '## Hotspot suggestions', '',
  ...(hotspots.length === 0
    ? ['- No repeated translation/agentic/degraded wins detected in the latest run per scenario.']
    : hotspots.flatMap((h) => [
        `- ${h.kind} :: ${h.screen} :: ${h.family.field}/${h.family.action} (${h.occurrenceCount})`,
        ...h.suggestions.map((s) => `  - ${s.target}: ${s.reason}`),
      ])),
  '',
];

const renderRerunSection = (plans: readonly RerunPlan[]): readonly string[] =>
  plans.length === 0 ? [] : [
    '## Rerun plans', '',
    ...plans.flatMap((plan) => [
      `- ${plan.planId}: scenarios=${plan.impactedScenarioIds.length}, runbooks=${plan.impactedRunbooks.length}, projections=${plan.impactedProjections.join(', ') || 'none'}`,
      ...plan.selection.scenarios.map((s) => `  - scenario ${s.id}: ${s.why.join(' | ') || 'n/a'}`),
      ...plan.selection.runbooks.map((r) => `  - runbook ${r.name}: ${r.why.join(' | ') || 'n/a'}`),
      ...plan.selection.projections.map((p) => `  - projection ${p.name}: ${p.why.join(' | ') || 'n/a'}`),
      ...plan.selection.confidenceRecords.map((c) => `  - confidence ${c.id}: ${c.why.join(' | ') || 'n/a'}`),
    ]),
    '',
  ];

function renderHandoffDetails(item: OperatorInboxItem): readonly string[] {
  const handoff = item.handoff;
  if (!handoff) {
    return [];
  }
  const staleness = handoff.staleness
    ? `${handoff.staleness.status} (observed ${handoff.staleness.observedAt}${handoff.staleness.reviewBy ? `; review by ${handoff.staleness.reviewBy}` : ''})`
    : 'n/a';
  const nextMoves = handoff.nextMoves && handoff.nextMoves.length > 0
    ? handoff.nextMoves.map((move) => move.command ?? move.action).join(' | ')
    : 'n/a';
  const competing = handoff.competingCandidates && handoff.competingCandidates.length > 0
    ? handoff.competingCandidates.map((candidate) => `${candidate.ref}:${candidate.status}`).join(' | ')
    : 'none';
  const tokenImpact = handoff.tokenImpact
    ? `bytes=${handoff.tokenImpact.payloadSizeBytes}, tokens=${handoff.tokenImpact.estimatedReadTokens}`
    : 'n/a';
  const chain = handoff.chain
    ? `depth=${handoff.chain.depth}, preserved=${handoff.chain.semanticCorePreserved}, driftDetectable=${handoff.chain.driftDetectable}, competing=${handoff.chain.competingCandidateCount}`
    : 'n/a';
  return [
    `- Handoff blockage: ${handoff.blockageType}`,
    `- Handoff epistemic status: ${handoff.epistemicStatus}`,
    `- Handoff blast radius: ${handoff.blastRadius}`,
    `- Handoff required capabilities: ${handoff.requiredCapabilities?.join(', ') || 'none'}`,
    `- Handoff required authorities: ${handoff.requiredAuthorities?.join(', ') || 'none'}`,
    `- Handoff semantic core: ${handoff.semanticCore.token} (${handoff.semanticCore.driftStatus})`,
    `- Handoff staleness: ${staleness}`,
    `- Handoff next moves: ${nextMoves}`,
    `- Handoff competing candidates: ${competing}`,
    `- Handoff token impact: ${tokenImpact}`,
    `- Handoff chain: ${chain}`,
  ];
}

const renderItemSection = (item: OperatorInboxItem): readonly string[] => [
  `## ${item.title}`, '',
  `- Inbox id: ${item.id}`, `- Kind: ${item.kind}`, `- Status: ${item.status}`,
  `- Summary: ${item.summary}`, `- Scenario: ${item.adoId ?? 'n/a'}`,
  `- Run: ${item.runId ?? 'n/a'}`, `- Step: ${item.stepIndex ?? 'n/a'}`,
  `- Proposal id: ${item.proposalId ?? 'n/a'}`, `- Target: ${item.targetPath ?? 'n/a'}`,
  `- Winning concern: ${item.winningConcern ?? 'n/a'}`, `- Winning source: ${item.winningSource ?? 'n/a'}`,
  `- Resolution mode: ${item.resolutionMode ?? 'n/a'}`,
  `- Requested participation: ${item.requestedParticipation ?? 'n/a'}`,
  ...renderHandoffDetails(item),
  `- Next commands: ${item.nextCommands.length > 0 ? item.nextCommands.join(' | ') : 'n/a'}`,
  '',
];

/** Render the full operator inbox as markdown. Pure composition of section renderers. */
export function renderOperatorInboxMarkdown(
  items: readonly OperatorInboxItem[],
  rerunPlans: readonly RerunPlan[] = [],
  hotspots: readonly WorkflowHotspot[] = [],
  improvementRuns: readonly ImprovementRun[] = [],
): string {
  return [
    '# Operator Inbox', '', `- Item count: ${items.length}`, '',
    ...renderImprovementSection(improvementRuns),
    ...renderHotspotSection(hotspots),
    ...renderRerunSection(rerunPlans),
    ...items.flatMap(renderItemSection),
  ].join('\n').trim() + '\n';
}

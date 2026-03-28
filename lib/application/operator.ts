import { sha256, stableStringify } from '../domain/hash';
import type { AdoId } from '../domain/identity';
import type {
  ImprovementRun,
  OperatorInboxItem,
  ProposalBundle,
  ProposalEntry,
  RunRecord,
  StepWinningSource,
  WorkflowLane,
} from '../domain/types';
import type { WorkspaceCatalog } from './catalog';
import { compareStrings, uniqueSorted } from '../domain/collections';
import type { WorkflowHotspot } from './hotspots';

function latestRuns(catalog: WorkspaceCatalog): Map<AdoId, RunRecord> {
  return new Map(
    [...catalog.runRecords]
      .sort((left, right) => right.artifact.completedAt.localeCompare(left.artifact.completedAt))
      .map((entry) => [entry.artifact.adoId, entry.artifact] as const),
  );
}

function proposalId(
  bundle: Pick<ProposalBundle, 'adoId' | 'suite'>,
  proposal: Pick<ProposalEntry, 'artifactType' | 'targetPath' | 'title' | 'patch' | 'impactedSteps'>,
): string {
  return `proposal-${sha256(stableStringify({
    adoId: bundle.adoId,
    suite: bundle.suite,
    artifactType: proposal.artifactType,
    targetPath: proposal.targetPath,
    title: proposal.title,
    patch: proposal.patch,
    impactedSteps: proposal.impactedSteps,
  }))}`;
}

function inboxItemId(input: {
  kind: OperatorInboxItem['kind'];
  adoId?: AdoId | null | undefined;
  runId?: string | null | undefined;
  proposalId?: string | null | undefined;
  stepIndex?: number | null | undefined;
  targetPath?: string | null | undefined;
}): string {
  return `inbox-${sha256(stableStringify(input))}`;
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
  bundle: Pick<ProposalBundle, 'adoId' | 'suite'>,
  proposal: Pick<ProposalEntry, 'artifactType' | 'targetPath' | 'title' | 'patch' | 'impactedSteps'>,
): string {
  return proposalId(bundle, proposal);
}

export function buildOperatorInboxItems(catalog: WorkspaceCatalog): OperatorInboxItem[] {
  const approvals = new Set(catalog.approvalReceipts.map((entry) => entry.artifact.proposalId));
  const latestRunByAdo = latestRuns(catalog);
  const seenProposalIds = new Set<string>();

  // Source 1: proposal bundles → proposal + blocked-policy items
  const proposalItems = [...catalog.proposalBundles]
    .sort((a, b) => b.artifact.runId.localeCompare(a.artifact.runId))
    .flatMap((bundleEntry) => {
      const bundle = bundleEntry.artifact;
      const run = latestRunByAdo.get(bundle.adoId) ?? null;
      return bundle.proposals.flatMap((proposal): readonly OperatorInboxItem[] => {
        const stableProposalId = proposal.proposalId || proposalId(bundle, proposal);
        if (seenProposalIds.has(stableProposalId)) return [];
        seenProposalIds.add(stableProposalId);
        const metadata = runStepMetadata(run, proposal.stepIndex);
        const kind = proposal.activation.status === 'blocked' ? 'blocked-policy' as const : 'proposal' as const;
        return [{
          id: inboxItemId({ kind, adoId: bundle.adoId, runId: bundle.runId, proposalId: stableProposalId, stepIndex: proposal.stepIndex, targetPath: proposal.targetPath }),
          kind,
          status: proposal.activation.status === 'blocked' ? 'blocked'
            : proposal.certification === 'certified' || approvals.has(stableProposalId) ? 'approved' : 'actionable',
          title: proposal.title,
          summary: proposal.activation.status === 'blocked'
            ? `Active-canon activation failed for ${proposal.artifactType} at ${proposal.targetPath}: ${proposal.activation.reason ?? 'unknown reason'}.`
            : proposal.certification === 'certified'
              ? `Certified canon is active for ${proposal.artifactType} at ${proposal.targetPath}.`
              : `Active canon is live for ${proposal.artifactType} at ${proposal.targetPath} and remains uncertified.`,
          adoId: bundle.adoId, suite: bundle.suite, runId: bundle.runId, stepIndex: proposal.stepIndex,
          proposalId: stableProposalId, artifactPath: bundleEntry.artifactPath, targetPath: proposal.targetPath,
          winningConcern: metadata.winningConcern, winningSource: metadata.winningSource, resolutionMode: metadata.resolutionMode,
          nextCommands: proposal.activation.status === 'blocked'
            ? uniqueSorted([`tesseract workflow --ado-id ${bundle.adoId}`, `tesseract inbox`])
            : uniqueSorted([`tesseract certify --proposal-id ${stableProposalId}`, `tesseract approve --proposal-id ${stableProposalId}`, `tesseract rerun-plan --proposal-id ${stableProposalId}`, `tesseract workflow --ado-id ${bundle.adoId}`]),
        }];
      });
    });

  // Source 2: resolution graphs → needs-human items
  const graphItems = catalog.resolutionGraphRecords.flatMap((graphEntry): readonly OperatorInboxItem[] => {
    const graph = graphEntry.artifact;
    const liveDomWins = graph.steps.filter((s) => s.graph.winner.rung === 'live-dom').length;
    const needsHumanWins = graph.steps.filter((s) => s.graph.winner.rung === 'needs-human').length;
    if (liveDomWins === 0 && needsHumanWins === 0) return [];
    return [{
      id: inboxItemId({ kind: 'needs-human', adoId: graph.adoId, runId: graph.runId, stepIndex: null }),
      kind: 'needs-human', status: needsHumanWins > 0 ? 'actionable' : 'informational',
      title: `Resolution graph hotspot for run ${graph.runId}`,
      summary: `Resolution graph winners include live-dom=${liveDomWins}, needs-human=${needsHumanWins}.`,
      adoId: graph.adoId, suite: null, runId: graph.runId, stepIndex: null,
      proposalId: null, artifactPath: null, targetPath: null,
      winningConcern: 'resolution', winningSource: needsHumanWins > 0 ? 'none' : 'live-dom', resolutionMode: 'agentic',
      nextCommands: uniqueSorted([`tesseract replay-interpretation --ado-id ${graph.adoId}`, `tesseract inbox`]),
    }];
  });

  // Source 3: run steps → degraded-locator + semantic-drift + needs-human + approved-equivalent items
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
        }] : []),
        ...((step.execution.semanticConsistency?.signals.length ?? 0) > 0 ? [{
          ...base, id: inboxItemId({ kind: 'semantic-drift' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'semantic-drift' as const, status: 'actionable' as const, proposalId: null as string | null,
          title: `Semantic drift on step ${step.stepIndex}`,
          summary: `Runtime observed semantic consistency drift (${step.execution.semanticConsistency!.signals.join(', ')}) on step ${step.stepIndex}.`,
        }] : []),
        ...(step.interpretation.kind === 'needs-human' ? [{
          ...base, id: inboxItemId({ kind: 'needs-human' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'needs-human' as const, status: 'actionable' as const, proposalId: null as string | null,
          title: `Needs human on step ${step.stepIndex}`,
          summary: `Runtime exhausted approved knowledge and live DOM resolution for step ${step.stepIndex}.`,
        }] : []),
        ...(step.interpretation.winningSource === 'approved-equivalent' && step.execution.execution.status === 'ok' ? [{
          ...base, id: inboxItemId({ kind: 'approved-equivalent' as const, adoId: run.adoId, runId: run.runId, stepIndex: step.stepIndex }),
          kind: 'approved-equivalent' as const, status: 'informational' as const, proposalId: null as string | null,
          title: `Approved-equivalent overlay on step ${step.stepIndex}`,
          summary: `Step ${step.stepIndex} executed green using derived confidence overlays instead of approved canon.`,
          targetPath: step.interpretation.overlayRefs[0] ?? null,
        }] : []),
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
    .flatMap((entry) => entry.artifact.proposals.map((p) => ({ bundle: entry.artifact, proposal: p, artifactPath: entry.artifactPath })))
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
    ? ['- No repeated translation/agentic/degraded/semantic-drift signals detected in the latest run per scenario.']
    : hotspots.flatMap((h) => [
        `- ${h.kind} :: ${h.screen} :: ${h.family.field}/${h.family.action} (${h.occurrenceCount})`,
        ...h.suggestions.map((s) => `  - ${s.target}: ${s.reason}`),
      ])),
  '',
];

const renderRerunSection = (plans: readonly import('../domain/types').RerunPlan[]): readonly string[] =>
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

const renderItemSection = (item: OperatorInboxItem): readonly string[] => [
  `## ${item.title}`, '',
  `- Inbox id: ${item.id}`, `- Kind: ${item.kind}`, `- Status: ${item.status}`,
  `- Summary: ${item.summary}`, `- Scenario: ${item.adoId ?? 'n/a'}`,
  `- Run: ${item.runId ?? 'n/a'}`, `- Step: ${item.stepIndex ?? 'n/a'}`,
  `- Proposal id: ${item.proposalId ?? 'n/a'}`, `- Target: ${item.targetPath ?? 'n/a'}`,
  `- Winning concern: ${item.winningConcern ?? 'n/a'}`, `- Winning source: ${item.winningSource ?? 'n/a'}`,
  `- Resolution mode: ${item.resolutionMode ?? 'n/a'}`,
  `- Next commands: ${item.nextCommands.length > 0 ? item.nextCommands.join(' | ') : 'n/a'}`,
  '',
];

/** Render the full operator inbox as markdown. Pure composition of section renderers. */
export function renderOperatorInboxMarkdown(
  items: readonly OperatorInboxItem[],
  rerunPlans: readonly import('../domain/types').RerunPlan[] = [],
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

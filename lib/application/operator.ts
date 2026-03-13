import { sha256, stableStringify } from '../domain/hash';
import type { AdoId } from '../domain/identity';
import type {
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
  const items: OperatorInboxItem[] = [];
  const seenProposalIds = new Set<string>();

  for (const bundleEntry of [...catalog.proposalBundles].sort((left, right) => right.artifact.runId.localeCompare(left.artifact.runId))) {
    const bundle = bundleEntry.artifact;
    const run = latestRunByAdo.get(bundle.adoId) ?? null;
    for (const proposal of bundle.proposals) {
      const stableProposalId = proposal.proposalId || proposalId(bundle, proposal);
      if (seenProposalIds.has(stableProposalId)) {
        continue;
      }
      seenProposalIds.add(stableProposalId);
      const metadata = runStepMetadata(run, proposal.stepIndex);
      const kind = proposal.activation.status === 'blocked' ? 'blocked-policy' : 'proposal';
      items.push({
        id: inboxItemId({
          kind,
          adoId: bundle.adoId,
          runId: bundle.runId,
          proposalId: stableProposalId,
          stepIndex: proposal.stepIndex,
          targetPath: proposal.targetPath,
        }),
        kind,
        status: proposal.activation.status === 'blocked'
          ? 'blocked'
          : proposal.certification === 'certified' || approvals.has(stableProposalId)
            ? 'approved'
            : 'actionable',
        title: proposal.title,
        summary: proposal.activation.status === 'blocked'
          ? `Active-canon activation failed for ${proposal.artifactType} at ${proposal.targetPath}: ${proposal.activation.reason ?? 'unknown reason'}.`
          : proposal.certification === 'certified'
            ? `Certified canon is active for ${proposal.artifactType} at ${proposal.targetPath}.`
            : `Active canon is live for ${proposal.artifactType} at ${proposal.targetPath} and remains uncertified.`,
        adoId: bundle.adoId,
        suite: bundle.suite,
        runId: bundle.runId,
        stepIndex: proposal.stepIndex,
        proposalId: stableProposalId,
        artifactPath: bundleEntry.artifactPath,
        targetPath: proposal.targetPath,
        winningConcern: metadata.winningConcern,
        winningSource: metadata.winningSource,
        resolutionMode: metadata.resolutionMode,
        nextCommands: proposal.activation.status === 'blocked'
          ? uniqueSorted([
              `tesseract workflow --ado-id ${bundle.adoId}`,
              `tesseract inbox`,
            ])
          : uniqueSorted([
              `tesseract certify --proposal-id ${stableProposalId}`,
              `tesseract approve --proposal-id ${stableProposalId}`,
              `tesseract rerun-plan --proposal-id ${stableProposalId}`,
              `tesseract workflow --ado-id ${bundle.adoId}`,
            ]),
      });
    }
  }


  for (const graphEntry of catalog.resolutionGraphRecords) {
    const graph = graphEntry.artifact;
    const liveDomWins = graph.steps.filter((step) => step.graph.winner.rung === 'live-dom').length;
    const needsHumanWins = graph.steps.filter((step) => step.graph.winner.rung === 'needs-human').length;
    if (liveDomWins === 0 && needsHumanWins === 0) {
      continue;
    }
    items.push({
      id: inboxItemId({ kind: 'needs-human', adoId: graph.adoId, runId: graph.runId, stepIndex: null }),
      kind: 'needs-human',
      status: needsHumanWins > 0 ? 'actionable' : 'informational',
      title: `Resolution graph hotspot for run ${graph.runId}`,
      summary: `Resolution graph winners include live-dom=${liveDomWins}, needs-human=${needsHumanWins}.`,
      adoId: graph.adoId,
      suite: null,
      runId: graph.runId,
      stepIndex: null,
      proposalId: null,
      artifactPath: null,
      targetPath: null,
      winningConcern: 'resolution',
      winningSource: needsHumanWins > 0 ? 'none' : 'live-dom',
      resolutionMode: 'agentic',
      nextCommands: uniqueSorted([
        `tesseract replay-interpretation --ado-id ${graph.adoId}`,
        `tesseract inbox`,
      ]),
    });
  }

  for (const run of latestRunByAdo.values()) {
    for (const step of run.steps) {
      if (step.execution.degraded) {
        items.push({
          id: inboxItemId({
            kind: 'degraded-locator',
            adoId: run.adoId,
            runId: run.runId,
            stepIndex: step.stepIndex,
          }),
          kind: 'degraded-locator',
          status: 'actionable',
          title: `Degraded locator on step ${step.stepIndex}`,
          summary: `Runtime resolved step ${step.stepIndex} with a degraded locator strategy.`,
          adoId: run.adoId,
          suite: run.suite,
          runId: run.runId,
          stepIndex: step.stepIndex,
          artifactPath: null,
          targetPath: null,
          winningConcern: step.interpretation.winningConcern,
          winningSource: step.interpretation.winningSource,
          resolutionMode: step.interpretation.resolutionMode,
          nextCommands: uniqueSorted([
            `tesseract workflow --ado-id ${run.adoId}`,
            `tesseract inbox`,
          ]),
        });
      }

      if (step.interpretation.kind === 'needs-human') {
        items.push({
          id: inboxItemId({
            kind: 'needs-human',
            adoId: run.adoId,
            runId: run.runId,
            stepIndex: step.stepIndex,
          }),
          kind: 'needs-human',
          status: 'actionable',
          title: `Needs human on step ${step.stepIndex}`,
          summary: `Runtime exhausted approved knowledge and live DOM resolution for step ${step.stepIndex}.`,
          adoId: run.adoId,
          suite: run.suite,
          runId: run.runId,
          stepIndex: step.stepIndex,
          artifactPath: null,
          targetPath: null,
          winningConcern: step.interpretation.winningConcern,
          winningSource: step.interpretation.winningSource,
          resolutionMode: step.interpretation.resolutionMode,
          nextCommands: uniqueSorted([
            `tesseract workflow --ado-id ${run.adoId}`,
            `tesseract inbox`,
          ]),
        });
      }

      if (step.interpretation.winningSource === 'approved-equivalent' && step.execution.execution.status === 'ok') {
        items.push({
          id: inboxItemId({
            kind: 'approved-equivalent',
            adoId: run.adoId,
            runId: run.runId,
            stepIndex: step.stepIndex,
          }),
          kind: 'approved-equivalent',
          status: 'informational',
          title: `Approved-equivalent overlay on step ${step.stepIndex}`,
          summary: `Step ${step.stepIndex} executed green using derived confidence overlays instead of approved canon.`,
          adoId: run.adoId,
          suite: run.suite,
          runId: run.runId,
          stepIndex: step.stepIndex,
          artifactPath: null,
          targetPath: step.interpretation.overlayRefs[0] ?? null,
          winningConcern: step.interpretation.winningConcern,
          winningSource: step.interpretation.winningSource,
          resolutionMode: step.interpretation.resolutionMode,
          nextCommands: uniqueSorted([
            `tesseract workflow --ado-id ${run.adoId}`,
            `tesseract inbox`,
          ]),
        });
      }
    }
  }

  return items.sort((left, right) => compareStrings(left.id, right.id));
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
  for (const bundleEntry of catalog.proposalBundles) {
    for (const proposal of bundleEntry.artifact.proposals) {
      if (proposal.proposalId === proposalIdValue || proposalId(bundleEntry.artifact, proposal) === proposalIdValue) {
        return {
          bundle: bundleEntry.artifact,
          proposal,
          artifactPath: bundleEntry.artifactPath,
        };
      }
    }
  }
  return null;
}

export function renderOperatorInboxMarkdown(
  items: readonly OperatorInboxItem[],
  rerunPlans: readonly import('../domain/types').RerunPlan[] = [],
  hotspots: readonly WorkflowHotspot[] = [],
): string {
  const lines: string[] = [
    '# Operator Inbox',
    '',
    `- Item count: ${items.length}`,
    '',
  ];

  lines.push('## Hotspot suggestions');
  lines.push('');
  if (hotspots.length === 0) {
    lines.push('- No repeated translation/agentic/degraded wins detected in the latest run per scenario.');
  }
  for (const hotspot of hotspots) {
    lines.push(`- ${hotspot.kind} :: ${hotspot.screen} :: ${hotspot.family.field}/${hotspot.family.action} (${hotspot.occurrenceCount})`);
    for (const suggestion of hotspot.suggestions) {
      lines.push(`  - ${suggestion.target}: ${suggestion.reason}`);
    }
  }
  lines.push('');

  if (rerunPlans.length > 0) {
    lines.push('## Rerun plans');
    lines.push('');
    for (const plan of rerunPlans) {
      lines.push(`- ${plan.planId}: scenarios=${plan.impactedScenarioIds.length}, runbooks=${plan.impactedRunbooks.length}, projections=${plan.impactedProjections.join(', ') || 'none'}`);
      for (const scenario of plan.selection.scenarios) {
        lines.push(`  - scenario ${scenario.id}: ${scenario.why.join(' | ') || 'n/a'}`);
      }
      for (const runbook of plan.selection.runbooks) {
        lines.push(`  - runbook ${runbook.name}: ${runbook.why.join(' | ') || 'n/a'}`);
      }
      for (const projection of plan.selection.projections) {
        lines.push(`  - projection ${projection.name}: ${projection.why.join(' | ') || 'n/a'}`);
      }
      for (const record of plan.selection.confidenceRecords) {
        lines.push(`  - confidence ${record.id}: ${record.why.join(' | ') || 'n/a'}`);
      }
    }
    lines.push('');
  }

  for (const item of items) {
    lines.push(`## ${item.title}`);
    lines.push('');
    lines.push(`- Inbox id: ${item.id}`);
    lines.push(`- Kind: ${item.kind}`);
    lines.push(`- Status: ${item.status}`);
    lines.push(`- Summary: ${item.summary}`);
    lines.push(`- Scenario: ${item.adoId ?? 'n/a'}`);
    lines.push(`- Run: ${item.runId ?? 'n/a'}`);
    lines.push(`- Step: ${item.stepIndex ?? 'n/a'}`);
    lines.push(`- Proposal id: ${item.proposalId ?? 'n/a'}`);
    lines.push(`- Target: ${item.targetPath ?? 'n/a'}`);
    lines.push(`- Winning concern: ${item.winningConcern ?? 'n/a'}`);
    lines.push(`- Winning source: ${item.winningSource ?? 'n/a'}`);
    lines.push(`- Resolution mode: ${item.resolutionMode ?? 'n/a'}`);
    lines.push(`- Next commands: ${item.nextCommands.length > 0 ? item.nextCommands.join(' | ') : 'n/a'}`);
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

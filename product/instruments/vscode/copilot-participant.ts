/**
 * Copilot Participant — interface and pure handler for the
 * Tesseract GitHub Copilot chat participant.
 *
 * The CopilotParticipant interface defines the three actions an
 * operator can invoke from the Copilot chat panel. The handler
 * functions are pure transformations that produce CopilotResponse
 * values from domain artifacts.
 */

import type { OperatorInboxItem } from '../../domain/resolution/types';
import type { ProposalBundle } from '../../domain/execution/types';
import type { CopilotArtifactRef, CopilotRequest, CopilotResponse } from './types';

// ─── CopilotParticipant Interface ───

export interface CopilotParticipant {
  /** Query the operator inbox and return a summary. */
  readonly query: (
    inbox: readonly OperatorInboxItem[],
    filter?: Readonly<Record<string, string>> | undefined,
  ) => CopilotResponse;

  /** Approve a proposal by ID and return the approval receipt summary. */
  readonly approve: (
    proposalId: string,
    proposals: readonly ProposalBundle[],
  ) => CopilotResponse;

  /** Request a rerun for a given ADO ID and return the rerun plan summary. */
  readonly rerun: (
    adoId: string,
    inbox: readonly OperatorInboxItem[],
  ) => CopilotResponse;
}

// ─── Query Handler ───

function filterInbox(
  inbox: readonly OperatorInboxItem[],
  filter?: Readonly<Record<string, string>> | undefined,
): readonly OperatorInboxItem[] {
  return filter
    ? inbox.filter((item) =>
        Object.entries(filter).every(([key, value]) => {
          const field = item[key as keyof OperatorInboxItem];
          return field !== undefined && field !== null && String(field) === value;
        }),
      )
    : inbox;
}

function inboxToArtifactRefs(
  items: readonly OperatorInboxItem[],
): readonly CopilotArtifactRef[] {
  return items
    .filter((item) => item.artifactPath !== null && item.artifactPath !== undefined)
    .map((item) => ({
      kind: item.kind,
      path: item.artifactPath!,
      label: item.title,
    }));
}

function handleQuery(
  inbox: readonly OperatorInboxItem[],
  filter?: Readonly<Record<string, string>> | undefined,
): CopilotResponse {
  const filtered = filterInbox(inbox, filter);
  const actionableCount = filtered.filter((i) => i.status === 'actionable').length;
  const blockedCount = filtered.filter((i) => i.status === 'blocked').length;
  const approvedCount = filtered.filter((i) => i.status === 'approved').length;

  return {
    action: 'query',
    success: true,
    message: [
      `Inbox: ${filtered.length} item(s)`,
      `  actionable: ${actionableCount}`,
      `  blocked: ${blockedCount}`,
      `  approved: ${approvedCount}`,
    ].join('\n'),
    artifacts: inboxToArtifactRefs(filtered),
  };
}

// ─── Approve Handler ───

function findProposal(
  proposalId: string,
  proposals: readonly ProposalBundle[],
): { readonly bundle: ProposalBundle; readonly entry: ProposalBundle['payload']['proposals'][number] } | null {
  for (const bundle of proposals) {
    const entry = bundle.payload.proposals.find(
      (p) => p.proposalId === proposalId,
    );
    if (entry) {
      return { bundle, entry };
    }
  }
  return null;
}

function handleApprove(
  proposalId: string,
  proposals: readonly ProposalBundle[],
): CopilotResponse {
  const found = findProposal(proposalId, proposals);

  if (!found) {
    return {
      action: 'approve',
      success: false,
      message: `Proposal "${proposalId}" not found in ${proposals.length} bundle(s).`,
      artifacts: [],
    };
  }

  return {
    action: 'approve',
    success: true,
    message: `Proposal "${proposalId}" found: ${found.entry.title} (${found.entry.artifactType}). Run \`npm run approve -- --proposal-id=${proposalId}\` to apply.`,
    artifacts: [
      {
        kind: found.entry.artifactType,
        path: found.entry.targetPath,
        label: found.entry.title,
      },
    ],
  };
}

// ─── Rerun Handler ───

function handleRerun(
  adoId: string,
  inbox: readonly OperatorInboxItem[],
): CopilotResponse {
  const matchingItems = inbox.filter(
    (item) => item.adoId !== null && item.adoId !== undefined && String(item.adoId) === adoId,
  );

  if (matchingItems.length === 0) {
    return {
      action: 'rerun',
      success: false,
      message: `No inbox items found for ADO ID "${adoId}".`,
      artifacts: [],
    };
  }

  const rerunCommands = matchingItems
    .flatMap((item) => item.nextCommands)
    .filter((cmd, idx, arr) => arr.indexOf(cmd) === idx);

  return {
    action: 'rerun',
    success: true,
    message: [
      `Found ${matchingItems.length} item(s) for ADO ID "${adoId}".`,
      rerunCommands.length > 0
        ? `Suggested commands:\n${rerunCommands.map((c) => `  ${c}`).join('\n')}`
        : 'No rerun commands available.',
    ].join('\n'),
    artifacts: inboxToArtifactRefs(matchingItems),
  };
}

// ─── Dispatch ───

/**
 * Route a CopilotRequest to the appropriate handler.
 * Pure function — no side effects.
 */
export function dispatchCopilotRequest(
  request: CopilotRequest,
  context: {
    readonly inbox: readonly OperatorInboxItem[];
    readonly proposals: readonly ProposalBundle[];
  },
): CopilotResponse {
  switch (request.action) {
    case 'query':
      return handleQuery(
        context.inbox,
        request.payload.filter as Readonly<Record<string, string>> | undefined,
      );
    case 'approve':
      return handleApprove(
        request.payload.proposalId as string,
        context.proposals,
      );
    case 'rerun':
      return handleRerun(
        request.payload.adoId as string,
        context.inbox,
      );
  }
}

// ─── Factory ───

/**
 * Create a CopilotParticipant bound to a context.
 * Pure function — the returned participant is a record of pure functions.
 */
export function createCopilotParticipant(_context: {
  readonly inbox: readonly OperatorInboxItem[];
  readonly proposals: readonly ProposalBundle[];
}): CopilotParticipant {
  return {
    query: (inbox, filter) => handleQuery(inbox, filter),
    approve: (proposalId, proposals) => handleApprove(proposalId, proposals),
    rerun: (adoId, inbox) => handleRerun(adoId, inbox),
  };
}

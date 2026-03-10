import path from 'path';
import YAML from 'yaml';
import { Effect } from 'effect';
import { loadWorkspaceCatalog } from './catalog';
import { emitOperatorInbox } from './inbox';
import { buildOperatorInboxItems, findProposalById } from './operator';
import { buildRerunPlan } from './rerun-plan';
import type { ProjectPaths } from './paths';
import { approvalReceiptPath, relativeProjectPath } from './paths';
import { ExecutionContext, FileSystem } from './ports';
import type { ApprovalReceipt, ProposalEntry } from '../domain/types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeRecords(target: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...target };
  for (const [key, value] of Object.entries(patch)) {
    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeRecords(next[key] as Record<string, unknown>, value);
      continue;
    }
    next[key] = value;
  }
  return next;
}

function applyHintsPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  const patch = proposal.patch;
  if (!isRecord(patch)) {
    return existing;
  }
  const screen = typeof patch.screen === 'string' ? patch.screen : existing.screen;
  const element = typeof patch.element === 'string' ? patch.element : null;
  const alias = typeof patch.alias === 'string' ? patch.alias : null;
  if (!screen || !element || !alias) {
    return mergeRecords(existing, patch);
  }

  const elements = isRecord(existing.elements) ? { ...existing.elements } : {};
  const elementEntry = isRecord(elements[element]) ? { ...elements[element] as Record<string, unknown> } : {};
  const aliases = Array.isArray(elementEntry.aliases) ? [...elementEntry.aliases] : [];
  if (!aliases.includes(alias)) {
    aliases.push(alias);
  }
  aliases.sort((left, right) => String(left).localeCompare(String(right)));
  elementEntry.aliases = aliases;
  elements[element] = elementEntry;

  return {
    ...existing,
    screen,
    elements,
  };
}

function applyProposalPatch(existing: Record<string, unknown>, proposal: ProposalEntry): Record<string, unknown> {
  if (proposal.artifactType === 'hints') {
    return applyHintsPatch(existing, proposal);
  }
  return mergeRecords(existing, proposal.patch);
}

function serializeArtifact(targetPath: string, artifact: Record<string, unknown>): string {
  return targetPath.endsWith('.json')
    ? JSON.stringify(artifact, null, 2)
    : YAML.stringify(artifact, { indent: 2 });
}

function parseArtifact(raw: string, targetPath: string): Record<string, unknown> {
  if (targetPath.endsWith('.json')) {
    return JSON.parse(raw) as Record<string, unknown>;
  }
  const parsed = YAML.parse(raw);
  return isRecord(parsed) ? parsed : {};
}

export function approveProposal(options: {
  paths: ProjectPaths;
  proposalId: string;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const executionContext = yield* ExecutionContext;
    if (executionContext.posture.executionProfile === 'ci-batch') {
      throw new Error('Approvals are disabled in ci-batch execution profile');
    }
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const located = findProposalById(catalog, options.proposalId);
    if (!located) {
      throw new Error(`Unknown proposal ${options.proposalId}`);
    }

    const targetAbsolutePath = path.join(options.paths.rootDir, located.proposal.targetPath);
    const currentRaw = (yield* fs.exists(targetAbsolutePath))
      ? yield* fs.readText(targetAbsolutePath)
      : '{}';
    const nextArtifact = applyProposalPatch(parseArtifact(currentRaw, located.proposal.targetPath), located.proposal);
    yield* fs.writeText(targetAbsolutePath, serializeArtifact(located.proposal.targetPath, nextArtifact));

    const rerun = yield* buildRerunPlan({
      paths: options.paths,
      proposalId: options.proposalId,
      reason: `Approved proposal ${options.proposalId}`,
    });
    const inboxItem = buildOperatorInboxItems(catalog).find((item) => item.proposalId === options.proposalId) ?? null;
    const receipt: ApprovalReceipt = {
      kind: 'approval-receipt',
      version: 1,
      proposalId: options.proposalId,
      inboxItemId: inboxItem?.id ?? 'unknown',
      approvedAt: new Date().toISOString(),
      artifactType: located.proposal.artifactType,
      targetPath: located.proposal.targetPath,
      receiptPath: relativeProjectPath(options.paths, approvalReceiptPath(options.paths, options.proposalId)),
      rerunPlanId: rerun.plan.planId,
    };
    const receiptPath = approvalReceiptPath(options.paths, options.proposalId);
    yield* fs.writeJson(receiptPath, receipt);
    const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: located.bundle.adoId } });

    return {
      proposalId: options.proposalId,
      targetPath: targetAbsolutePath,
      receipt,
      receiptPath,
      rerunPlan: rerun.plan,
      rerunPlanPath: rerun.outputPath,
      inbox,
    };
  });
}

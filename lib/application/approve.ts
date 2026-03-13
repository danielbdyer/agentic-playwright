import path from 'path';
import { Effect } from 'effect';
import { loadWorkspaceCatalog } from './catalog';
import { emitOperatorInbox } from './inbox';
import { buildOperatorInboxItems, findProposalById } from './operator';
import { applyProposalPatch, parseProposalArtifact, serializeProposalArtifact, validatePatchedProposalArtifact } from './proposal-patches';
import { buildRerunPlan } from './rerun-plan';
import type { ProjectPaths } from './paths';
import { approvalReceiptPath, relativeProjectPath } from './paths';
import { ExecutionContext, FileSystem } from './ports';
import type { ApprovalReceipt, ProposalEntry } from '../domain/types';

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

    const approvedAt = new Date().toISOString();
    const certifiedProposal: ProposalEntry = {
      ...located.proposal,
      certification: 'certified',
      activation: {
        status: 'activated',
        activatedAt: located.proposal.activation.activatedAt ?? approvedAt,
        certifiedAt: approvedAt,
        reason: 'canon certified by operator',
      },
    };
    const targetAbsolutePath = path.join(options.paths.rootDir, located.proposal.targetPath);
    const currentRaw = (yield* fs.exists(targetAbsolutePath))
      ? yield* fs.readText(targetAbsolutePath)
      : '{}';
    const nextArtifact = applyProposalPatch(parseProposalArtifact(currentRaw, located.proposal.targetPath), certifiedProposal);
    validatePatchedProposalArtifact(located.proposal.targetPath, certifiedProposal, nextArtifact);
    yield* fs.writeText(targetAbsolutePath, serializeProposalArtifact(located.proposal.targetPath, nextArtifact));

    const bundleAbsolutePath = path.join(options.paths.rootDir, located.artifactPath);
    const nextBundle = {
      ...located.bundle,
      proposals: located.bundle.proposals.map((proposal) =>
        proposal.proposalId === certifiedProposal.proposalId ? certifiedProposal : proposal),
      payload: {
        ...located.bundle.payload,
        proposals: located.bundle.payload.proposals.map((proposal) =>
          proposal.proposalId === certifiedProposal.proposalId ? certifiedProposal : proposal),
      },
    };
    yield* fs.writeJson(bundleAbsolutePath, nextBundle);

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
      approvedAt,
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

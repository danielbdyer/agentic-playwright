import path from 'path';
import { Effect } from 'effect';
import { TesseractError } from '../domain/errors';
import { mapPayload } from '../domain/types/workflow';
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
    yield* Effect.succeed(executionContext.posture.executionProfile).pipe(
      Effect.filterOrFail(
        (profile) => profile !== 'ci-batch',
        () => new TesseractError('approval-disabled', 'Approvals are disabled in ci-batch execution profile'),
      ),
    );
    const catalog = yield* loadWorkspaceCatalog({ paths: options.paths });
    const located = yield* Effect.succeed(findProposalById(catalog, options.proposalId)).pipe(
      Effect.filterOrFail(
        (result): result is NonNullable<typeof result> => result != null,
        () => new TesseractError('proposal-not-found', `Unknown proposal ${options.proposalId}`),
      ),
    );

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
    const currentRaw = yield* fs.readText(targetAbsolutePath).pipe(
      Effect.catchTag('FileSystemError', () => Effect.succeed('{}')),
    );
    const nextArtifact = applyProposalPatch(parseProposalArtifact(currentRaw, located.proposal.targetPath), certifiedProposal);
    validatePatchedProposalArtifact(located.proposal.targetPath, certifiedProposal, nextArtifact);
    yield* fs.writeText(targetAbsolutePath, serializeProposalArtifact(located.proposal.targetPath, nextArtifact));

    const bundleAbsolutePath = path.join(options.paths.rootDir, located.artifactPath);
    const replaceProposal = (proposals: readonly ProposalEntry[]) =>
      proposals.map((proposal) =>
        proposal.proposalId === certifiedProposal.proposalId ? certifiedProposal : proposal);
    const nextBundle = {
      ...mapPayload(located.bundle, (payload) => ({ ...payload, proposals: replaceProposal(payload.proposals) })),
      proposals: replaceProposal(located.bundle.proposals),
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

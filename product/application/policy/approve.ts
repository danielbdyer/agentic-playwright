import path from 'path';
import { Effect } from 'effect';
import { TesseractError } from '../../domain/kernel/errors';
import { mapPayload } from '../../domain/governance/workflow-types';
import { loadWorkspaceCatalog, type WorkspaceCatalog } from '../../application/catalog';
import { emitOperatorInbox } from '../../application/agency/inbox';
import { buildOperatorInboxItems, findProposalById } from '../../application/agency/operator';
import { applyProposalPatch, parseProposalArtifact, serializeProposalArtifact, validatePatchedProposalArtifact } from '../../application/knowledge/proposal-patches';
import { executeInterventionBatch } from './intervention-kernel';
import { buildRerunPlan } from '../../application/commitment/replay/rerun-plan';
import type { ProjectPaths } from '../../application/paths';
import { approvalReceiptPath, relativeProjectPath } from '../../application/paths';
import { ExecutionContext, FileSystem } from '../../application/ports';
import type { ProposalEntry } from '../../domain/execution/types';
import type { ApprovalReceipt, RerunPlan } from '../../domain/resolution/types';
import type { ActionExecutionResult } from './intervention-kernel';

export function approveProposal(options: {
  paths: ProjectPaths;
  proposalId: string;
  /** Pre-loaded catalog for batch approvals — avoids redundant disk I/O. */
  catalog?: WorkspaceCatalog;
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
    const catalog = options.catalog ?? (yield* loadWorkspaceCatalog({ paths: options.paths }));
    const located = yield* Effect.succeed(findProposalById(catalog, options.proposalId)).pipe(
      Effect.filterOrFail(
        (result): result is NonNullable<typeof result> => result != null,
        () => new TesseractError('proposal-not-found', `Unknown proposal ${options.proposalId}`),
      ),
    );

    const now = () => new Date().toISOString();
    let approvedAt = '';
    let targetAbsolutePath = '';
    let rerun: { readonly plan: RerunPlan; readonly outputPath: string } | null = null;
    const interventionBatch = {
      batchId: `approve-${options.proposalId}`,
      summary: `Approve proposal ${options.proposalId} and prepare rerun.`,
      continueOnFailure: false,
      actions: [
        {
          actionId: `approve:${options.proposalId}`,
          kind: 'approve-proposal' as const,
          summary: `Approve proposal ${options.proposalId}`,
          governance: 'approved' as const,
          target: { kind: 'proposal' as const, ref: options.proposalId, label: options.proposalId },
          prerequisites: [],
          reversible: { reversible: true, rollbackCommand: `git checkout -- ${located.proposal.targetPath}`, rollbackRef: located.proposal.targetPath },
          payload: { proposalId: options.proposalId, targetPath: located.proposal.targetPath },
        },
        {
          actionId: `rerun:${options.proposalId}`,
          kind: 'rerun-scope' as const,
          summary: `Build rerun plan for ${options.proposalId}`,
          governance: 'approved' as const,
          target: { kind: 'run' as const, ref: options.proposalId, label: `rerun-${options.proposalId}` },
          prerequisites: [{ actionId: `approve:${options.proposalId}`, required: true, reason: 'Rerun should follow approval.' }],
          reversible: { reversible: false, rollbackCommand: null, rollbackRef: null },
          payload: { proposalId: options.proposalId },
        },
      ],
    };
    const run = yield* executeInterventionBatch({
      batch: interventionBatch,
      paths: options.paths,
      now,
      kernel: {
        executeAction: ({ action }) => {
          type KernelEffect = Effect.Effect<ActionExecutionResult, unknown>;
          if (action.kind === 'approve-proposal') {
            return Effect.gen(function* () {
              approvedAt = now();
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
              targetAbsolutePath = path.join(options.paths.rootDir, located.proposal.targetPath);
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
                proposals: replaceProposal(located.bundle.payload.proposals),
              };
              yield* fs.writeJson(bundleAbsolutePath, nextBundle);
              return {
                summary: `Approved proposal ${options.proposalId}`,
                payload: { runOutcomes: ['proposal-certified'] },
              } as ActionExecutionResult;
            }) as unknown as KernelEffect;
          }
          if (action.kind === 'rerun-scope') {
            return Effect.gen(function* () {
              const built = yield* buildRerunPlan({
                paths: options.paths,
                proposalId: options.proposalId,
                reason: `Approved proposal ${options.proposalId}`,
              });
              rerun = { plan: built.plan as RerunPlan, outputPath: built.outputPath };
              return {
                summary: `Built rerun plan ${built.plan.planId}`,
                payload: { runOutcomes: [built.plan.planId] },
              } as ActionExecutionResult;
            }) as unknown as KernelEffect;
          }
          return Effect.fail(new TesseractError('intervention-unsupported-action', `Unsupported action ${action.kind}`));
        },
      },
    });
    if (!rerun || approvedAt.length === 0) {
      return yield* Effect.fail(new TesseractError('approval-failed', `Failed to approve proposal ${options.proposalId}`));
    }
    // TS can't trace the mutation inside the Effect callback, so rerun narrows to never.
    // The runtime guard above ensures this is safe.
    const ensuredRerun = rerun as { readonly plan: RerunPlan; readonly outputPath: string };
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
      rerunPlanId: ensuredRerun.plan.planId,
    };
    const receiptPath = approvalReceiptPath(options.paths, options.proposalId);
    yield* fs.writeJson(receiptPath, receipt);
    const inbox = yield* emitOperatorInbox({ paths: options.paths, filter: { adoId: located.bundle.payload.adoId } });

    return {
      proposalId: options.proposalId,
      targetPath: targetAbsolutePath,
      receipt,
      receiptPath,
      rerunPlan: ensuredRerun.plan,
      rerunPlanPath: ensuredRerun.outputPath,
      intervention: run,
      inbox,
    };
  });
}

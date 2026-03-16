import path from 'path';
import { Effect } from 'effect';
import type { ProposalBundle, ProposalEntry } from '../domain/types';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports';
import { trySync } from './effect';
import { applyProposalPatch, parseProposalArtifact, serializeProposalArtifact, validatePatchedProposalArtifact } from './proposal-patches';

function certificationForProposal(proposal: ProposalEntry): ProposalEntry['certification'] {
  return proposal.trustPolicy.decision === 'allow' ? 'certified' : 'uncertified';
}

function activatedProposal(proposal: ProposalEntry, activatedAt: string): ProposalEntry {
  const certification = certificationForProposal(proposal);
  return {
    ...proposal,
    certification,
    activation: {
      status: 'activated',
      activatedAt,
      certifiedAt: certification === 'certified' ? activatedAt : null,
      reason: proposal.trustPolicy.decision === 'allow'
        ? 'active canon certified immediately by trust policy'
        : `active canon activated without certification (${proposal.trustPolicy.decision})`,
    },
  };
}

function blockedProposal(proposal: ProposalEntry, reason: string): ProposalEntry {
  return {
    ...proposal,
    certification: 'uncertified',
    activation: {
      status: 'blocked',
      activatedAt: null,
      certifiedAt: null,
      reason,
    },
  };
}

export interface ActivateProposalBundleResult {
  proposalBundle: ProposalBundle;
  activatedPaths: string[];
  blockedProposalIds: string[];
}

function tryActivateProposal(fsPort: import('./ports').FileSystemPort, rootDir: string, proposal: ProposalEntry, activatedAt: string) {
  const candidate = activatedProposal(proposal, activatedAt);
  const absoluteTargetPath = path.join(rootDir, proposal.targetPath);

  return Effect.gen(function* () {
    const currentRaw = (yield* fsPort.exists(absoluteTargetPath))
      ? yield* fsPort.readText(absoluteTargetPath)
      : '{}';
    const nextArtifact = yield* trySync(
      () => applyProposalPatch(parseProposalArtifact(currentRaw, proposal.targetPath), candidate),
      'proposal-patch-failed', `Proposal patch failed for ${proposal.targetPath}`);
    yield* trySync(
      () => validatePatchedProposalArtifact(proposal.targetPath, candidate, nextArtifact),
      'proposal-validation-failed', `Proposal validation failed for ${proposal.targetPath}`);
    yield* fsPort.writeText(absoluteTargetPath, serializeProposalArtifact(proposal.targetPath, nextArtifact));
    return { proposal: candidate, activatedPath: absoluteTargetPath, blocked: false as const };
  }).pipe(
    Effect.catchAll((error) => Effect.succeed({
      proposal: blockedProposal(proposal, error instanceof Error ? error.message : 'proposal activation failed'),
      activatedPath: null,
      blocked: true as const,
      proposalId: proposal.proposalId,
    })),
  );
}

export function activateProposalBundle(options: {
  paths: ProjectPaths;
  proposalBundle: ProposalBundle;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const activatedAt = new Date().toISOString();

    const results = yield* Effect.forEach(
      options.proposalBundle.proposals,
      (proposal) => tryActivateProposal(fs, options.paths.rootDir, proposal, activatedAt),
    );

    const proposals = results.map((result) => result.proposal);
    const activatedPaths = results
      .filter((result): result is typeof result & { activatedPath: string } => result.activatedPath !== null)
      .map((result) => result.activatedPath)
      .sort((left, right) => left.localeCompare(right));
    const blockedProposalIds = results
      .filter((result) => result.blocked)
      .map((result) => (result as { proposalId: string }).proposalId);

    const hasBlocked = proposals.some((proposal) => proposal.activation.status === 'blocked');
    const proposalBundle: ProposalBundle = {
      ...options.proposalBundle,
      governance: hasBlocked ? 'blocked' : 'approved',
      payload: {
        ...options.proposalBundle.payload,
        proposals,
      },
      proposals,
    };

    return {
      proposalBundle,
      activatedPaths,
      blockedProposalIds,
    } satisfies ActivateProposalBundleResult;
  });
}

export interface CompensationBackup {
  filePath: string;
  originalContent: string;
}

export function backupBeforeActivation(options: {
  paths: ProjectPaths;
  proposalBundle: ProposalBundle;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const all = yield* Effect.forEach(options.proposalBundle.proposals, (proposal) =>
      Effect.gen(function* () {
        const absoluteTargetPath = path.join(options.paths.rootDir, proposal.targetPath);
        const exists = yield* fs.exists(absoluteTargetPath);
        return exists
          ? { filePath: absoluteTargetPath, originalContent: yield* fs.readText(absoluteTargetPath) } as CompensationBackup
          : null;
      }));
    return all.filter((entry): entry is CompensationBackup => entry !== null);
  });
}

export function deactivateProposals(backups: CompensationBackup[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* Effect.forEach(backups, (backup) => fs.writeText(backup.filePath, backup.originalContent));
  });
}

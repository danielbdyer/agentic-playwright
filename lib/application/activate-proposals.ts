import path from 'path';
import { Effect } from 'effect';
import type { ProposalBundle, ProposalEntry } from '../domain/types';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports';
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

export function activateProposalBundle(options: {
  paths: ProjectPaths;
  proposalBundle: ProposalBundle;
}) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const activatedAt = new Date().toISOString();
    const activatedPaths = new Set<string>();
    const blockedProposalIds: string[] = [];
    const proposals: ProposalEntry[] = [];

    for (const proposal of options.proposalBundle.proposals) {
      const candidate = activatedProposal(proposal, activatedAt);
      try {
        const absoluteTargetPath = path.join(options.paths.rootDir, proposal.targetPath);
        const currentRaw = (yield* fs.exists(absoluteTargetPath))
          ? yield* fs.readText(absoluteTargetPath)
          : '{}';
        const nextArtifact = applyProposalPatch(parseProposalArtifact(currentRaw, proposal.targetPath), candidate);
        validatePatchedProposalArtifact(proposal.targetPath, candidate, nextArtifact);
        yield* fs.writeText(absoluteTargetPath, serializeProposalArtifact(proposal.targetPath, nextArtifact));
        proposals.push(candidate);
        activatedPaths.add(absoluteTargetPath);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'proposal activation failed';
        proposals.push(blockedProposal(proposal, reason));
        blockedProposalIds.push(proposal.proposalId);
      }
    }

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
      activatedPaths: [...activatedPaths].sort((left, right) => left.localeCompare(right)),
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
    const backups: CompensationBackup[] = [];
    for (const proposal of options.proposalBundle.proposals) {
      const absoluteTargetPath = path.join(options.paths.rootDir, proposal.targetPath);
      const exists = yield* fs.exists(absoluteTargetPath);
      if (exists) {
        const content = yield* fs.readText(absoluteTargetPath);
        backups.push({ filePath: absoluteTargetPath, originalContent: content });
      }
    }
    return backups;
  });
}

export function deactivateProposals(backups: CompensationBackup[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    for (const backup of backups) {
      yield* fs.writeText(backup.filePath, backup.originalContent);
    }
  });
}

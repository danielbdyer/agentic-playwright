import path from 'path';
import { Effect } from 'effect';
import type { AutoApprovalPolicy, ProposalBundle, ProposalEntry, TrustPolicy } from '../domain/types';
import { GovernanceLattice } from '../domain/algebra/lattice';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports';
import { trySync } from './effect';
import { applyProposalPatch, parseProposalArtifact, serializeProposalArtifact, validatePatchedProposalArtifact } from './proposal-patches';
import { evaluateAutoApproval } from '../domain/governance/trust-policy';
import type { FileSystemPort } from './ports';

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

function tryActivateProposal(fsPort: FileSystemPort, rootDir: string, proposal: ProposalEntry, activatedAt: string) {
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

    // Group proposals by targetPath to serialize writes to the same file,
    // preventing race conditions on overlapping targets.
    const byTarget = new Map<string, ProposalEntry[]>();
    for (const proposal of options.proposalBundle.proposals) {
      const group = byTarget.get(proposal.targetPath) ?? [];
      group.push(proposal);
      byTarget.set(proposal.targetPath, group);
    }

    // Process each target-group sequentially (same-file writes serialized),
    // but different target groups concurrently (capped at 10).
    const groupResults = yield* Effect.forEach(
      [...byTarget.values()],
      (group) => Effect.forEach(
        group,
        (proposal) => tryActivateProposal(fs, options.paths.rootDir, proposal, activatedAt),
        { concurrency: 1 },
      ),
      { concurrency: 10 },
    );
    const results = groupResults.flat();

    const proposals = results.map((result) => result.proposal);
    const activatedPaths = results
      .flatMap((result): string[] => result.activatedPath !== null ? [result.activatedPath as string] : [])
      .sort((left, right) => left.localeCompare(right));
    const blockedProposalIds = results
      .flatMap((result) => result.blocked ? [(result as { proposalId: string }).proposalId] : []);

    const proposalGovernances = proposals.map((p) =>
      p.activation.status === 'blocked' ? 'blocked' as const : 'approved' as const,
    );
    const proposalBundle: ProposalBundle = {
      ...options.proposalBundle,
      governance: proposalGovernances.reduce(GovernanceLattice.meet, GovernanceLattice.top),
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
        return yield* fs.readText(absoluteTargetPath).pipe(
          Effect.map((originalContent): CompensationBackup => ({ filePath: absoluteTargetPath, originalContent })),
          Effect.catchTag('FileSystemError', () => Effect.succeed(null)),
        );
      }), { concurrency: 10 });
    return all.filter((entry): entry is CompensationBackup => entry !== null);
  });
}

export function deactivateProposals(backups: CompensationBackup[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    yield* Effect.forEach(backups, (backup) => fs.writeText(backup.filePath, backup.originalContent), { concurrency: 10 });
  });
}

// ─── WP5: Auto-Approval Activation ───

/**
 * Filter proposals eligible for auto-approval, then activate them.
 *
 * Proposals that pass auto-approval gates are activated immediately.
 * Proposals that fail remain in 'pending' status for manual review.
 * This produces identical receipts to manual activation — the only
 * difference is the activation.reason field.
 */
interface AutoApprovalStepResult {
  readonly proposal: ProposalEntry;
  readonly activatedPath: string | null;
  readonly blocked: boolean;
}

export function autoApproveEligibleProposals(options: {
  readonly paths: ProjectPaths;
  readonly proposalBundle: ProposalBundle;
  readonly autoApprovalPolicy: AutoApprovalPolicy;
  readonly trustPolicy: TrustPolicy;
}): Effect.Effect<ActivateProposalBundleResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const activatedAt = new Date().toISOString();

    const results: AutoApprovalStepResult[] = yield* Effect.forEach(
      options.proposalBundle.proposals,
      (proposal): Effect.Effect<AutoApprovalStepResult, never, never> => {
        const autoResult = evaluateAutoApproval({
          policy: options.autoApprovalPolicy,
          trustEvaluation: proposal.trustPolicy,
          proposedChange: {
            artifactType: proposal.artifactType,
            confidence: 0.9,
            autoHealClass: 'runtime-intent-cutover',
          },
          trustPolicy: options.trustPolicy,
        });

        if (!autoResult.approved) {
          return Effect.succeed({
            proposal: {
              ...proposal,
              activation: {
                ...proposal.activation,
                reason: `Auto-approval declined: ${autoResult.reason}`,
              },
            },
            activatedPath: null,
            blocked: false,
          });
        }

        return tryActivateProposal(fs, options.paths.rootDir, proposal, activatedAt).pipe(
          Effect.map((result) => ({
            proposal: result.proposal,
            activatedPath: result.activatedPath,
            blocked: result.blocked,
          })),
        );
      },
      { concurrency: 10 },
    );

    const proposals = results.map((result) => result.proposal);
    const activatedPaths = results
      .flatMap((result) => result.activatedPath !== null ? [result.activatedPath!] : [])
      .sort((left, right) => left.localeCompare(right));
    const blockedProposalIds = results
      .flatMap((result) => result.blocked ? [result.proposal.proposalId] : []);

    const proposalGovernances = proposals.map((p) =>
      p.activation.status === 'blocked' ? 'blocked' as const : 'approved' as const,
    );
    const proposalBundle: ProposalBundle = {
      ...options.proposalBundle,
      governance: proposalGovernances.reduce(GovernanceLattice.meet, GovernanceLattice.top),
      payload: {
        ...options.proposalBundle.payload,
        proposals,
      },
      proposals,
    };

    return { proposalBundle, activatedPaths, blockedProposalIds };
  });
}

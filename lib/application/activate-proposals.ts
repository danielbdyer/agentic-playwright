import path from 'path';
import { Effect } from 'effect';
import type { AutoApprovalPolicy, BottleneckWeights, ProposalBundle, ProposalEntry, TrustPolicy } from '../domain/types';
import { GovernanceLattice } from '../domain/algebra/lattice';
import type { ProjectPaths } from './paths';
import { FileSystem } from './ports';
import { trySync } from './effect';
import { applyProposalPatch, parseProposalArtifact, serializeProposalArtifact, validatePatchedProposalArtifact } from './proposal-patches';
import { evaluateAutoApproval } from '../domain/governance/trust-policy';
import { findToxicAliases, type AliasOutcome } from '../domain/governance/proposal-quality';
import { scoreProposalByBottleneck } from './learning-bottlenecks';
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

export function tryActivateProposal(fsPort: FileSystemPort, rootDir: string, proposal: ProposalEntry, activatedAt: string) {
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
        (proposal) => tryActivateProposal(fs, options.paths.suiteRoot, proposal, activatedAt),
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
        const absoluteTargetPath = path.join(options.paths.suiteRoot, proposal.targetPath);
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

// ─── Toxic Alias Quarantine ───

/**
 * Remove toxic aliases from hints files, preventing them from misdirecting
 * future resolution attempts.
 *
 * For each toxic alias outcome, reads the corresponding hints file,
 * removes the alias entry, and writes back. Idempotent — quarantining
 * an already-removed alias is a no-op.
 *
 * This is the inverse of `activateProposalBundle` — deactivation for
 * aliases that have proven harmful. Lives alongside activation because
 * both are proposal lifecycle operations.
 */
export function quarantineToxicProposals(options: {
  readonly paths: ProjectPaths;
  readonly toxicAliases: readonly AliasOutcome[];
}): Effect.Effect<{ readonly quarantinedCount: number; readonly quarantinedPaths: readonly string[] }, unknown, unknown> {
  if (options.toxicAliases.length === 0) {
    return Effect.succeed({ quarantinedCount: 0, quarantinedPaths: [] });
  }

  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const quarantinedPaths: string[] = [];

    // Group toxic aliases by screenId to batch file operations
    const byScreen = new Map<string, AliasOutcome[]>();
    for (const alias of options.toxicAliases) {
      const group = byScreen.get(alias.screenId) ?? [];
      group.push(alias);
      byScreen.set(alias.screenId, group);
    }

    yield* Effect.forEach(
      [...byScreen.entries()],
      ([screenId, aliases]) => Effect.gen(function* () {
        const hintsPath = path.join(options.paths.suiteRoot, `knowledge/screens/${screenId}.hints.yaml`);
        const exists = yield* fs.exists(hintsPath);
        if (!exists) return;

        const content = yield* fs.readText(hintsPath);
        const aliasIds = new Set(aliases.map((a) => a.aliasId));

        // Remove lines containing toxic alias IDs from the hints YAML.
        // This is a conservative line-level filter that preserves structure.
        const lines = content.split('\n');
        const filtered = lines.filter((line) => {
          const trimmed = line.trim();
          return !Array.from(aliasIds).some((id) => trimmed.includes(id));
        });

        const nextContent = filtered.join('\n');
        if (nextContent !== content) {
          yield* fs.writeText(hintsPath, nextContent);
          quarantinedPaths.push(hintsPath);
        }
      }),
      { concurrency: 10 },
    );

    return {
      quarantinedCount: options.toxicAliases.length,
      quarantinedPaths: quarantinedPaths.sort((a, b) => a.localeCompare(b)),
    };
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
  /** Optional alias outcomes — toxic aliases are blocked before activation. */
  readonly aliasOutcomes?: readonly AliasOutcome[] | undefined;
  /** Optional bottleneck weights — used to sort proposals by impact before activation. */
  readonly bottleneckWeights?: BottleneckWeights | undefined;
  /** Optional per-screen metrics for bottleneck scoring. */
  readonly screenMetrics?: ReadonlyMap<string, {
    readonly repairDensity: number;
    readonly translationRate: number;
    readonly unresolvedRate: number;
    readonly screenFragmentShare: number;
  }> | undefined;
}): Effect.Effect<ActivateProposalBundleResult, unknown, unknown> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    const activatedAt = new Date().toISOString();

    // Build toxic alias lookup for O(1) gating
    const toxicAliasIds = options.aliasOutcomes
      ? new Set(findToxicAliases(options.aliasOutcomes).map((a) => a.aliasId))
      : new Set<string>();

    // Sort proposals by bottleneck impact if weights are provided.
    // Higher-impact proposals activate first, focusing budget on degraded screens.
    const orderedProposals = options.bottleneckWeights
      ? [...options.proposalBundle.proposals].sort((a, b) => {
          const scoreA = scoreProposalByBottleneck(a.targetPath, options.bottleneckWeights, options.screenMetrics);
          const scoreB = scoreProposalByBottleneck(b.targetPath, options.bottleneckWeights, options.screenMetrics);
          return scoreB - scoreA;
        })
      : options.proposalBundle.proposals;

    const results: AutoApprovalStepResult[] = yield* Effect.forEach(
      orderedProposals,
      (proposal): Effect.Effect<AutoApprovalStepResult, never, never> => {
        // Gate: block proposals targeting known-toxic aliases
        if (toxicAliasIds.has(proposal.proposalId)) {
          return Effect.succeed({
            proposal: blockedProposal(proposal, `quarantined: toxic alias`),
            activatedPath: null,
            blocked: true,
          });
        }

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

        return tryActivateProposal(fs, options.paths.suiteRoot, proposal, activatedAt).pipe(
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

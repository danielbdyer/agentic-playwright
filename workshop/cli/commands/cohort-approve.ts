/**
 * `tesseract cohort-approve` — graduate a proposal to canon.
 *
 * Moves a proposal from `proposals/<aut>/` into `canon/<aut>/`,
 * writing a CanonRecord that the public-AUT runner consults
 * BEFORE classifying any step. This is the manual entry point
 * for the trust-policy gate; future cycles wire automatic
 * graduation based on N-consecutive-match conditions.
 *
 * Flags:
 *   --aut          AUT name.
 *   --proposal-id  The proposalId field of the pending proposal.
 *   --reason       (optional) Free text rationale recorded
 *                  alongside the canon record.
 *
 * Exit code: 0 on success; non-zero on missing proposal.
 *
 * Cycle 10 of the cold-start cohort spike. See journal Entry 38.
 */

import { Effect } from 'effect';
import { createCommandSpec, readFlagValue } from '../../../product/cli/shared';
import {
  buildCanonId,
  readProposal,
  writeCanon,
  type CanonRecord,
} from '../../customer-backlog/application/intervention-store';

export interface CohortApproveResult {
  readonly canonId: string;
  readonly canonPath: string;
  readonly aut: string;
  readonly adoId: string;
  readonly stepIndex: number;
  readonly resolutionRole: string;
  readonly resolutionName: string;
}

export const cohortApproveCommand = createCommandSpec({
  flags: ['--aut', '--proposal-id', '--reason'] as const,
  parse: (context) => ({
    command: 'cohort-approve',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) =>
      Effect.gen(function* () {
        const aut = readFlagValue('--aut', context.flags.aut);
        const proposalId = readFlagValue('--proposal-id', context.flags.proposalId);
        const rationale = context.flags.reason ?? '';

        const proposal = readProposal(paths.rootDir, aut, proposalId);
        if (!proposal) {
          throw new Error(
            `cohort-approve: no proposal with id '${proposalId}' under aut '${aut}'`,
          );
        }

        const approvedAt = new Date().toISOString();
        const canonId = buildCanonId(aut, proposal.adoId, proposal.stepIndex);
        const canon: CanonRecord = {
          canonId,
          aut: proposal.aut,
          adoId: proposal.adoId,
          stepIndex: proposal.stepIndex,
          resolution: proposal.resolution,
          approvedAt,
          approvedBy: 'cli-operator',
          approvedFromProposalId: proposal.proposalId,
          rationale: rationale || proposal.rationale,
        };
        const canonPath = writeCanon(paths.rootDir, canon);

        const result: CohortApproveResult = {
          canonId,
          canonPath,
          aut: canon.aut,
          adoId: canon.adoId,
          stepIndex: canon.stepIndex,
          resolutionRole: canon.resolution.role,
          resolutionName: canon.resolution.name,
        };
        return result;
      }),
  }),
});

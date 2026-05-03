/**
 * `tesseract cohort-resolve` — operator/agent intervention point.
 *
 * Reads a handoff record (a stuck step the runner queued) and
 * writes a proposal record carrying the operator-supplied
 * resolution. The proposal awaits approval via `cohort-approve`
 * before graduating to canon.
 *
 * Flags:
 *   --aut          AUT name (matches cohort manifest entry).
 *   --handoff-id   The handoffId field of the queued record.
 *   --role         The proposed target's accessible role.
 *   --name         The proposed target's accessible name.
 *   --reason       (optional) Free text explaining why this is the
 *                  right resolution.
 *
 * Exit code: 0 on success; non-zero on missing handoff.
 *
 * Cycle 10 of the cold-start cohort spike. See journal Entry 38.
 */

import { Effect } from 'effect';
import { createCommandSpec, readFlagValue } from '../../../product/cli/shared';
import {
  buildProposalId,
  readHandoff,
  writeProposal,
  type ProposalRecord,
} from '../../customer-backlog/application/intervention-store';

export interface CohortResolveResult {
  readonly proposalId: string;
  readonly proposalPath: string;
  readonly aut: string;
  readonly adoId: string;
  readonly stepIndex: number;
  readonly resolutionRole: string;
  readonly resolutionName: string;
  readonly nextStep: string;
}

export const cohortResolveCommand = createCommandSpec({
  flags: ['--aut', '--handoff-id', '--role', '--name', '--reason'] as const,
  parse: (context) => ({
    command: 'cohort-resolve',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) =>
      Effect.gen(function* () {
        const aut = readFlagValue('--aut', context.flags.aut);
        const handoffId = readFlagValue('--handoff-id', context.flags.handoffId);
        const role = readFlagValue('--role', context.flags.role);
        const name = readFlagValue('--name', context.flags.name);
        const rationale = context.flags.reason ?? '';

        const handoff = readHandoff(paths.rootDir, aut, handoffId);
        if (!handoff) {
          throw new Error(
            `cohort-resolve: no handoff with id '${handoffId}' under aut '${aut}'`,
          );
        }

        const proposedAt = new Date().toISOString();
        const proposalId = buildProposalId(aut, handoff.adoId, handoff.stepIndex, proposedAt);
        const proposal: ProposalRecord = {
          proposalId,
          fromHandoffId: handoff.handoffId,
          aut: handoff.aut,
          adoId: handoff.adoId,
          stepIndex: handoff.stepIndex,
          resolution: {
            kind: 'role-name',
            role,
            name,
          },
          proposedAt,
          proposedBy: 'cli-operator',
          rationale,
          status: 'pending',
        };
        const proposalPath = writeProposal(paths.rootDir, proposal);

        const result: CohortResolveResult = {
          proposalId,
          proposalPath,
          aut: handoff.aut,
          adoId: handoff.adoId,
          stepIndex: handoff.stepIndex,
          resolutionRole: role,
          resolutionName: name,
          nextStep: `tesseract cohort-approve --aut ${aut} --proposal-id ${proposalId}`,
        };
        return result;
      }),
  }),
});

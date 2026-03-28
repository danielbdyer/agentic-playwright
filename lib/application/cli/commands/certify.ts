import { approveProposal } from '../../approve';
import type { CommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const certifyCommand: CommandSpec = {
  flags: ['--proposal-id'],
  parse: ({ flags }) => ({
    command: 'certify',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => approveProposal({
      paths,
      proposalId: requireProposalId(flags.proposalId),
    }),
  }),
};

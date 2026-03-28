import { approveProposal } from '../../approve';
import type { CommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const approveCommand: CommandSpec = {
  flags: ['--proposal-id'],
  parse: ({ flags }) => ({
    command: 'approve',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => approveProposal({
      paths,
      proposalId: requireProposalId(flags.proposalId),
    }),
  }),
};

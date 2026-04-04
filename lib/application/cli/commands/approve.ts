import { approveProposal } from '../../governance/approve';
import { createCommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const approveCommand = createCommandSpec({
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
});

import { approveProposal } from '../../application/policy/approve';
import { createCommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const certifyCommand = createCommandSpec({
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
});

import { executeRerunScopeIntervention } from '../../rerun-plan';
import type { CommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const rerunPlanCommand: CommandSpec = {
  flags: ['--proposal-id'],
  parse: ({ flags }) => ({
    command: 'rerun-plan',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => executeRerunScopeIntervention({
      paths,
      proposalId: requireProposalId(flags.proposalId),
    }),
  }),
};

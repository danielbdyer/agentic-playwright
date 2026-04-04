import { executeRerunScopeIntervention } from '../../execution/rerun-plan';
import { createCommandSpec } from '../shared';
import { requireProposalId } from '../shared';

export const rerunPlanCommand = createCommandSpec({
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
});

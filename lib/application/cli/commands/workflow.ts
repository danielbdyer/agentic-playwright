import { inspectWorkflow } from '../../projections/workflow';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';

export const workflowCommand = createCommandSpec({
  flags: ['--ado-id', '--runbook'],
  parse: ({ flags }) => ({
    command: 'workflow',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => inspectWorkflow({
      paths,
      ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
      ...(flags.runbook ? { runbookName: flags.runbook } : {}),
    }),
  }),
});

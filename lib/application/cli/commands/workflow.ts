import { inspectWorkflow } from '../../workflow';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';

export const workflowCommand: CommandSpec = {
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
};

import { traceScenario } from '../../trace';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const traceCommand: CommandSpec = {
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'trace',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => traceScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

import { emitScenario } from '../../emit';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const emitCommand: CommandSpec = {
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'emit',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => emitScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

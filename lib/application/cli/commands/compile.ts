import { compileScenario } from '../../compile';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const compileCommand: CommandSpec = {
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'compile',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => compileScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

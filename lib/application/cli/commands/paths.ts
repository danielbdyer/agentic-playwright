import { describeScenarioPaths } from '../../inspect';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const pathsCommand: CommandSpec = {
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'paths',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => describeScenarioPaths({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

import { describeScenarioPaths } from '../../inspect';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const pathsCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'paths',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => describeScenarioPaths({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

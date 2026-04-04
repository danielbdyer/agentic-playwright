import { refreshScenario } from '../../workspace/refresh';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const refreshCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'refresh',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => refreshScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

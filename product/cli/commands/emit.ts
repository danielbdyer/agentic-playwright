import { emitScenario } from '../../application/commitment/emit';
import { createAdoId } from '../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const emitCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'emit',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => emitScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

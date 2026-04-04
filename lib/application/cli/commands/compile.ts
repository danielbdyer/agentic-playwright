import { compileScenario } from '../../execution/compile';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const compileCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'compile',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => compileScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

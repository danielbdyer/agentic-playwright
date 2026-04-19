import { bindScenario } from '../../resolution/bind';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const bindCommand = createCommandSpec({
  flags: ['--ado-id', '--strict'],
  parse: ({ flags }) => ({
    command: 'bind',
    strictExitOnUnbound: Boolean(flags.strict),
    postureInput: {},
    execute: (paths) => bindScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

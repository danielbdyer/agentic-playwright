import { parseScenario } from '../../reporting/parse';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const parseCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'parse',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => parseScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

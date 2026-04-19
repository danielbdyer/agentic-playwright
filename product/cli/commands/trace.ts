import { traceScenario } from '../../projections/trace';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const traceCommand = createCommandSpec({
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'trace',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => traceScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

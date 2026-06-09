import { compileScenario } from '../../application/resolution/compile';
import { createAdoId } from '../../domain/kernel/identity';
import { createCommandSpec, withDefinedValues } from '../shared';
import { requireAdoId } from '../shared';

export const compileCommand = createCommandSpec({
  flags: ['--ado-id', '--reasoning-mode', '--reasoning-pool'],
  parse: ({ flags }) => ({
    command: 'compile',
    strictExitOnUnbound: false,
    postureInput: {},
    // Z11d — pool-adapter selection threads through the composition
    // layer (plan §9.2); the compile program consults Reasoning via
    // the resolution ladder's translation/interpretation rungs.
    serviceOptions: withDefinedValues({
      reasoningMode: flags.reasoningMode,
      reasoningPoolDir: flags.reasoningPool,
    }),
    execute: (paths) => compileScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
});

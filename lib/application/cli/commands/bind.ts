import { bindScenario } from '../../bind';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const bindCommand: CommandSpec = {
  flags: ['--ado-id', '--strict'],
  parse: ({ flags }) => ({
    command: 'bind',
    strictExitOnUnbound: Boolean(flags.strict),
    postureInput: {},
    execute: (paths) => bindScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

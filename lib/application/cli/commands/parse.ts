import { parseScenario } from '../../parse';
import { createAdoId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireAdoId } from '../shared';

export const parseCommand: CommandSpec = {
  flags: ['--ado-id'],
  parse: ({ flags }) => ({
    command: 'parse',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => parseScenario({ adoId: createAdoId(requireAdoId(flags.adoId)), paths }),
  }),
};

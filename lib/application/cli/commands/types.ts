import { generateTypes } from '../../types';
import type { CommandSpec } from '../shared';

export const typesCommand: CommandSpec = {
  flags: [],
  parse: () => ({
    command: 'types',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => generateTypes({ paths }),
  }),
};

import { buildDerivedGraph } from '../../graph';
import type { CommandSpec } from '../shared';

export const graphCommand: CommandSpec = {
  flags: [],
  parse: () => ({
    command: 'graph',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => buildDerivedGraph({ paths }),
  }),
};

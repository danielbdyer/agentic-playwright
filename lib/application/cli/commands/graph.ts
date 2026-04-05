import { buildDerivedGraph } from '../../graph/graph';
import { createCommandSpec } from '../shared';

export const graphCommand = createCommandSpec({
  flags: [],
  parse: () => ({
    command: 'graph',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => buildDerivedGraph({ paths }),
  }),
});

import { impactNode } from '../../impact';
import { createCommandSpec } from '../shared';
import { requireNode } from '../shared';

export const impactCommand = createCommandSpec({
  flags: ['--node'],
  parse: ({ flags }) => ({
    command: 'impact',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => impactNode({ nodeId: requireNode(flags.nodeId), paths }),
  }),
});

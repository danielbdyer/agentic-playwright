import { impactNode } from '../../impact';
import type { CommandSpec } from '../shared';
import { requireNode } from '../shared';

export const impactCommand: CommandSpec = {
  flags: ['--node'],
  parse: ({ flags }) => ({
    command: 'impact',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => impactNode({ nodeId: requireNode(flags.nodeId), paths }),
  }),
};

import { inspectSurface } from '../../surface';
import { createScreenId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireScreen } from '../shared';

export const surfaceCommand: CommandSpec = {
  flags: ['--screen'],
  parse: ({ flags }) => ({
    command: 'surface',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => inspectSurface({ screen: createScreenId(requireScreen(flags.screen)), paths }),
  }),
};

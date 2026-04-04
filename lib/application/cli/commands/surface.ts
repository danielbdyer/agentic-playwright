import { inspectSurface } from '../../reporting/surface';
import { createScreenId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireScreen } from '../shared';

export const surfaceCommand = createCommandSpec({
  flags: ['--screen'],
  parse: ({ flags }) => ({
    command: 'surface',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => inspectSurface({ screen: createScreenId(requireScreen(flags.screen)), paths }),
  }),
});

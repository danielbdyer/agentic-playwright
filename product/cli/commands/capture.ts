import { captureScreenSection } from '../../instruments/tooling/capture-screen';
import { createScreenId } from '../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireScreen, requireSection } from '../shared';

export const captureCommand = createCommandSpec({
  flags: ['--screen', '--section'],
  parse: ({ flags }) => ({
    command: 'capture',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => captureScreenSection({
      screen: createScreenId(requireScreen(flags.screen)),
      section: requireSection(flags.section),
      paths,
    }),
  }),
});

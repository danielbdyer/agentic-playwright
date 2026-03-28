import { captureScreenSection } from '../../../infrastructure/tooling/capture-screen';
import { createScreenId } from '../../../domain/identity';
import type { CommandSpec } from '../shared';
import { requireScreen, requireSection } from '../shared';

export const captureCommand: CommandSpec = {
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
};

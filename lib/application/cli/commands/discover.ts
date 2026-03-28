import { discoverScreenScaffold } from '../../../infrastructure/tooling/discover-screen';
import type { CommandSpec } from '../shared';
import { requireUrl } from '../shared';

export const discoverCommand: CommandSpec = {
  flags: ['--screen', '--url', '--root-selector'],
  parse: ({ flags }) => ({
    command: 'discover',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => discoverScreenScaffold({
      ...(flags.screen ? { screen: flags.screen } : {}),
      ...(flags.rootSelector ? { rootSelector: flags.rootSelector } : {}),
      url: requireUrl(flags.url),
      paths,
    }),
  }),
};

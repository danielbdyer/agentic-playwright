import { emitOperatorInbox } from '../../inbox';
import type { CommandSpec } from '../shared';

export const inboxCommand: CommandSpec = {
  flags: ['--ado-id', '--kind', '--status'],
  parse: ({ flags }) => ({
    command: 'inbox',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => emitOperatorInbox({
      paths,
      filter: {
        ...(flags.adoId ? { adoId: flags.adoId } : {}),
        ...(flags.kind ? { kind: flags.kind } : {}),
        ...(flags.status ? { status: flags.status } : {}),
      },
    }),
  }),
};

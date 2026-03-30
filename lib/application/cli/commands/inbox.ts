import { emitOperatorInbox } from '../../inbox';
import { createCommandSpec } from '../shared';

export const inboxCommand = createCommandSpec({
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
});

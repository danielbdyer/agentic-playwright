import { replayInterpretation } from '../../execution/replay/replay-interpretation';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { requireAdoId, withDefinedValues } from '../shared';

export const replayCommand = createCommandSpec({
  flags: ['--ado-id', '--runbook', '--provider', '--interpreter-mode'],
  parse: ({ flags }) => ({
    command: 'replay',
    strictExitOnUnbound: false,
    postureInput: withDefinedValues({
      interpreterMode: flags.interpreterMode,
    }),
    execute: (paths, posture) => replayInterpretation({
      adoId: createAdoId(requireAdoId(flags.adoId)),
      ...(flags.runbook ? { runbookName: flags.runbook } : {}),
      ...(flags.provider ? { providerId: flags.provider } : {}),
      interpreterMode: posture.interpreterMode === 'diagnostic' || posture.interpreterMode === 'dry-run'
        ? posture.interpreterMode
        : 'diagnostic',
      paths,
    }),
  }),
});

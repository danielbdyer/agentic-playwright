import { runScenarioSelection } from '../../commitment/run';
import { createAdoId } from '../../../domain/kernel/identity';
import { createCommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const runCommand = createCommandSpec({
  flags: ['--ado-id', '--runbook', '--provider', '--tag', '--interpreter-mode', '--execution-profile', '--ci-batch', '--headed', '--no-write', '--baseline', '--disable-translation', '--disable-translation-cache'],
  parse: ({ flags }) => ({
    command: 'run',
    strictExitOnUnbound: false,
    postureInput: withDefinedValues({
      interpreterMode: flags.interpreterMode,
      executionProfile: flags.executionProfile,
      headed: flags.headed,
      noWrite: flags.noWrite,
      baseline: flags.baseline,
    }),
    execute: (paths, posture) => runScenarioSelection({
      ...(flags.adoId ? { adoId: createAdoId(flags.adoId) } : {}),
      ...(flags.runbook ? { runbookName: flags.runbook } : {}),
      ...(flags.tag ? { tag: flags.tag } : {}),
      ...(flags.provider ? { providerId: flags.provider } : {}),
      interpreterMode: posture.interpreterMode === 'diagnostic' || posture.interpreterMode === 'dry-run'
        ? posture.interpreterMode
        : 'diagnostic',
      posture,
      paths,
      disableTranslation: Boolean(flags.disableTranslation),
      disableTranslationCache: Boolean(flags.disableTranslationCache),
    }),
  }),
});

import { harvestDeclaredRoutes } from '../../../infrastructure/tooling/harvest-routes';
import type { CommandExecution, CommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const harvestCommand: CommandSpec = {
  flags: ['--routes', '--all', '--headed'],
  parse: ({ flags }) => {
    const execution: CommandExecution = {
      command: 'harvest',
      strictExitOnUnbound: false,
      postureInput: withDefinedValues({
        headed: flags.headed,
      }),
      execute: (paths) => harvestDeclaredRoutes({
        paths,
        ...(flags.routes ? { app: flags.routes } : {}),
        ...(flags.all ? { all: true } : {}),
      }),
    };
    if (flags.headed) {
      execution.environment = { TESSERACT_HEADLESS: '0' };
    }
    return execution;
  },
};

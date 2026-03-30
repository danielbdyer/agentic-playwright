import { harvestDeclaredRoutes } from '../../../infrastructure/tooling/harvest-routes';
import { createCommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const harvestCommand = createCommandSpec({
  flags: ['--routes', '--all', '--headed'],
  parse: ({ flags }) => ({
    command: 'harvest',
    strictExitOnUnbound: false,
    environment: flags.headed ? { TESSERACT_HEADLESS: '0' } : undefined,
    postureInput: withDefinedValues({
      headed: flags.headed,
    }),
    execute: (paths) => harvestDeclaredRoutes({
      paths,
      ...(flags.routes ? { app: flags.routes } : {}),
      ...(flags.all ? { all: true } : {}),
    }),
  }),
});

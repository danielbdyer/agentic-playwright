import { harvestDeclaredRoutes } from '../../instruments/tooling/harvest-routes';
import { createCommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const harvestCommand = createCommandSpec({
  flags: ['--routes', '--all', '--headed'],
  parse: ({ flags }) => ({
    command: 'harvest',
    strictExitOnUnbound: false,
    ...(flags.headed ? { environment: { TESSERACT_HEADLESS: '0' } } : {}),
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

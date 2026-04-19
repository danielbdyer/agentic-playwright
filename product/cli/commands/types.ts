import { generateTypes } from '../../types';
import { createCommandSpec } from '../shared';

export const typesCommand = createCommandSpec({
  flags: [],
  parse: () => ({
    command: 'types',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => generateTypes({ paths }),
  }),
});

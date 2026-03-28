import { generateSyntheticScenarios } from '../../synthesis/scenario-generator';
import type { CommandSpec } from '../shared';

export const generateCommand: CommandSpec = {
  flags: ['--count', '--seed', '--perturb'],
  parse: ({ flags }) => ({
    command: 'generate',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => generateSyntheticScenarios({
      paths,
      count: flags.count ?? 50,
      seed: flags.seed ?? 'generate-v1',
      ...(flags.perturb ? { perturbationRate: flags.perturb } : {}),
    }),
  }),
};

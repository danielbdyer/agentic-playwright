import { evolveProgram } from '../../evolve';
import type { CommandSpec, ExecutionProfile, InterpreterMode } from '../shared';
import { withDefinedValues } from '../shared';

export const evolveCommand: CommandSpec = {
  flags: ['--max-epochs', '--seed', '--count', '--max-iterations', '--substrate'],
  parse: ({ flags }) => ({
    command: 'evolve',
    strictExitOnUnbound: false,
    postureInput: withDefinedValues({
      interpreterMode: 'diagnostic' as InterpreterMode,
      executionProfile: 'dogfood' as ExecutionProfile,
    }),
    execute: (paths) => evolveProgram({
      paths,
      maxEpochs: flags.maxEpochs ?? 3,
      seed: flags.seed ?? 'evolve-v1',
      count: flags.count ?? 30,
      maxIterations: flags.maxIterations ?? 3,
      substrate: (flags.substrate ?? 'synthetic') as 'synthetic' | 'production' | 'hybrid',
    }),
  }),
};

import { evolveProgram } from '../../orchestration/evolve';
import {
  createCommandSpec,
  withDefinedValues,
  type ExecutionProfile,
  type InterpreterMode,
} from '../../../product/cli/shared';

export const evolveCommand = createCommandSpec({
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
});

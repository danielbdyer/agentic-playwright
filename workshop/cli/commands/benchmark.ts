import { projectBenchmarkScorecard } from '../../orchestration/benchmark';
import { createCommandSpec, requireBenchmark } from '../../../product/cli/shared';

export const benchmarkCommand = createCommandSpec({
  flags: ['--benchmark'],
  parse: ({ flags }) => ({
    command: 'benchmark',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => projectBenchmarkScorecard({
      paths,
      benchmarkName: requireBenchmark(flags.benchmark),
      includeExecution: true,
    }),
  }),
});

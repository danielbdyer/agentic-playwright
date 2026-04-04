import { projectBenchmarkScorecard } from '../../improvement/benchmark';
import { createCommandSpec } from '../shared';
import { requireBenchmark } from '../shared';

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

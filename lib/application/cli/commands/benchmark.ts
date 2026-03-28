import { projectBenchmarkScorecard } from '../../benchmark';
import type { CommandSpec } from '../shared';
import { requireBenchmark } from '../shared';

export const benchmarkCommand: CommandSpec = {
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
};

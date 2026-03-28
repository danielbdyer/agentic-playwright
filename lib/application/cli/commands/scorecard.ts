import { renderBenchmarkScorecard } from '../../scorecard';
import type { CommandSpec } from '../shared';
import { requireBenchmark } from '../shared';

export const scorecardCommand: CommandSpec = {
  flags: ['--benchmark'],
  parse: ({ flags }) => ({
    command: 'scorecard',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => renderBenchmarkScorecard({
      paths,
      benchmarkName: requireBenchmark(flags.benchmark),
    }),
  }),
};

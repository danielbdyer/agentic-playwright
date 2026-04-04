import { renderBenchmarkScorecard } from '../../analysis/scorecard';
import { createCommandSpec } from '../shared';
import { requireBenchmark } from '../shared';

export const scorecardCommand = createCommandSpec({
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
});

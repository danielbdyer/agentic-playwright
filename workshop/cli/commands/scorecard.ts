import { renderBenchmarkScorecard } from '../../orchestration/scorecard';
import { createCommandSpec, requireBenchmark } from '../../../product/cli/shared';

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

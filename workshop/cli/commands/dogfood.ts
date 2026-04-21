import { runDogfoodLoop } from '../../orchestration/dogfood';
import { createCommandSpec, withDefinedValues } from '../../../product/cli/shared';

export const dogfoodCommand = createCommandSpec({
  flags: ['--max-iterations', '--convergence-threshold', '--max-cost', '--tag', '--runbook', '--interpreter-mode'],
  parse: ({ flags }) => ({
    command: 'dogfood',
    strictExitOnUnbound: false,
    postureInput: withDefinedValues({
      interpreterMode: flags.interpreterMode,
    }),
    execute: (paths) => runDogfoodLoop({
      paths,
      maxIterations: flags.maxIterations ?? 2,
      convergenceThreshold: flags.convergenceThreshold,
      maxInstructionCount: flags.maxCost,
      tag: flags.tag,
      runbook: flags.runbook,
      interpreterMode: flags.interpreterMode as 'dry-run' | 'diagnostic' | 'playwright' | undefined,
    }),
  }),
});

import { Effect } from 'effect';
import { multiSeedSpeedrun } from '../../improvement/speedrun';
import { evolveProgram } from '../../improvement/evolve';
import { DEFAULT_PIPELINE_CONFIG } from '../../../domain/types';
import type { ExecutionProfile, InterpreterMode } from '../shared';
import { createCommandSpec } from '../shared';
import { withDefinedValues } from '../shared';

export const speedrunCommand = createCommandSpec({
  flags: ['--count', '--seed', '--seeds', '--max-iterations', '--tag', '--substrate', '--perturb', '--posture', '--auto-evolve', '--max-epochs'],
  parse: ({ flags }) => ({
    command: 'speedrun',
    strictExitOnUnbound: false,
    postureInput: withDefinedValues({
      interpreterMode: 'playwright' as InterpreterMode,
      executionProfile: 'dogfood' as ExecutionProfile,
    }),
    execute: (paths) => {
      const seeds = flags.seeds ? (flags.seeds as string).split(',').filter(Boolean) : [flags.seed ?? 'speedrun-v1'];
      const speedrun = multiSeedSpeedrun({
        paths,
        config: DEFAULT_PIPELINE_CONFIG,
        seeds,
        count: flags.count ?? 50,
        maxIterations: flags.maxIterations ?? 5,
        ...(flags.substrate ? { substrate: flags.substrate as 'synthetic' | 'production' | 'hybrid' } : {}),
        ...(flags.perturb ? { perturbationRate: flags.perturb } : {}),
        ...(flags.tag ? { tag: flags.tag } : {}),
      });
      // If --auto-evolve: chain evolveProgram after speedrun completes
      return flags.autoEvolve
        ? speedrun.pipe(Effect.flatMap((result) =>
            evolveProgram({
              paths,
              maxEpochs: flags.maxEpochs ?? 3,
              seed: flags.seed ?? 'evolve-v1',
              count: flags.count ?? 30,
              maxIterations: flags.maxIterations ?? 3,
              substrate: (flags.substrate ?? 'synthetic') as 'synthetic' | 'production' | 'hybrid',
            }).pipe(Effect.map((evolveResult) => ({ speedrun: result, evolve: evolveResult }))),
          ))
        : speedrun;
    },
  }),
});

import { Effect } from 'effect';
import { loadExperimentRegistry } from '../../orchestration/experiment-registry';
import type { ExperimentRecord} from '../../../product/domain/improvement/experiment';
import { filterExperiments } from '../../../product/domain/improvement/experiment';
import { createCommandSpec } from '../../../product/cli/shared';

export const experimentsCommand = createCommandSpec({
  flags: ['--accepted', '--tag', '--substrate', '--top'],
  parse: ({ flags }) => ({
    command: 'experiments',
    strictExitOnUnbound: false,
    postureInput: {},
    execute: (paths) => loadExperimentRegistry(paths).pipe(
      Effect.map((registry) => {
        const filtered = filterExperiments(registry, (r: ExperimentRecord) =>
          (!flags.accepted || r.accepted)
          && (!flags.tag || r.tags.includes(flags.tag))
          && (!flags.substrate || r.substrateContext.substrate === flags.substrate),
        );
        return { ...registry, experiments: filtered.slice(0, flags.top ?? 20) };
      }),
    ),
  }),
});

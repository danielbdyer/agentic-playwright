import { Effect } from 'effect';
import { AdoId } from '../domain/identity';
import { compileScenario } from './compile';
import { syncSnapshots } from './sync';
import { ProjectPaths } from './paths';

export function refreshScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const sync = yield* syncSnapshots({ adoId: options.adoId, paths: options.paths });
    const compile = yield* compileScenario(options);
    return {
      sync,
      compile,
    };
  });
}


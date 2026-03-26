import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import type { WorkspaceCatalog } from './catalog';
import { compileScenario } from './compile';
import { syncSnapshots } from './sync';
import type { ProjectPaths } from './paths';

export function refreshScenario(options: { adoId: AdoId; paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const sync = yield* syncSnapshots({ adoId: options.adoId, paths: options.paths });
    const compile = yield* compileScenario(options);
    return {
      sync,
      compile,
    };
  });
}


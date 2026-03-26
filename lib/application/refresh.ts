import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import type { WorkspaceCatalog } from './catalog';
import { compileScenario, compileScenarioCore } from './compile';
import { syncSnapshots } from './sync';
import type { ProjectPaths } from './paths';

/**
 * Core refresh: sync snapshots + compile without global graph/types.
 * Use this when refreshing multiple scenarios concurrently; call
 * `buildDerivedGraph` and `generateTypes` once afterward.
 */
export function refreshScenarioCore(options: { adoId: AdoId; paths: ProjectPaths; catalog?: WorkspaceCatalog }) {
  return Effect.gen(function* () {
    const sync = yield* syncSnapshots({ adoId: options.adoId, paths: options.paths });
    const compile = yield* compileScenarioCore(options);
    return {
      sync,
      compile,
    };
  });
}

/** Full refresh: sync + compile + global graph/types derivation. */
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

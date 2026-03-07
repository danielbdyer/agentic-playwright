import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { bindScenario } from './bind';
import { emitScenario } from './emit';
import { buildDerivedGraph } from './graph';
import { parseScenario } from './parse';
import type { ProjectPaths } from './paths';
import { generateTypes } from './types';
import { loadTrustPolicy } from './trust-policy';

export function compileScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const trustPolicy = yield* loadTrustPolicy(options.paths);
    const parsed = yield* parseScenario(options);
    const bound = yield* bindScenario(options);
    const emitted = yield* emitScenario(options);
    const graph = yield* buildDerivedGraph({ paths: options.paths });
    const generatedTypes = yield* generateTypes({ paths: options.paths });
    return {
      parsed,
      bound,
      emitted,
      graph,
      generatedTypes,
      trustPolicy,
    };
  });
}


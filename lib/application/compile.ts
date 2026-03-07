import { Effect } from 'effect';
import { AdoId } from '../domain/identity';
import { bindScenario } from './bind';
import { expandScenarioTemplates } from './expand';
import { emitScenario } from './emit';
import { buildDerivedGraph } from './graph';
import { parseScenario } from './parse';
import { ProjectPaths } from './paths';
import { generateTypes } from './types';

export function compileScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const parsed = yield* parseScenario(options);
    const expanded = yield* expandScenarioTemplates(options);
    const bound = yield* bindScenario(options);
    const emitted = yield* emitScenario(options);
    const graph = yield* buildDerivedGraph({ paths: options.paths });
    const generatedTypes = yield* generateTypes({ paths: options.paths });
    return {
      parsed,
      expanded,
      bound,
      emitted,
      graph,
      generatedTypes,
    };
  });
}


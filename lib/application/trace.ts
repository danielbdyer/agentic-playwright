import { Effect } from 'effect';
import type { AdoId } from '../domain/identity';
import { collectRelatedSubgraph } from '../domain/graph-query';
import { graphIds } from '../domain/ids';
import { TesseractError } from '../domain/errors';
import { ensureDerivedGraph } from './graph';
import type { ProjectPaths } from './paths';

export function traceScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const derived = yield* ensureDerivedGraph({ paths: options.paths });
    const scenarioNodeId = graphIds.scenario(options.adoId);
    const scenarioExists = derived.graph.nodes.some((node) => node.id === scenarioNodeId);
    if (!scenarioExists) {
      return yield* Effect.fail(new TesseractError('trace-not-found', `Unable to trace scenario ${options.adoId}`));
    }

    const seedNodes = new Set<string>([scenarioNodeId]);
    const stepPrefix = graphIds.stepPrefix(options.adoId);
    for (const node of derived.graph.nodes) {
      if (node.id.startsWith(stepPrefix)) {
        seedNodes.add(node.id);
      }
    }

    const subgraph = collectRelatedSubgraph(derived.graph, seedNodes);
    return {
      adoId: options.adoId,
      graphPath: derived.graphPath,
      nodeCount: subgraph.nodes.length,
      edgeCount: subgraph.edges.length,
      nodes: subgraph.nodes,
      edges: subgraph.edges,
    };
  });
}


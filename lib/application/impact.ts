import { Effect } from 'effect';
import { ensureDerivedGraph } from './graph';
import { ProjectPaths } from './paths';
import { TesseractError } from '../domain/errors';
import { collectImpactSubgraph } from '../domain/graph-query';

export function impactNode(options: { nodeId: string; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const derived = yield* ensureDerivedGraph({ paths: options.paths });
    const node = derived.graph.nodes.find((entry) => entry.id === options.nodeId);
    if (!node) {
      return yield* Effect.fail(new TesseractError('impact-node-not-found', `Unknown node ${options.nodeId}`));
    }

    const subgraph = collectImpactSubgraph(derived.graph, options.nodeId);
    return {
      nodeId: options.nodeId,
      graphPath: derived.graphPath,
      impactedNodes: subgraph.nodes,
      impactedEdges: subgraph.edges,
    };
  });
}


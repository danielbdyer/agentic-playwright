import { Effect } from 'effect';
import { ensureDerivedGraph } from './graph';
import type { ProjectPaths } from './paths';
import { TesseractError } from '../domain/errors';
import { collectImpactSubgraph } from '../domain/codegen/graph-query';
import type { DerivedGraph } from '../domain/types';

export function impactNode(options: { nodeId: string; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const derived = (yield* ensureDerivedGraph({ paths: options.paths })) as { graph: DerivedGraph; graphPath: string };
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


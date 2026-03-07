import { Effect } from 'effect';
import { ensureDerivedGraph } from './graph';
import { ProjectPaths } from './paths';
import { TesseractError } from '../domain/errors';
import { collectImpactSubgraph, findScenarioIdsByDriftClass } from '../domain/graph-query';

export function impactNode(options: { nodeId?: string; driftClass?: string; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const derived = yield* ensureDerivedGraph({ paths: options.paths });

    if (options.driftClass) {
      const scenarios = findScenarioIdsByDriftClass(derived.graph, options.driftClass);
      return {
        driftClass: options.driftClass,
        graphPath: derived.graphPath,
        impactedScenarioIds: scenarios,
      };
    }

    const nodeId = options.nodeId;
    if (!nodeId) {
      return yield* Effect.fail(new TesseractError('impact-node-not-found', 'Missing node identifier'));
    }

    const node = derived.graph.nodes.find((entry) => entry.id === nodeId);
    if (!node) {
      return yield* Effect.fail(new TesseractError('impact-node-not-found', `Unknown node ${nodeId}`));
    }

    const subgraph = collectImpactSubgraph(derived.graph, nodeId);
    return {
      nodeId,
      graphPath: derived.graphPath,
      impactedNodes: subgraph.nodes,
      impactedEdges: subgraph.edges,
    };
  });
}

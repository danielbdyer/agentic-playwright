import { Effect } from 'effect';
import type { AdoId } from '../../domain/kernel/identity';
import { collectRelatedSubgraph } from '../../domain/graph/graph-query';
import { graphIds } from '../../domain/kernel/ids';
import { TesseractError } from '../../domain/kernel/errors';
import { ensureDerivedGraph } from '../analysis/graph';
import type { ProjectPaths } from '../paths';
import type { DerivedGraph } from '../../domain/projection/types';

export function traceScenario(options: { adoId: AdoId; paths: ProjectPaths }) {
  return Effect.gen(function* () {
    const derived = (yield* ensureDerivedGraph({ paths: options.paths })) as { graph: DerivedGraph; graphPath: string };
    const scenarioNodeId = graphIds.scenario(options.adoId);
    yield* Effect.succeed(derived.graph.nodes.some((node) => node.id === scenarioNodeId)).pipe(
      Effect.filterOrFail(
        (exists): exists is true => exists,
        () => new TesseractError('trace-not-found', `Unable to trace scenario ${options.adoId}`),
      ),
    );

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


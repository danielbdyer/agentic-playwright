import type { DerivedGraph, GraphEdge, GraphNode } from './types/projection';

function nodeLookup(graph: DerivedGraph): Map<string, GraphNode> {
  return new Map(graph.nodes.map((node) => [node.id, node] as const));
}

function dependentNodesForEdge(edge: GraphEdge, nodes: Map<string, GraphNode>, current: string): string[] {
  switch (edge.kind) {
    case 'derived-from':
    case 'references':
    case 'uses':
    case 'learns-from':
    case 'asserts':
    case 'observed-by':
      return edge.to === current ? [edge.from] : [];
    case 'emits':
    case 'affects':
    case 'proposed-change-for':
    case 'governs':
      return edge.from === current ? [edge.to] : [];
    case 'contains': {
      const parent = nodes.get(edge.from);
      const child = nodes.get(edge.to);
      if (edge.to === current && parent?.kind === 'scenario' && child?.kind === 'step') {
        return [edge.from];
      }
      return [];
    }
    default:
      return [];
  }
}

export function collectRelatedSubgraph(graph: DerivedGraph, seedNodeIds: Set<string>) {
  const expandOnce = (current: Set<string>): Set<string> =>
    graph.edges.reduce((acc, edge) => {
      if (acc.has(edge.from) || acc.has(edge.to)) {
        return new Set([...acc, edge.from, edge.to]);
      }
      return acc;
    }, current);

  const converge = (current: Set<string>): Set<string> => {
    const next = expandOnce(current);
    return next.size === current.size ? current : converge(next);
  };

  const expanded = converge(new Set(seedNodeIds));

  return {
    nodes: graph.nodes.filter((node) => expanded.has(node.id)),
    edges: graph.edges.filter((edge) => expanded.has(edge.from) && expanded.has(edge.to)),
  };
}

export function collectImpactSubgraph(graph: DerivedGraph, nodeId: string) {
  const nodes = nodeLookup(graph);

  const traverse = (frontier: ReadonlyArray<string>, visited: Set<string>): Set<string> => {
    if (frontier.length === 0) {
      return visited;
    }

    const [current, ...rest] = frontier;
    const newDependents = graph.edges
      .flatMap((edge) => dependentNodesForEdge(edge, nodes, current!))
      .filter((dependent) => !visited.has(dependent));

    const nextVisited = new Set([...visited, ...newDependents]);
    return traverse([...rest, ...newDependents], nextVisited);
  };

  const impacted = traverse([nodeId], new Set([nodeId]));

  return {
    nodes: graph.nodes.filter((node) => impacted.has(node.id)),
    edges: graph.edges.filter((edge) => impacted.has(edge.from) && impacted.has(edge.to)),
  };
}

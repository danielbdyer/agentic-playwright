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
  const expanded = new Set(seedNodeIds);
  let changed = true; // eslint-disable-line no-restricted-syntax -- baseline: fixed-point convergence

  while (changed) {
    changed = false;
    for (const edge of graph.edges) {
      if (expanded.has(edge.from) || expanded.has(edge.to)) {
        if (!expanded.has(edge.from)) {
          expanded.add(edge.from);
          changed = true;
        }
        if (!expanded.has(edge.to)) {
          expanded.add(edge.to);
          changed = true;
        }
      }
    }
  }

  return {
    nodes: graph.nodes.filter((node) => expanded.has(node.id)),
    edges: graph.edges.filter((edge) => expanded.has(edge.from) && expanded.has(edge.to)),
  };
}

export function collectImpactSubgraph(graph: DerivedGraph, nodeId: string) {
  const impacted = new Set<string>([nodeId]);
  const queue = [nodeId];
  const nodes = nodeLookup(graph);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      continue;
    }

    for (const edge of graph.edges) {
      for (const dependent of dependentNodesForEdge(edge, nodes, current)) {
        if (!impacted.has(dependent)) {
          impacted.add(dependent);
          queue.push(dependent); // eslint-disable-line no-restricted-syntax -- baseline: BFS queue
        }
      }
    }
  }

  return {
    nodes: graph.nodes.filter((node) => impacted.has(node.id)),
    edges: graph.edges.filter((edge) => impacted.has(edge.from) && impacted.has(edge.to)),
  };
}

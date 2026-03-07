import { DerivedGraph } from './types';

export function collectRelatedSubgraph(graph: DerivedGraph, seedNodeIds: Set<string>) {
  const expanded = new Set(seedNodeIds);
  let changed = true;

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

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of graph.edges) {
      if (edge.to === current && !impacted.has(edge.from)) {
        impacted.add(edge.from);
        queue.push(edge.from);
      }
      if (edge.from === current && !impacted.has(edge.to)) {
        impacted.add(edge.to);
        queue.push(edge.to);
      }
    }
  }

  return {
    nodes: graph.nodes.filter((node) => impacted.has(node.id)),
    edges: graph.edges.filter((edge) => impacted.has(edge.from) && impacted.has(edge.to)),
  };
}


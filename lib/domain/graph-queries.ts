/**
 * Runtime graph queries (W4.3)
 *
 * Pure functions over the DerivedGraph, turning compile-time projection
 * into a live navigation oracle. Each function is a read-only query
 * that extracts structured information from the immutable graph.
 *
 * All functions are pure: no side effects, no mutation, no I/O.
 */

import type { ScreenId } from './identity';
import type { DerivedGraph, GraphNode, GraphEdge } from './types/projection';

// ─── Public result types ───

export interface Transition {
  readonly edgeId: string;
  readonly fromScreenId: ScreenId;
  readonly toScreenId: ScreenId;
  readonly edgeKind: GraphEdge['kind'];
  readonly label: string;
}

export interface ElementDescriptor {
  readonly nodeId: string;
  readonly label: string;
  readonly kind: GraphNode['kind'];
  readonly payload: Readonly<Record<string, unknown>> | undefined;
}

// ─── Internal index builders ───

interface GraphIndex {
  readonly nodeById: ReadonlyMap<string, GraphNode>;
  readonly screenNodes: ReadonlyMap<string, GraphNode>;
  readonly edgesByFrom: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly edgesByTo: ReadonlyMap<string, readonly GraphEdge[]>;
  readonly containedBy: ReadonlyMap<string, string>;
}

/** Helper: merge entries into an existing Map without spreading iterables. */
function mapWithEntry<K, V>(base: Map<K, V>, key: K, value: V): Map<K, V> {
  const copy = new Map<K, V>(base);
  copy.set(key, value);
  return copy;
}

function buildIndex(graph: DerivedGraph): GraphIndex {
  const nodeById = new Map<string, GraphNode>(graph.nodes.map((n) => [n.id, n]));
  const screenNodes = new Map<string, GraphNode>(
    graph.nodes
      .filter((n) => n.kind === 'screen')
      .map((n) => [n.id, n]),
  );
  const edgesByFrom = graph.edges.reduce<Map<string, GraphEdge[]>>(
    (acc, e) => {
      const existing = acc.get(e.from);
      return mapWithEntry(acc, e.from, existing ? [...existing, e] : [e]);
    },
    new Map<string, GraphEdge[]>(),
  );
  const edgesByTo = graph.edges.reduce<Map<string, GraphEdge[]>>(
    (acc, e) => {
      const existing = acc.get(e.to);
      return mapWithEntry(acc, e.to, existing ? [...existing, e] : [e]);
    },
    new Map<string, GraphEdge[]>(),
  );
  const containedBy = new Map<string, string>(
    graph.edges
      .filter((e) => e.kind === 'contains')
      .map((e) => [e.to, e.from]),
  );
  return { nodeById, screenNodes, edgesByFrom, edgesByTo, containedBy };
}

function screenNodeId(screenId: ScreenId): string {
  return `screen:${screenId}`;
}

// ─── Screen-to-screen transition edges ───

const navigationEdgeKinds: ReadonlySet<string> = new Set([
  'affects',
  'references',
  'uses',
  'derived-from',
]);

/**
 * Finds transitions that can leave from a screen to other screens.
 * Considers edges where a screen node is connected to another screen node
 * via navigation-relevant edge kinds (affects, references, uses).
 */
export function queryAvailableTransitions(
  graph: DerivedGraph,
  screenId: ScreenId,
): readonly Transition[] {
  const idx = buildIndex(graph);
  const sourceId = screenNodeId(screenId);
  const outEdges = idx.edgesByFrom.get(sourceId) ?? [];

  return outEdges
    .filter(
      (edge) =>
        navigationEdgeKinds.has(edge.kind) &&
        idx.screenNodes.has(edge.to),
    )
    .map((edge) => {
      const targetNode = idx.nodeById.get(edge.to);
      const toId = edge.to.replace(/^screen:/, '') as ScreenId;
      return {
        edgeId: edge.id,
        fromScreenId: screenId,
        toScreenId: toId,
        edgeKind: edge.kind,
        label: targetNode?.label ?? edge.to,
      };
    });
}

// ─── Reachability (BFS with depth bound) ───

/**
 * Returns all screen IDs reachable from a starting screen within maxDepth hops.
 * Uses BFS over screen-to-screen edges. The starting screen is not included
 * in the result unless it is reachable via a cycle.
 */
export function queryReachableScreens(
  graph: DerivedGraph,
  fromScreenId: ScreenId,
  maxDepth: number,
): readonly ScreenId[] {
  const idx = buildIndex(graph);

  const step = (
    frontier: readonly string[],
    visited: ReadonlySet<string>,
    depth: number,
  ): ReadonlySet<string> => {
    if (depth >= maxDepth || frontier.length === 0) return visited;

    const nextFrontier = frontier.flatMap((nodeId) => {
      const outEdges = idx.edgesByFrom.get(nodeId) ?? [];
      return outEdges
        .filter(
          (edge) =>
            navigationEdgeKinds.has(edge.kind) &&
            idx.screenNodes.has(edge.to) &&
            !visited.has(edge.to),
        )
        .map((edge) => edge.to);
    });

    const dedupSet = new Set(nextFrontier);
    const uniqueNext = Array.from(dedupSet);
    const nextVisitedSet = new Set<string>(Array.from(visited));
    uniqueNext.forEach((id) => nextVisitedSet.add(id));
    return step(uniqueNext, nextVisitedSet, depth + 1);
  };

  const startId = screenNodeId(fromScreenId);
  const reachable = step([startId], new Set([startId]), 0);

  return Array.from(reachable)
    .filter((id) => id !== startId)
    .map((id) => id.replace(/^screen:/, '') as ScreenId);
}

// ─── Shortest path (BFS) ───

/**
 * Finds the shortest path between two screens by BFS.
 * Returns the path as an ordered array of ScreenIds (including from and to),
 * or null if no path exists.
 */
export function queryShortestPath(
  graph: DerivedGraph,
  from: ScreenId,
  to: ScreenId,
): readonly ScreenId[] | null {
  const idx = buildIndex(graph);
  const startId = screenNodeId(from);
  const endId = screenNodeId(to);

  if (startId === endId) return [from];
  if (!idx.screenNodes.has(startId) || !idx.screenNodes.has(endId)) return null;

  const step = (
    frontier: readonly string[],
    parentMap: ReadonlyMap<string, string>,
  ): ReadonlyMap<string, string> | null => {
    if (frontier.length === 0) return null;

    const nextEntries: readonly (readonly [string, string])[] = frontier.flatMap((nodeId) => {
      const outEdges = idx.edgesByFrom.get(nodeId) ?? [];
      return outEdges
        .filter(
          (edge) =>
            navigationEdgeKinds.has(edge.kind) &&
            idx.screenNodes.has(edge.to) &&
            !parentMap.has(edge.to),
        )
        .map((edge) => [edge.to, nodeId] as const);
    });

    // Deduplicate by target (first occurrence wins)
    const seen = new Set<string>();
    const uniqueEntries: Array<readonly [string, string]> = [];
    for (const entry of nextEntries) {
      if (!seen.has(entry[0])) {
        seen.add(entry[0]);
        uniqueEntries.push(entry);
      }
    }

    const nextParentMap = new Map<string, string>(Array.from(parentMap));
    uniqueEntries.forEach(([target, parent]) => nextParentMap.set(target, parent));

    const found = uniqueEntries.find(([target]) => target === endId);
    if (found) return nextParentMap;

    const nextFrontier = uniqueEntries.map(([target]) => target);
    return step(nextFrontier, nextParentMap);
  };

  const initialParents = new Map<string, string>();
  initialParents.set(startId, '');
  const result = step([startId], initialParents);
  if (!result) return null;

  // Reconstruct path by walking parent pointers
  const reconstructPath = (current: string, acc: readonly string[]): readonly string[] => {
    const parent = result.get(current);
    if (parent === undefined || parent === '') return [current, ...acc];
    return reconstructPath(parent, [current, ...acc]);
  };

  const rawPath = reconstructPath(endId, []);
  return rawPath.map((id) => id.replace(/^screen:/, '') as ScreenId);
}

// ─── Elements for a screen ───

/**
 * Returns all element descriptors that are contained by (or directly
 * associated with) a given screen node in the graph.
 */
export function queryScreenElements(
  graph: DerivedGraph,
  screenId: ScreenId,
): readonly ElementDescriptor[] {
  const idx = buildIndex(graph);
  const sid = screenNodeId(screenId);
  const outEdges = idx.edgesByFrom.get(sid) ?? [];

  const elementNodeIds = outEdges
    .filter((edge) => edge.kind === 'contains')
    .map((edge) => edge.to);

  // Also check for elements that reference the screen
  const inEdges = idx.edgesByTo.get(sid) ?? [];
  const referencingElementIds = inEdges
    .filter((edge) => edge.kind === 'references' || edge.kind === 'uses')
    .map((edge) => edge.from)
    .filter((id) => {
      const node = idx.nodeById.get(id);
      return node?.kind === 'element';
    });

  const allElementIds = Array.from(new Set(elementNodeIds.concat(referencingElementIds)));

  return allElementIds
    .map((id) => idx.nodeById.get(id))
    .filter((node): node is GraphNode => node !== undefined)
    .map((node) => ({
      nodeId: node.id,
      label: node.label,
      kind: node.kind,
      payload: node.payload,
    }));
}

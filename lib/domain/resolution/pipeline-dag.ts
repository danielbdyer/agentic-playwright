/**
 * Formal pipeline DAG with auto-ordering (W4.1)
 *
 * Replaces sequential pipeline execution with a dependency-aware DAG.
 * Provides topological sorting (Kahn's algorithm), parallel group discovery,
 * and cycle/missing-dependency validation.
 *
 * All functions are pure: no mutation, no side effects.
 */

import { TesseractError } from '../kernel/errors';

// ─── Types ───

export interface PipelineNode {
  readonly id: string;
  readonly stage: string;
  readonly dependencies: readonly string[];
}

export interface PipelineDAG {
  readonly nodes: readonly PipelineNode[];
  readonly topologicalOrder: readonly string[];
}

// ─── Map helpers (ES2021-safe, no iterable spread) ───

function mapWithEntry<K, V>(base: ReadonlyMap<K, V>, key: K, value: V): Map<K, V> {
  const copy = new Map<K, V>(base as Map<K, V>);
  copy.set(key, value);
  return copy;
}

// ─── Topological sort: Kahn's algorithm ───

/**
 * Pure Kahn's algorithm. Returns the topological order of node IDs.
 * Throws if a cycle is detected (frontier exhausted before all nodes processed).
 *
 * Implementation uses recursive fold over the frontier instead of a mutable while loop.
 */
export function topologicalSort(nodes: readonly PipelineNode[]): readonly string[] {
  const nodeIds = new Set(nodes.map((n) => n.id));

  // Compute in-degree for each node (only counting edges from nodes in the set)
  const inDegree = new Map<string, number>(
    nodes.map((n) => [
      n.id,
      n.dependencies.filter((dep) => nodeIds.has(dep)).length,
    ]),
  );

  // Build adjacency: for each dependency d -> n (d is depended upon by n)
  const dependents = nodes.reduce<ReadonlyMap<string, readonly string[]>>(
    (acc, node) => {
      return node.dependencies
        .filter((dep) => nodeIds.has(dep))
        .reduce<ReadonlyMap<string, readonly string[]>>((innerAcc, dep) => {
          const existing = innerAcc.get(dep) ?? [];
          return mapWithEntry(innerAcc, dep, [...existing, node.id]);
        }, acc);
    },
    new Map<string, readonly string[]>(),
  );

  // Initial frontier: nodes with in-degree 0
  const initialFrontier = nodes
    .flatMap((n) => (inDegree.get(n.id) ?? 0) === 0 ? [n.id] : []);

  // Recursive fold: process frontier, accumulate sorted order, update in-degrees
  const step = (
    frontier: readonly string[],
    sorted: readonly string[],
    currentInDegree: ReadonlyMap<string, number>,
  ): readonly string[] => {
    if (frontier.length === 0) return sorted;

    const [current, ...restFrontier] = frontier;
    if (current === undefined) return sorted;

    const nextSorted = [...sorted, current];
    const neighbors = dependents.get(current) ?? [];

    // Reduce over neighbors to update in-degrees and find new zero-degree nodes
    const { nextInDegree, newZeros } = neighbors.reduce<{
      readonly nextInDegree: ReadonlyMap<string, number>;
      readonly newZeros: readonly string[];
    }>(
      (acc, neighbor) => {
        const oldDeg = acc.nextInDegree.get(neighbor) ?? 0;
        const newDeg = oldDeg - 1;
        const updatedDegree = mapWithEntry(acc.nextInDegree, neighbor, newDeg);
        return {
          nextInDegree: updatedDegree,
          newZeros: newDeg === 0 ? [...acc.newZeros, neighbor] : acc.newZeros,
        };
      },
      { nextInDegree: currentInDegree, newZeros: [] as readonly string[] },
    );

    return step([...restFrontier, ...newZeros], nextSorted, nextInDegree);
  };

  const result = step(initialFrontier, [], inDegree);

  if (result.length !== nodes.length) {
    throw new TesseractError(
      'validation-error',
      `Cycle detected in pipeline DAG: processed ${result.length} of ${nodes.length} nodes`,
    );
  }

  return result;
}

// ─── DAG builder ───

export interface PipelineStage {
  readonly name: string;
  readonly dependencies: readonly string[];
}

/**
 * Builds a PipelineDAG from a list of stages.
 * Each stage is mapped to a PipelineNode with stage = name.
 * The topological order is computed eagerly.
 */
export function buildPipelineDAG(stages: readonly PipelineStage[]): PipelineDAG {
  const nodes: readonly PipelineNode[] = stages.map((stage) => ({
    id: stage.name,
    stage: stage.name,
    dependencies: stage.dependencies,
  }));

  const topologicalOrder = topologicalSort(nodes);

  return { nodes, topologicalOrder };
}

// ─── Parallel group discovery ───

/**
 * Partitions the topological order into groups of nodes that can execute
 * concurrently. A node belongs to the earliest group where all its
 * dependencies have already been placed in prior groups.
 *
 * Uses a fold over the topological order to assign each node to a depth level.
 */
export function findParallelGroups(
  dag: PipelineDAG,
): readonly (readonly string[])[] {
  const nodeMap = new Map<string, PipelineNode>(dag.nodes.map((n) => [n.id, n]));
  const nodeIds = new Set(dag.nodes.map((n) => n.id));

  // Compute depth for each node: max(depth of dependencies) + 1
  const depths = dag.topologicalOrder.reduce<ReadonlyMap<string, number>>(
    (acc, nodeId) => {
      const node = nodeMap.get(nodeId);
      if (!node) return acc;
      const depDepths = node.dependencies
        .flatMap((dep) => nodeIds.has(dep) ? [acc.get(dep) ?? 0] : []);
      const depth = depDepths.length === 0 ? 0 : Math.max(...depDepths) + 1;
      return mapWithEntry(acc, nodeId, depth);
    },
    new Map<string, number>(),
  );

  // Group by depth
  const maxDepth = dag.topologicalOrder.reduce(
    (max, id) => Math.max(max, depths.get(id) ?? 0),
    0,
  );

  return Array.from({ length: maxDepth + 1 }, (_, depth) =>
    dag.topologicalOrder.filter((id) => (depths.get(id) ?? 0) === depth),
  ).filter((group) => group.length > 0);
}

// ─── DAG validation ───

/**
 * Validates a PipelineDAG and returns an array of diagnostic messages.
 * Empty array means the DAG is valid.
 *
 * Checks:
 * 1. Missing dependencies (reference to non-existent node)
 * 2. Self-dependencies
 * 3. Duplicate node IDs
 * 4. Cycle detection (via topological sort attempt)
 */
export function validateDAG(dag: PipelineDAG): readonly string[] {
  const nodeIds = new Set(dag.nodes.map((n) => n.id));

  // Check for duplicate node IDs
  const duplicates = dag.nodes
    .flatMap((n, index, all) => all.findIndex((other) => other.id === n.id) !== index ? [n.id] : []);
  const duplicateDiags = Array.from(new Set(duplicates)).map(
    (id) => `Duplicate node ID: ${id}`,
  );

  // Check for missing dependencies
  const missingDeps = dag.nodes.flatMap((node) =>
    node.dependencies
      .flatMap((dep) => !nodeIds.has(dep) ? [`Node '${node.id}' depends on missing node '${dep}'`] : []),
  );

  // Check for self-dependencies
  const selfDeps = dag.nodes
    .flatMap((node) => node.dependencies.includes(node.id) ? [`Node '${node.id}' depends on itself`] : []);

  // Check for cycles by attempting topological sort
  const cycleDiags: readonly string[] = (() => {
    try {
      topologicalSort(dag.nodes);
      return [];
    } catch {
      return ['Cycle detected in pipeline DAG'];
    }
  })();

  return [...duplicateDiags, ...missingDeps, ...selfDeps, ...cycleDiags];
}

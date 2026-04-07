/**
 * Hierarchical metric tree.
 *
 * A `MetricNode` is a `Metric<Kind>` plus an ordered list of child nodes.
 * Trees compose naturally — a "rung distribution" metric might have one
 * child per rung; a "compounding economics" metric might have children for
 * hit rate, proposal yield, and degradation. Trees are heterogeneous: the
 * root and children can carry different metric kinds.
 *
 * The fold function `foldMetricTree` is the canonical way to consume a
 * tree. Renderers, diff producers, and aggregators all phrase themselves
 * as folds, never as ad-hoc traversal.
 *
 * Trees are immutable. All builders return new structures.
 */

import type { Metric } from './metric';

// ─── Node ───

/** A node in a metric tree. The default `Kind = string` allows
 *  heterogeneous trees while still letting callers narrow the root type
 *  when they construct a tree of known shape. */
export interface MetricNode<Kind extends string = string> {
  readonly metric: Metric<Kind>;
  readonly children: ReadonlyArray<MetricNode>;
}

/** Construct a metric node. Children default to empty for leaf nodes. */
export function metricNode<Kind extends string>(
  metric: Metric<Kind>,
  children: ReadonlyArray<MetricNode> = [],
): MetricNode<Kind> {
  return { metric, children };
}

// ─── Folds ───

/** Bottom-up fold over a metric tree. The reducer receives the current
 *  node's metric and the already-folded results of its children. Pure
 *  function — no side effects. */
export function foldMetricTree<R>(
  node: MetricNode,
  reducer: (metric: Metric<string>, childResults: ReadonlyArray<R>) => R,
): R {
  const childResults = node.children.map((child) => foldMetricTree(child, reducer));
  return reducer(node.metric, childResults);
}

/** Pre-order traversal as a flat list of metrics. Useful for serialisation,
 *  registries, and "all metrics in this tree" queries. */
export function flattenMetricTree(node: MetricNode): ReadonlyArray<Metric<string>> {
  return foldMetricTree<ReadonlyArray<Metric<string>>>(node, (metric, childLists) => [
    metric,
    ...childLists.flatMap((list) => list),
  ]);
}

/** Find the first node whose metric matches the given kind. Returns
 *  `undefined` if no such node exists. */
export function findMetricNode<Kind extends string>(
  node: MetricNode,
  kind: Kind,
): MetricNode<Kind> | undefined {
  if (node.metric.kind === kind) {
    return node as MetricNode<Kind>;
  }
  for (const child of node.children) {
    const found = findMetricNode(child, kind);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Map every metric in the tree through a transform, preserving structure.
 *  The transform receives the original metric and must return a metric of
 *  the same kind (preserving phantom branding). */
export function mapMetricTree(
  node: MetricNode,
  transform: <K extends string>(metric: Metric<K>) => Metric<K>,
): MetricNode {
  return {
    metric: transform(node.metric),
    children: node.children.map((child) => mapMetricTree(child, transform)),
  };
}

/** Count the total number of nodes in the tree (root + descendants). */
export function countMetricNodes(node: MetricNode): number {
  return foldMetricTree<number>(node, (_metric, childCounts) =>
    1 + childCounts.reduce((acc, count) => acc + count, 0),
  );
}

/** Return the maximum depth of the tree. A leaf node has depth 1. */
export function metricTreeDepth(node: MetricNode): number {
  return foldMetricTree<number>(node, (_metric, childDepths) =>
    1 + (childDepths.length === 0 ? 0 : Math.max(...childDepths)),
  );
}

/**
 * Typed Graph Builder with Phantom Build Phases (W5.28)
 *
 * Provides a phantom-typed builder that enforces construction order at the type level:
 *   NodePhase -> EdgePhase -> MetricPhase -> CompletePhase
 *
 * Only `GraphBuilder<'complete'>` exposes `.build()`, preventing out-of-order construction.
 * Each phase transition is a pure function returning a new builder — no mutation.
 */

import { sortByStringKey } from './collections';
import { sha256, stableStringify } from './hash';
import type { DerivedGraph, GraphEdge, GraphNode, MappedMcpResource, MappedMcpTemplate } from './types';

// ─── Phantom Phase Brands ───

declare const NodePhaseBrand: unique symbol;
declare const EdgePhaseBrand: unique symbol;
declare const MetricPhaseBrand: unique symbol;
declare const CompletePhaseBrand: unique symbol;

/** Phantom brand for the node-accumulation phase. */
export type NodePhase = 'nodes' & { readonly __brand: typeof NodePhaseBrand };

/** Phantom brand for the edge-accumulation phase. */
export type EdgePhase = 'edges' & { readonly __brand: typeof EdgePhaseBrand };

/** Phantom brand for the metrics-computation phase. */
export type MetricPhase = 'metrics' & { readonly __brand: typeof MetricPhaseBrand };

/** Phantom brand for the completed-build phase. */
export type CompletePhase = 'complete' & { readonly __brand: typeof CompletePhaseBrand };

/** All valid build phases. */
export type BuildPhase = NodePhase | EdgePhase | MetricPhase | CompletePhase;

// ─── Graph Metrics ───

export interface GraphMetrics {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly nodeKindCounts: Readonly<Record<string, number>>;
  readonly edgeKindCounts: Readonly<Record<string, number>>;
  readonly orphanNodeCount: number;
}

// ─── Internal State ───

interface BuilderState {
  readonly nodes: readonly GraphNode[];
  readonly edges: readonly GraphEdge[];
  readonly resources: readonly MappedMcpResource[];
  readonly resourceTemplates: readonly MappedMcpTemplate[];
  readonly metrics: GraphMetrics | null;
}

// ─── GraphBuilder Interface (phase-indexed) ───

/**
 * A phantom-typed graph builder. The `Phase` type parameter restricts
 * which methods are callable, enforcing the build order at compile time.
 */
export interface GraphBuilder<Phase extends BuildPhase> {
  readonly phase: Phase;

  /**
   * Accumulate nodes. Only available during `NodePhase`.
   */
  readonly addNodes: Phase extends NodePhase
    ? (nodes: readonly GraphNode[]) => GraphBuilder<NodePhase>
    : never;

  /**
   * Transition from node phase to edge phase. Only available during `NodePhase`.
   */
  readonly finalizeNodes: Phase extends NodePhase
    ? () => GraphBuilder<EdgePhase>
    : never;

  /**
   * Accumulate edges. Only available during `EdgePhase`.
   */
  readonly addEdges: Phase extends EdgePhase
    ? (edges: readonly GraphEdge[]) => GraphBuilder<EdgePhase>
    : never;

  /**
   * Transition from edge phase to metric phase. Only available during `EdgePhase`.
   */
  readonly finalizeEdges: Phase extends EdgePhase
    ? () => GraphBuilder<MetricPhase>
    : never;

  /**
   * Compute metrics from accumulated nodes and edges. Only available during `MetricPhase`.
   */
  readonly computeMetrics: Phase extends MetricPhase
    ? () => GraphBuilder<CompletePhase>
    : never;

  /**
   * Build the final DerivedGraph. Only available during `CompletePhase`.
   */
  readonly build: Phase extends CompletePhase
    ? () => DerivedGraph
    : never;

  /**
   * Read-only access to accumulated nodes (available in all phases).
   */
  readonly getNodes: () => readonly GraphNode[];

  /**
   * Read-only access to accumulated edges (available in edge phase and beyond).
   */
  readonly getEdges: () => readonly GraphEdge[];

  /**
   * Read-only access to computed metrics (available in complete phase only).
   */
  readonly getMetrics: () => GraphMetrics | null;
}

// ─── Metric Computation (pure) ───

export function computeGraphMetrics(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
): GraphMetrics {
  const referencedNodeIds = new Set(
    edges.flatMap((e) => [e.from, e.to]),
  );
  const nodeKindCounts = nodes.reduce<Readonly<Record<string, number>>>(
    (acc, node) => ({ ...acc, [node.kind]: (acc[node.kind] ?? 0) + 1 }),
    {},
  );
  const edgeKindCounts = edges.reduce<Readonly<Record<string, number>>>(
    (acc, edge) => ({ ...acc, [edge.kind]: (acc[edge.kind] ?? 0) + 1 }),
    {},
  );
  const orphanNodeCount = nodes.filter((n) => !referencedNodeIds.has(n.id)).length;

  return {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    nodeKindCounts,
    edgeKindCounts,
    orphanNodeCount,
  };
}

// ─── Sort and Finalize (pure) ───

function sortAndFinalize(state: BuilderState): DerivedGraph {
  const nodes = sortByStringKey(state.nodes, (n) => n.id);
  const edges = sortByStringKey(state.edges, (e) => e.id);
  const resources = sortByStringKey(state.resources, (r) => r.uri);
  const resourceTemplates = sortByStringKey(state.resourceTemplates, (r) => r.uriTemplate);
  return {
    version: 'v1',
    nodes,
    edges,
    resources,
    resourceTemplates,
    fingerprint: sha256(stableStringify({ nodes, edges, resources, resourceTemplates })),
  };
}

// ─── Builder Factory ───

function makeBuilder<P extends BuildPhase>(phase: P, state: BuilderState): GraphBuilder<P> {
  return {
    phase,
    addNodes: ((nodes: readonly GraphNode[]) =>
      makeBuilder('nodes' as NodePhase, {
        ...state,
        nodes: [...state.nodes, ...nodes],
      })) as GraphBuilder<P>['addNodes'],

    finalizeNodes: (() =>
      makeBuilder('edges' as EdgePhase, state)) as GraphBuilder<P>['finalizeNodes'],

    addEdges: ((edges: readonly GraphEdge[]) =>
      makeBuilder('edges' as EdgePhase, {
        ...state,
        edges: [...state.edges, ...edges],
      })) as GraphBuilder<P>['addEdges'],

    finalizeEdges: (() =>
      makeBuilder('metrics' as MetricPhase, state)) as GraphBuilder<P>['finalizeEdges'],

    computeMetrics: (() => {
      const metrics = computeGraphMetrics(state.nodes, state.edges);
      return makeBuilder('complete' as CompletePhase, { ...state, metrics });
    }) as GraphBuilder<P>['computeMetrics'],

    build: (() => sortAndFinalize(state)) as GraphBuilder<P>['build'],

    getNodes: () => state.nodes,
    getEdges: () => state.edges,
    getMetrics: () => state.metrics,
  };
}

/**
 * Create a new graph builder starting in the node-accumulation phase.
 *
 * Optionally provide MCP resources and resource templates.
 */
export function createGraphBuilder(options?: {
  readonly resources?: readonly MappedMcpResource[];
  readonly resourceTemplates?: readonly MappedMcpTemplate[];
}): GraphBuilder<NodePhase> {
  const initial: BuilderState = {
    nodes: [],
    edges: [],
    resources: options?.resources ?? [],
    resourceTemplates: options?.resourceTemplates ?? [],
    metrics: null,
  };
  return makeBuilder('nodes' as NodePhase, initial);
}

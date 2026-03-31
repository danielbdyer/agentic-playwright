import { sha256, stableStringify } from '../hash';
import type {
  ApplicationInterfaceGraph,
  InterfaceGraphEdge,
  InterfaceGraphNode,
} from '../types';
import type { TransitionRef } from '../identity';

export interface ApplicationInterfaceGraphInvariantReport {
  readonly uniqueNodeIds: boolean;
  readonly uniqueEdgeIds: boolean;
  readonly referencesKnownNodes: boolean;
}

export interface ApplicationInterfaceGraphInvariantError {
  readonly kind: 'application-interface-graph-invariant-error';
  readonly report: ApplicationInterfaceGraphInvariantReport;
}

export type ApplicationInterfaceGraphResult =
  | { readonly ok: true; readonly value: ApplicationInterfaceGraph }
  | { readonly ok: false; readonly error: ApplicationInterfaceGraphInvariantError };

function hasUniqueIds<T extends { readonly id: string }>(items: readonly T[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}

function referencesKnownNodes(
  nodes: readonly InterfaceGraphNode[],
  edges: readonly InterfaceGraphEdge[],
): boolean {
  const nodeIds = new Set(nodes.map((node) => node.id));
  return edges.every((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
}

export function graphInvariants(graph: ApplicationInterfaceGraph): ApplicationInterfaceGraphInvariantReport {
  return {
    uniqueNodeIds: hasUniqueIds(graph.nodes),
    uniqueEdgeIds: hasUniqueIds(graph.edges),
    referencesKnownNodes: referencesKnownNodes(graph.nodes, graph.edges),
  };
}

function graphFingerprint(graph: Omit<ApplicationInterfaceGraph, 'fingerprint'>): string {
  return sha256(stableStringify({
    discoveryRunIds: graph.discoveryRunIds,
    routeRefs: graph.routeRefs,
    routeVariantRefs: graph.routeVariantRefs,
    targetRefs: graph.targetRefs,
    stateRefs: graph.stateRefs,
    eventSignatureRefs: graph.eventSignatureRefs,
    transitionRefs: graph.transitionRefs,
    nodes: graph.nodes,
    edges: graph.edges,
  }));
}

export function createApplicationInterfaceGraph(
  input: Omit<ApplicationInterfaceGraph, 'fingerprint'>,
): ApplicationInterfaceGraphResult {
  const graph = {
    ...input,
    nodes: [...input.nodes].sort((left, right) => left.id.localeCompare(right.id)),
    edges: [...input.edges].sort((left, right) => left.id.localeCompare(right.id)),
    targetRefs: [...input.targetRefs].sort((left, right) => left.localeCompare(right)),
    routeRefs: [...input.routeRefs].sort((left, right) => left.localeCompare(right)),
    routeVariantRefs: [...input.routeVariantRefs].sort((left, right) => left.localeCompare(right)),
  } satisfies Omit<ApplicationInterfaceGraph, 'fingerprint'>;

  const created = {
    ...graph,
    fingerprint: graphFingerprint(graph),
  };
  const report = graphInvariants(created);
  return report.uniqueNodeIds && report.uniqueEdgeIds && report.referencesKnownNodes
    ? { ok: true, value: created }
    : {
        ok: false,
        error: {
          kind: 'application-interface-graph-invariant-error',
          report,
        },
      };
}

export function recordTransition(
  graph: ApplicationInterfaceGraph,
  transitionRef: TransitionRef,
): ApplicationInterfaceGraphResult {
  const { fingerprint: _fingerprint, ...baseGraph } = graph;
  return createApplicationInterfaceGraph({
    ...baseGraph,
    transitionRefs: [...new Set([...graph.transitionRefs, transitionRef])].sort((left, right) => left.localeCompare(right)),
  });
}

export function foldApplicationInterfaceGraph<R>(
  graph: ApplicationInterfaceGraph,
  cases: {
    readonly valid: (graph: ApplicationInterfaceGraph) => R;
    readonly invalid: (graph: ApplicationInterfaceGraph, report: ApplicationInterfaceGraphInvariantReport) => R;
  },
): R {
  const report = graphInvariants(graph);
  return report.uniqueNodeIds && report.uniqueEdgeIds && report.referencesKnownNodes
    ? cases.valid(graph)
    : cases.invalid(graph, report);
}

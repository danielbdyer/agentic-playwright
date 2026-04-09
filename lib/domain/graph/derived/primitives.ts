import { contentFingerprint } from '../../kernel/hash';
import type { GraphEdge, GraphEdgeKind, GraphNode, GraphNodeKind } from '../../projection/types';

function nodeFingerprint(kind: GraphNodeKind, id: string, payload?: Record<string, unknown>): string {
  return contentFingerprint({ kind, id, payload: payload ?? null });
}

function edgeFingerprint(kind: GraphEdgeKind, from: string, to: string, payload?: Record<string, unknown>): string {
  return contentFingerprint({ kind, from, to, payload: payload ?? null });
}

export function createNode(input: {
  id: string;
  kind: GraphNodeKind;
  label: string;
  artifactPath?: string;
  provenance?: GraphNode['provenance'];
  payload?: Record<string, unknown>;
}): GraphNode {
  return {
    id: input.id,
    kind: input.kind,
    label: input.label,
    artifactPath: input.artifactPath,
    provenance: input.provenance ?? {},
    payload: input.payload,
    fingerprint: nodeFingerprint(input.kind, input.id, input.payload),
  };
}

export function createEdge(input: {
  kind: GraphEdgeKind;
  from: string;
  to: string;
  provenance?: GraphEdge['provenance'];
  payload?: Record<string, unknown>;
}): GraphEdge {
  const edgeId = `${input.kind}:${input.from}->${input.to}`;
  return {
    id: edgeId,
    kind: input.kind,
    from: input.from,
    to: input.to,
    provenance: input.provenance ?? {},
    payload: input.payload,
    fingerprint: edgeFingerprint(input.kind, input.from, input.to, input.payload),
  };
}

export interface GraphAccumulator {
  readonly nodes: ReadonlyMap<string, GraphNode>;
  readonly edges: ReadonlyMap<string, GraphEdge>;
}

export const EMPTY_GRAPH: GraphAccumulator = { nodes: new Map(), edges: new Map() };

export interface ConditionalEdge {
  readonly edge: GraphEdge;
  readonly requiredNodeIds: readonly string[];
}

export interface PhaseResult {
  readonly accumulator: GraphAccumulator;
  readonly conditionalEdges: readonly ConditionalEdge[];
}

export function mergeAccumulators(a: GraphAccumulator, b: GraphAccumulator): GraphAccumulator {
  return {
    nodes: new Map([...a.nodes, ...b.nodes]),
    edges: new Map([...a.edges, ...b.edges]),
  };
}

export function resolveConditionalEdges(
  allNodes: ReadonlyMap<string, GraphNode>,
  conditionalEdges: readonly ConditionalEdge[],
): ReadonlyMap<string, GraphEdge> {
  return new Map(
    conditionalEdges
      .flatMap((ce) => ce.requiredNodeIds.every((id) => allNodes.has(id)) ? [[ce.edge.id, ce.edge] as const] : []),
  );
}

export function phaseResult(
  items: { readonly nodes?: readonly GraphNode[]; readonly edges?: readonly GraphEdge[] },
  conditionalEdges?: readonly ConditionalEdge[],
): PhaseResult {
  return {
    accumulator: {
      nodes: new Map((items.nodes ?? []).map((n) => [n.id, n] as const)),
      edges: new Map((items.edges ?? []).map((e) => [e.id, e] as const)),
    },
    conditionalEdges: conditionalEdges ?? [],
  };
}

export function conditionalEdge(edge: GraphEdge, ...requiredNodeIds: readonly string[]): ConditionalEdge {
  return { edge, requiredNodeIds };
}

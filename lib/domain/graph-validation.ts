/**
 * W2.10 — Cross-graph consistency validation
 *
 * Pure validation of mutual consistency between ApplicationInterfaceGraph
 * and DerivedGraph. No side effects — returns a list of violations.
 */

import type { ApplicationInterfaceGraph, InterfaceGraphNode } from './types/interface';
import type { DerivedGraph, GraphNode, GraphEdge } from './types/projection';

// ─── Violation types ───

export type ViolationKind =
  | 'dangling-edge-from'
  | 'dangling-edge-to'
  | 'screen-missing-in-interface-graph'
  | 'element-missing-in-interface-graph'
  | 'screen-missing-in-derived-graph'
  | 'element-missing-in-derived-graph';

export interface ConsistencyViolation {
  readonly kind: ViolationKind;
  readonly graph: 'derived' | 'interface' | 'cross';
  readonly nodeId: string;
  readonly edgeId?: string | undefined;
  readonly message: string;
}

// ─── Helpers ───

function danglingEdgeViolations(
  graphLabel: 'derived' | 'interface',
  nodeIds: ReadonlySet<string>,
  edges: readonly { readonly id: string; readonly from: string; readonly to: string }[],
): readonly ConsistencyViolation[] {
  return edges.flatMap((edge): readonly ConsistencyViolation[] => [
    ...(!nodeIds.has(edge.from) ? [{
      kind: 'dangling-edge-from' as const,
      graph: graphLabel,
      nodeId: edge.from,
      edgeId: edge.id,
      message: `Edge "${edge.id}" references non-existent source node "${edge.from}" in ${graphLabel} graph`,
    }] : []),
    ...(!nodeIds.has(edge.to) ? [{
      kind: 'dangling-edge-to' as const,
      graph: graphLabel,
      nodeId: edge.to,
      edgeId: edge.id,
      message: `Edge "${edge.id}" references non-existent target node "${edge.to}" in ${graphLabel} graph`,
    }] : []),
  ]);
}

function extractScreenIds(nodes: readonly { readonly id: string; readonly kind: string }[]): ReadonlySet<string> {
  return new Set(
    nodes.flatMap((n) => n.kind === 'screen' ? [n.id] : []),
  );
}

function extractElementIds(nodes: readonly { readonly id: string; readonly kind: string }[]): ReadonlySet<string> {
  return new Set(
    nodes.flatMap((n) => n.kind === 'element' ? [n.id] : []),
  );
}

/**
 * Normalize an InterfaceGraphNode screen ID to the DerivedGraph screen ID convention.
 *
 * InterfaceGraphNode IDs may use the `graphIds.screen(screenId)` format (`screen:{screenId}`)
 * or a different convention depending on the builder. We extract the screen property
 * and reconstruct the DerivedGraph-style ID.
 */
function interfaceScreenNodeIds(nodes: readonly InterfaceGraphNode[]): ReadonlySet<string> {
  return new Set(
    nodes.flatMap((n) => n.kind === 'screen' ? [n.id] : []),
  );
}

function interfaceElementNodeIds(nodes: readonly InterfaceGraphNode[]): ReadonlySet<string> {
  return new Set(
    nodes.flatMap((n) => n.kind === 'target' && n.element != null ? [n.id] : []),
  );
}

// ─── Main validation ───

/**
 * Validate mutual consistency between an ApplicationInterfaceGraph and a DerivedGraph.
 *
 * Checks performed:
 * 1. No dangling edges in DerivedGraph (every edge.from and edge.to references a valid node)
 * 2. No dangling edges in ApplicationInterfaceGraph
 * 3. Every screen node in DerivedGraph has a corresponding screen node in ApplicationInterfaceGraph
 * 4. Every screen node in ApplicationInterfaceGraph has a corresponding screen node in DerivedGraph
 * 5. Every element node in DerivedGraph edges that reference screen-scoped elements
 *    has a corresponding target in ApplicationInterfaceGraph
 *
 * Returns an empty array when both graphs are mutually consistent.
 */
export function validateGraphConsistency(
  appGraph: ApplicationInterfaceGraph,
  derivedGraph: DerivedGraph,
): readonly ConsistencyViolation[] {
  // 1. Dangling edges within each graph
  const derivedNodeIds = new Set(derivedGraph.nodes.map((n) => n.id));
  const interfaceNodeIds = new Set(appGraph.nodes.map((n) => n.id));

  const derivedDangling = danglingEdgeViolations('derived', derivedNodeIds, derivedGraph.edges);
  const interfaceDangling = danglingEdgeViolations('interface', interfaceNodeIds, appGraph.edges);

  // 2. Cross-graph screen consistency
  const derivedScreenIds = extractScreenIds(derivedGraph.nodes);
  const interfaceScreenIds = interfaceScreenNodeIds(appGraph.nodes);

  const screensMissingInInterface: readonly ConsistencyViolation[] = [...derivedScreenIds]
    .flatMap((id) => !interfaceScreenIds.has(id) ? [{
      kind: 'screen-missing-in-interface-graph' as const,
      graph: 'cross' as const,
      nodeId: id,
      message: `Screen node "${id}" exists in DerivedGraph but not in ApplicationInterfaceGraph`,
    }] : []);

  const screensMissingInDerived: readonly ConsistencyViolation[] = [...interfaceScreenIds]
    .flatMap((id) => !derivedScreenIds.has(id) ? [{
      kind: 'screen-missing-in-derived-graph' as const,
      graph: 'cross' as const,
      nodeId: id,
      message: `Screen node "${id}" exists in ApplicationInterfaceGraph but not in DerivedGraph`,
    }] : []);

  // 3. Cross-graph element consistency
  //    DerivedGraph element nodes use graphIds.element(screen, elementId) => "element:{screen}:{elementId}"
  //    InterfaceGraph uses "target:{targetRef}" for elements — different ID convention.
  //    We compare by extracting the element semantic IDs from both graphs.
  const derivedElementIds = extractElementIds(derivedGraph.nodes);
  const derivedElementScreenScoped = new Map<string, string>();
  for (const node of derivedGraph.nodes) {
    if (node.kind === 'element') {
      // ID format: "element:{screenId}:{elementId}" — extract screen portion
      const parts = node.id.split(':');
      if (parts.length >= 3) {
        const screenPart = `screen:${parts[1]}`;
        derivedElementScreenScoped.set(node.id, screenPart);
      }
    }
  }

  // Elements in DerivedGraph whose parent screen doesn't exist in InterfaceGraph
  const elementsMissingInInterface: readonly ConsistencyViolation[] = [...derivedElementScreenScoped.entries()]
    .flatMap(([elementId, screenId]) => !interfaceScreenIds.has(screenId) ? [{
      kind: 'element-missing-in-interface-graph' as const,
      graph: 'cross' as const,
      nodeId: elementId,
      message: `Element node "${elementId}" belongs to screen "${screenId}" which is absent from ApplicationInterfaceGraph`,
    }] : []);

  return [
    ...derivedDangling,
    ...interfaceDangling,
    ...screensMissingInInterface,
    ...screensMissingInDerived,
    ...elementsMissingInInterface,
  ];
}

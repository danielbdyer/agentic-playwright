/**
 * Causal chain types for the one-click "Why" operator experience (N2.1).
 *
 * A CausalChain is a directed graph of CausalNodes connected by CausalEdges
 * that explains the root cause of a failure, event, or proposal. Built from
 * resolution reason chains and execution receipts by the pure builder in
 * `lib/domain/causal-chain.ts`.
 */

export interface CausalNode {
  readonly id: string;
  readonly kind: 'trigger' | 'condition' | 'action' | 'outcome';
  readonly label: string;
  readonly detail: string | null;
  readonly stepIndex: number | null;
  readonly rung: string | null;
}

export interface CausalEdge {
  readonly from: string;
  readonly to: string;
  readonly relation: 'caused-by' | 'blocked-by' | 'degraded-to' | 'resolved-by';
}

export interface CausalChain {
  readonly kind: 'causal-chain';
  readonly version: 1;
  readonly rootNodeId: string;
  readonly nodes: readonly CausalNode[];
  readonly edges: readonly CausalEdge[];
  readonly summary: string;
  readonly rootCause: string;
  readonly timeToRootCauseMs: number | null;
}

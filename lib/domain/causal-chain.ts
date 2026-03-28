/**
 * Pure builder for causal chains (N2.1 — One-Click "Why").
 *
 * Transforms resolution reason chains, execution failure metadata, console
 * errors, and precondition failures into a directed CausalChain graph that
 * operators can inspect to understand root cause at a glance.
 */

import type { CausalChain, CausalEdge, CausalNode } from './types/causal-chain';
import type { ResolutionReasonChain } from './types/resolution';

// ─── Input ───

export interface CausalChainInput {
  readonly stepIndex: number;
  readonly actionText: string;
  readonly failureFamily: string;
  readonly failureCode: string | null;
  readonly failureMessage: string | null;
  readonly reasonChain: ResolutionReasonChain | null;
  readonly consoleErrors: readonly string[];
  readonly preconditionFailures: readonly string[];
}

// ─── Node ID factory ───

const nodeId = (stepIndex: number, kind: CausalNode['kind'], index: number): string =>
  `causal-${stepIndex}-${kind}-${index}`;

// ─── Outcome node (always present) ───

const buildOutcomeNode = (input: CausalChainInput): CausalNode => ({
  id: nodeId(input.stepIndex, 'outcome', 0),
  kind: 'outcome',
  label: `Step ${input.stepIndex} failed: ${input.failureFamily}`,
  detail: input.failureMessage ?? input.failureCode ?? null,
  stepIndex: input.stepIndex,
  rung: null,
});

// ─── Reason chain → action nodes + edges ───

const buildReasonChainNodes = (
  input: CausalChainInput,
): { readonly nodes: readonly CausalNode[]; readonly edges: readonly CausalEdge[] } => {
  const chain = input.reasonChain;
  if (!chain || chain.length === 0) {
    return { nodes: [], edges: [] };
  }

  const nodes: readonly CausalNode[] = chain.map((step, i) => ({
    id: nodeId(input.stepIndex, 'action', i),
    kind: 'action' as const,
    label: `Rung "${step.rung}" ${step.verdict}`,
    detail: step.reason,
    stepIndex: input.stepIndex,
    rung: step.rung,
  }));

  const outcomeId = nodeId(input.stepIndex, 'outcome', 0);

  // Connect consecutive rung nodes, and connect the last one to the outcome.
  const interEdges: readonly CausalEdge[] = nodes.slice(1).map((node, i) => ({
    from: nodes[i]!.id,
    to: node.id,
    relation: chain[i + 1]!.verdict === 'failed' ? ('degraded-to' as const) : ('resolved-by' as const),
  }));

  const lastNode = nodes[nodes.length - 1]!;
  const lastStep = chain[chain.length - 1]!;
  const tailEdge: CausalEdge = {
    from: lastNode.id,
    to: outcomeId,
    relation: lastStep.verdict === 'resolved' ? 'resolved-by' : 'caused-by',
  };

  return {
    nodes,
    edges: [...interEdges, tailEdge],
  };
};

// ─── Precondition failures → condition nodes + blocked-by edges ───

const buildPreconditionNodes = (
  input: CausalChainInput,
): { readonly nodes: readonly CausalNode[]; readonly edges: readonly CausalEdge[] } => {
  const outcomeId = nodeId(input.stepIndex, 'outcome', 0);

  const nodes: readonly CausalNode[] = input.preconditionFailures.map((msg, i) => ({
    id: nodeId(input.stepIndex, 'condition', i),
    kind: 'condition' as const,
    label: `Precondition failed`,
    detail: msg,
    stepIndex: input.stepIndex,
    rung: null,
  }));

  const edges: readonly CausalEdge[] = nodes.map((node) => ({
    from: node.id,
    to: outcomeId,
    relation: 'blocked-by' as const,
  }));

  return { nodes, edges };
};

// ─── Console errors → trigger nodes + caused-by edges ───

const buildConsoleErrorNodes = (
  input: CausalChainInput,
): { readonly nodes: readonly CausalNode[]; readonly edges: readonly CausalEdge[] } => {
  const outcomeId = nodeId(input.stepIndex, 'outcome', 0);

  const nodes: readonly CausalNode[] = input.consoleErrors.map((msg, i) => ({
    id: nodeId(input.stepIndex, 'trigger', i),
    kind: 'trigger' as const,
    label: `Console error`,
    detail: msg,
    stepIndex: input.stepIndex,
    rung: null,
  }));

  const edges: readonly CausalEdge[] = nodes.map((node) => ({
    from: node.id,
    to: outcomeId,
    relation: 'caused-by' as const,
  }));

  return { nodes, edges };
};

// ─── Root cause identification ───

const findRootCause = (nodes: readonly CausalNode[], input: CausalChainInput): string => {
  // Prefer the first trigger node (console error), then first condition (precondition),
  // then deepest action node, finally fall back to outcome.
  const firstTrigger = nodes.find((n) => n.kind === 'trigger');
  if (firstTrigger) return firstTrigger.detail ?? firstTrigger.label;

  const firstCondition = nodes.find((n) => n.kind === 'condition');
  if (firstCondition) return firstCondition.detail ?? firstCondition.label;

  // For action nodes, pick the first failed rung
  const failedAction = nodes.find(
    (n) => n.kind === 'action' && n.label.includes('failed'),
  );
  if (failedAction) return failedAction.detail ?? failedAction.label;

  return input.failureMessage ?? input.failureFamily;
};

const findRootNodeId = (nodes: readonly CausalNode[]): string => {
  const firstTrigger = nodes.find((n) => n.kind === 'trigger');
  if (firstTrigger) return firstTrigger.id;

  const firstCondition = nodes.find((n) => n.kind === 'condition');
  if (firstCondition) return firstCondition.id;

  const firstAction = nodes.find((n) => n.kind === 'action');
  if (firstAction) return firstAction.id;

  return nodes[0]!.id;
};

// ─── Public API ───

export const buildCausalChain = (input: CausalChainInput): CausalChain => {
  const outcomeNode = buildOutcomeNode(input);
  const reasonResult = buildReasonChainNodes(input);
  const preconditionResult = buildPreconditionNodes(input);
  const consoleResult = buildConsoleErrorNodes(input);

  const allNodes: readonly CausalNode[] = [
    outcomeNode,
    ...reasonResult.nodes,
    ...preconditionResult.nodes,
    ...consoleResult.nodes,
  ];

  const allEdges: readonly CausalEdge[] = [
    ...reasonResult.edges,
    ...preconditionResult.edges,
    ...consoleResult.edges,
  ];

  const rootCause = findRootCause(allNodes, input);
  const rootNodeId = findRootNodeId(allNodes);

  return {
    kind: 'causal-chain',
    version: 1,
    rootNodeId,
    nodes: allNodes,
    edges: allEdges,
    summary: summarizeCausalChain_internal(input, allNodes),
    rootCause,
    timeToRootCauseMs: null,
  };
};

const summarizeCausalChain_internal = (
  input: CausalChainInput,
  nodes: readonly CausalNode[],
): string => {
  const triggerCount = nodes.filter((n) => n.kind === 'trigger').length;
  const conditionCount = nodes.filter((n) => n.kind === 'condition').length;
  const actionCount = nodes.filter((n) => n.kind === 'action').length;

  const parts: readonly string[] = [
    `Step ${input.stepIndex} "${input.actionText}" failed (${input.failureFamily})`,
    ...(triggerCount > 0 ? [`${triggerCount} console error(s)`] : []),
    ...(conditionCount > 0 ? [`${conditionCount} precondition failure(s)`] : []),
    ...(actionCount > 0 ? [`${actionCount} resolution rung(s) traversed`] : []),
  ];

  return parts.join('; ') || `Step ${input.stepIndex} failed`;
};

export const summarizeCausalChain = (chain: CausalChain): string => chain.summary;

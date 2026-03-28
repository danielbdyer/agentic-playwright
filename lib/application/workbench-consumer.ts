/**
 * W3.16: Agent Workbench Consumer — scored work-item queue as consumable surface.
 *
 * Pure functions for scoring, ranking, and consuming work items from the
 * agent workbench. An agent (Claude Code, VSCode Copilot, MCP tool) declares
 * its capabilities and receives the highest-priority item it can handle.
 *
 * The design follows the intervention spine: each consumed item leads to
 * an InterventionReceipt that feeds back into the next iteration.
 */

import type { AgentWorkItem, WorkItemKind, WorkItemActionKind } from '../domain/types/workbench';

// ─── Agent Capabilities ───

/** What an agent can do. Used to filter work items to those the agent can act on. */
export interface AgentCapabilities {
  /** Work item kinds this agent can handle. */
  readonly supportedKinds: ReadonlySet<WorkItemKind>;
  /** Action kinds this agent can perform. */
  readonly supportedActions: ReadonlySet<WorkItemActionKind>;
  /** Maximum priority the agent should receive (0 = no limit). */
  readonly maxPriority: number;
  /** Minimum confidence threshold — only items with evidence.confidence >= this value. */
  readonly minConfidence: number;
}

/** Default capabilities: an agent that can handle everything. */
export const DEFAULT_CAPABILITIES: AgentCapabilities = {
  supportedKinds: new Set<WorkItemKind>([
    'interpret-step',
    'approve-proposal',
    'author-knowledge',
    'investigate-hotspot',
    'validate-calibration',
    'request-rerun',
  ]),
  supportedActions: new Set<WorkItemActionKind>([
    'approve', 'reject', 'inspect', 'author', 'rerun', 'skip',
  ]),
  maxPriority: 0,
  minConfidence: 0,
};

// ─── Consumption Path ───

/** Describes how a work item was selected for consumption. */
export interface WorkbenchConsumptionPath {
  readonly kind: 'workbench-consumption';
  /** The selected work item, or null if none matched. */
  readonly item: AgentWorkItem | null;
  /** Number of items considered before selection. */
  readonly consideredCount: number;
  /** Number of items filtered out by capability mismatch. */
  readonly filteredCount: number;
  /** The score that determined ranking (for the selected item). */
  readonly score: number | null;
  /** Reason the item was selected (or why nothing was selected). */
  readonly reason: string;
}

// ─── Scoring ───

/** Score weights for work item ranking. Pure data, no behavior. */
export interface ScoreWeights {
  readonly priorityWeight: number;
  readonly confidenceWeight: number;
  readonly actionCountWeight: number;
  readonly linkedProposalWeight: number;
}

/** Default scoring weights. */
export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  priorityWeight: 1.0,
  confidenceWeight: 0.3,
  actionCountWeight: 0.1,
  linkedProposalWeight: 0.2,
};

/**
 * O(1). Compute a composite score for a work item.
 * Higher score = higher priority for consumption.
 *
 * Score = priority * priorityWeight
 *       + evidence.confidence * confidenceWeight
 *       + actionCount * actionCountWeight
 *       + linkedProposalCount * linkedProposalWeight
 */
export function scoreWorkItem(
  item: AgentWorkItem,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): number {
  return (
    item.priority * weights.priorityWeight
    + item.evidence.confidence * weights.confidenceWeight
    + item.actions.length * weights.actionCountWeight
    + item.linkedProposals.length * weights.linkedProposalWeight
  );
}

// ─── Filtering ───

/**
 * O(1). Check whether an agent can handle a given work item.
 */
export function canHandle(
  item: AgentWorkItem,
  capabilities: AgentCapabilities,
): boolean {
  // Kind must be supported
  if (!capabilities.supportedKinds.has(item.kind)) return false;

  // At least one action must be performable
  const hasAction = item.actions.some((a) => capabilities.supportedActions.has(a.kind));
  if (!hasAction) return false;

  // Priority ceiling (0 = no limit)
  if (capabilities.maxPriority > 0 && item.priority > capabilities.maxPriority) return false;

  // Confidence floor
  if (item.evidence.confidence < capabilities.minConfidence) return false;

  return true;
}

// ─── Ranking ───

/**
 * O(n log n). Score and rank work items by composite score descending.
 * Pure function — returns a new sorted array without mutating the input.
 */
export function scoreAndRank(
  items: readonly AgentWorkItem[],
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): readonly AgentWorkItem[] {
  const scored: readonly (readonly [AgentWorkItem, number])[] = items.map(
    (item) => [item, scoreWorkItem(item, weights)] as const,
  );
  return [...scored]
    .sort(([, a], [, b]) => b - a)
    .map(([item]) => item);
}

// ─── Consumption ───

/**
 * O(n log n). Select the next work item for an agent to consume.
 *
 * 1. Filter items by agent capabilities
 * 2. Score and rank remaining items
 * 3. Return the top-ranked item with consumption metadata
 *
 * Returns a WorkbenchConsumptionPath with the selected item (or null).
 */
export function consumeNextWorkItem(
  queue: readonly AgentWorkItem[],
  agentCapabilities: AgentCapabilities = DEFAULT_CAPABILITIES,
  weights: ScoreWeights = DEFAULT_SCORE_WEIGHTS,
): WorkbenchConsumptionPath {
  const eligible = queue.filter((item) => canHandle(item, agentCapabilities));
  const filteredCount = queue.length - eligible.length;

  if (eligible.length === 0) {
    return {
      kind: 'workbench-consumption',
      item: null,
      consideredCount: queue.length,
      filteredCount,
      score: null,
      reason: queue.length === 0
        ? 'queue-empty'
        : 'no-eligible-items',
    };
  }

  const ranked = scoreAndRank(eligible, weights);
  const selected = ranked[0]!;
  const selectedScore = scoreWorkItem(selected, weights);

  return {
    kind: 'workbench-consumption',
    item: selected,
    consideredCount: queue.length,
    filteredCount,
    score: selectedScore,
    reason: 'selected-by-score',
  };
}

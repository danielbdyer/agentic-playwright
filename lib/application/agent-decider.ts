/**
 * Agent Decider — routes work item decisions to an external AI agent via MCP tools.
 *
 * When the Effect fiber pauses for a decision, the agent decider invokes the
 * outer agent's MCP tool interface and returns the decision. The fiber resumes.
 *
 * This is the structured counterpart of the dashboard's approve/skip buttons:
 *   Human clicks button → WS message → fiber resumes
 *   Agent invokes MCP tool → tool result → fiber resumes
 *
 * Same mechanism. Different input source.
 */

import type { AgentWorkItem } from '../domain/types';
import type { WorkItemDecider } from './agent-workbench';

// ─── Types ───

export interface AgentDeciderOptions {
  /** MCP tool invocation — the connection to the outer agent.
   *  The agent receives work item context and returns a decision. */
  readonly invokeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Filter: which items should the agent handle? Rejected items fall through. */
  readonly shouldHandle?: (item: AgentWorkItem) => boolean;
  /** Timeout for agent response in milliseconds. Default: 30s. */
  readonly timeoutMs?: number;
}

export interface DualModeDeciderOptions {
  /** Primary: human decider (WS-backed, pauses for click). */
  readonly humanDecider: WorkItemDecider;
  /** Secondary: agent decider (MCP-backed, invokes tool). */
  readonly agentDecider: WorkItemDecider;
  /** Route: should this item be escalated to the human? Default: confidence < 0.5. */
  readonly shouldEscalate?: (item: AgentWorkItem) => boolean;
}

// ─── Pure Heuristics ───

/** Default escalation heuristic: escalate low-confidence and blocking items. Pure. */
export const defaultEscalationHeuristic = (item: AgentWorkItem): boolean => {
  // Low confidence → always escalate to human
  if (item.evidence.confidence < 0.4) return true;
  // Step interpretation is blocking → human judgment needed
  if (item.kind === 'interpret-step') return true;
  // Hotspots with thin evidence → human should investigate
  if (item.kind === 'investigate-hotspot' && item.evidence.sources.length < 2) return true;
  // High confidence → agent can handle
  if (item.evidence.confidence >= 0.8) return false;
  // Default: agent handles
  return false;
};

// ─── Agent Decider Factory ───

/** Create a WorkItemDecider backed by an external AI agent's MCP tools.
 *  Pure factory: options → decider. */
export function createAgentDecider(options: AgentDeciderOptions): WorkItemDecider {
  const timeoutMs = options.timeoutMs ?? 30000;

  return async (item) => {
    // Filter check: if the agent shouldn't handle this, skip
    if (options.shouldHandle && !options.shouldHandle(item)) {
      return { status: 'skipped', rationale: 'Agent filter: item not in scope' };
    }

    try {
      // Race between agent decision and timeout
      const result = await Promise.race([
        options.invokeTool('decide_work_item', {
          workItemId: item.id,
          kind: item.kind,
          title: item.title,
          rationale: item.rationale,
          priority: item.priority,
          confidence: item.evidence.confidence,
          sources: item.evidence.sources,
          screen: item.context.screen ?? null,
          element: item.context.element ?? null,
          actions: item.actions.map((a) => a.kind),
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('agent-timeout')), timeoutMs),
        ),
      ]);

      // Parse agent response
      const parsed = result as { status?: string; rationale?: string } | null;
      return {
        status: (parsed?.status === 'completed' ? 'completed' : 'skipped') as 'completed' | 'skipped',
        rationale: parsed?.rationale ?? 'Agent decision (no rationale)',
      };
    } catch (err) {
      return {
        status: 'skipped' as const,
        rationale: `Agent error: ${err instanceof Error ? err.message : 'unknown'}`,
      };
    }
  };
}

// ─── Dual-Mode Decider Factory ───

/** Create a WorkItemDecider that routes between human and agent based on heuristics.
 *
 *  Priority: human > agent > timeout.
 *  The agent handles the 80% routine cases (high confidence, known patterns).
 *  The human handles the 20% ambiguous cases (low confidence, novel screens).
 *
 *  Pure factory: options → decider. */
export function createDualModeDecider(options: DualModeDeciderOptions): WorkItemDecider {
  const shouldEscalate = options.shouldEscalate ?? defaultEscalationHeuristic;

  return async (item) => {
    if (shouldEscalate(item)) {
      // Escalate to human — fiber pauses until human clicks
      return options.humanDecider(item);
    }

    // Try agent first
    const agentResult = await options.agentDecider(item);

    // If agent returned null, errored, or explicitly filtered — fall back to human
    if (!agentResult || agentResult.rationale.startsWith('Agent error:') || agentResult.rationale.startsWith('Agent filter:')) {
      return options.humanDecider(item);
    }

    return agentResult;
  };
}

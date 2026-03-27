/**
 * Agent Decider — routes work item decisions to an external AI agent via MCP tools.
 *
 * When the Effect fiber pauses for a decision, the agent decider invokes the
 * outer agent's MCP tool interface and returns the decision. The fiber resumes.
 *
 * Uses Effect.race for timeout instead of Promise.race — proper fiber
 * interruption semantics and no leaked timers.
 */

import { Effect, Duration } from 'effect';
import type { AgentWorkItem } from '../domain/types';
import type { WorkItemDecider } from './agent-workbench';

// ─── Types ───

export interface AgentDeciderOptions {
  /** MCP tool invocation — the connection to the outer agent. */
  readonly invokeTool: (toolName: string, args: Record<string, unknown>) => Promise<unknown>;
  /** Filter: which items should the agent handle? Rejected items fall through. */
  readonly shouldHandle?: (item: AgentWorkItem) => boolean;
  /** Timeout for agent response. Default: 30 seconds. */
  readonly timeout?: Duration.DurationInput;
}

export interface DualModeDeciderOptions {
  /** Primary: human decider (WS-backed, pauses for click). */
  readonly humanDecider: WorkItemDecider;
  /** Secondary: agent decider (MCP-backed, invokes tool). */
  readonly agentDecider: WorkItemDecider;
  /** Route: should this item be escalated to the human? */
  readonly shouldEscalate?: (item: AgentWorkItem) => boolean;
}

// ─── Pure Heuristics ───

/** Default escalation heuristic: escalate low-confidence and blocking items. Pure. */
export const defaultEscalationHeuristic = (item: AgentWorkItem): boolean =>
  item.evidence.confidence < 0.4
  || item.kind === 'interpret-step'
  || (item.kind === 'investigate-hotspot' && item.evidence.sources.length < 2);

// ─── Pure: extract MCP tool arguments from a work item ───

const workItemToToolArgs = (item: AgentWorkItem): Record<string, unknown> => ({
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
});

// ─── Pure: parse agent response into a decision ───

const parseAgentResponse = (result: unknown): { readonly status: 'completed' | 'skipped'; readonly rationale: string } => {
  const parsed = result as { status?: string; rationale?: string } | null;
  return {
    status: parsed?.status === 'completed' ? 'completed' : 'skipped',
    rationale: parsed?.rationale ?? 'Agent decision (no rationale)',
  };
};

// ─── Agent Decider Factory ───

/** Create a WorkItemDecider backed by an external AI agent's MCP tools.
 *  Uses Effect.timeout for clean fiber interruption — no leaked timers. */
export function createAgentDecider(options: AgentDeciderOptions): WorkItemDecider {
  const timeout = options.timeout ?? Duration.seconds(30);

  return async (item) => {
    if (options.shouldHandle && !options.shouldHandle(item)) {
      return { status: 'skipped', rationale: 'Agent filter: item not in scope' };
    }

    // Effect program: invoke tool with timeout, catch all errors
    const program = Effect.tryPromise({
      try: () => options.invokeTool('decide_work_item', workItemToToolArgs(item)),
      catch: (err) => err instanceof Error ? err : new Error(String(err)),
    }).pipe(
      Effect.map(parseAgentResponse),
      Effect.timeout(timeout),
      Effect.map((opt) => opt ?? { status: 'skipped' as const, rationale: `Agent timeout (${Duration.toMillis(timeout)}ms)` }),
      Effect.catchAll((err) => Effect.succeed({
        status: 'skipped' as const,
        rationale: `Agent error: ${err instanceof Error ? err.message : String(err)}`,
      })),
    );

    return Effect.runPromise(program);
  };
}

// ─── Dual-Mode Decider Factory ───

/** Routes between human and agent based on heuristics.
 *  Agent handles the 80% routine cases, human handles ambiguous 20%. */
export function createDualModeDecider(options: DualModeDeciderOptions): WorkItemDecider {
  const shouldEscalate = options.shouldEscalate ?? defaultEscalationHeuristic;

  return async (item) => {
    if (shouldEscalate(item)) return options.humanDecider(item);

    const agentResult = await options.agentDecider(item);

    // Fall back to human if agent declined or errored
    return (!agentResult || agentResult.rationale.startsWith('Agent error:') || agentResult.rationale.startsWith('Agent filter:'))
      ? options.humanDecider(item)
      : agentResult;
  };
}

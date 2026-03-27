/**
 * Dashboard MCP Server — structured tool access to Tesseract observables.
 *
 * Implements McpServerPort with handlers for all dashboard MCP tools.
 * Each tool reads from existing `.tesseract/` artifacts or routes through
 * the pending decisions Map — the same mechanism the WS adapter uses.
 *
 * This is the agent's structured projection of the spatial dashboard:
 *   Visual (human)     → SelectorGlows, ParticleTransport, FitnessCard
 *   Structured (agent)  → list_probed_elements, get_knowledge_state, get_fitness_metrics
 *
 * Same data. Different projection. Non-breaking progressive enhancement.
 */

import { Effect } from 'effect';
import type { McpServerPort, McpToolInvocation, McpToolResult } from '../../application/ports';
import type { McpToolDefinition, WorkItemDecision, ScreenCapturedEvent } from '../../domain/types';
import { dashboardMcpTools, dashboardEvent } from '../../domain/types/dashboard';
import type { TesseractError } from '../../domain/errors';

// ─── Configuration ───

export interface DashboardMcpServerOptions {
  /** Read a JSON artifact from the .tesseract/ directory. Returns null if not found. */
  readonly readArtifact: (relativePath: string) => unknown | null;
  /** In-memory cache of the latest screenshot. */
  readonly screenshotCache: { readonly get: () => ScreenCapturedEvent | null };
  /** Pending decisions Map — shared with the WS adapter. Resolving resumes the fiber. */
  readonly pendingDecisions: ReadonlyMap<string, (decision: WorkItemDecision) => void>;
  /** Broadcast an event to all connected WS clients. */
  readonly broadcast: (event: unknown) => void;
}

// ─── Pure Tool Handlers ───
// Each handler is a pure function: (args, options) → result.
// No side effects except reading artifacts and resolving pending decisions.

type ToolHandler = (
  args: Record<string, unknown>,
  options: DashboardMcpServerOptions,
) => unknown;

const listProbedElements: ToolHandler = (args, options) => {
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly { readonly id: string; readonly context: Record<string, unknown>; readonly evidence: Record<string, unknown> }[];
  } | null;
  if (!workbench?.items) return { elements: [], count: 0 };

  const screenFilter = args.screen as string | undefined;
  const elements = workbench.items
    .filter((item) => !screenFilter || item.context?.screen === screenFilter)
    .map((item) => ({
      id: item.id,
      element: item.context?.element ?? null,
      screen: item.context?.screen ?? null,
      confidence: (item.evidence as { confidence?: number })?.confidence ?? 0,
      sources: (item.evidence as { sources?: readonly string[] })?.sources ?? [],
    }));

  return { elements, count: elements.length };
};

const getScreenCapture: ToolHandler = (_args, options) => {
  const cached = options.screenshotCache.get();
  return cached ?? { error: 'No screenshot available yet', available: false };
};

const getKnowledgeState: ToolHandler = (args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
    readonly edges?: readonly Record<string, unknown>[];
  } | null;
  if (!graph) return { screens: [], totalNodes: 0 };

  const screenFilter = args.screen as string | undefined;
  const nodes = graph.nodes ?? [];
  const filtered = screenFilter
    ? nodes.filter((n) => (n.id as string)?.includes(screenFilter))
    : nodes;

  return {
    nodes: filtered.slice(0, 100),
    totalNodes: filtered.length,
    totalEdges: (graph.edges ?? []).length,
  };
};

const getQueueItems: ToolHandler = (args, options) => {
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly Record<string, unknown>[];
    readonly summary?: Record<string, unknown>;
  } | null;
  if (!workbench?.items) return { items: [], count: 0 };

  const statusFilter = (args.status as string) ?? 'all';
  const items = statusFilter === 'all'
    ? workbench.items
    : workbench.items.filter((item) => {
        const completions = options.readArtifact('.tesseract/workbench/completions.json') as {
          readonly completions?: readonly { readonly workItemId: string }[];
        } | null;
        const completedIds = new Set((completions?.completions ?? []).map((c) => c.workItemId));
        return statusFilter === 'pending'
          ? !completedIds.has(item.id as string)
          : completedIds.has(item.id as string);
      });

  return { items, count: items.length, summary: workbench.summary ?? null };
};

const getFitnessMetrics: ToolHandler = (_args, options) => {
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
  } | null;
  return scorecard?.highWaterMark ?? { error: 'No scorecard available yet' };
};

const approveWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const resolver = (options.pendingDecisions as Map<string, (d: WorkItemDecision) => void>).get(workItemId);
  if (!resolver) return { error: `No pending decision for ${workItemId}`, isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'completed',
    rationale: (args.rationale as string) ?? 'Approved via MCP tool',
  };
  (options.pendingDecisions as Map<string, (d: WorkItemDecision) => void>).delete(workItemId);
  resolver(decision);
  options.broadcast(dashboardEvent('item-completed', decision));
  return { ok: true, workItemId, status: 'completed' };
};

const skipWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const resolver = (options.pendingDecisions as Map<string, (d: WorkItemDecision) => void>).get(workItemId);
  if (!resolver) return { error: `No pending decision for ${workItemId}`, isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'skipped',
    rationale: (args.rationale as string) ?? 'Skipped via MCP tool',
  };
  (options.pendingDecisions as Map<string, (d: WorkItemDecision) => void>).delete(workItemId);
  resolver(decision);
  options.broadcast(dashboardEvent('item-completed', decision));
  return { ok: true, workItemId, status: 'skipped' };
};

const getIterationStatus: ToolHandler = (_args, options) => {
  const progressFile = options.readArtifact('.tesseract/runs/speedrun-progress.jsonl');
  if (!progressFile || typeof progressFile !== 'string') {
    return { error: 'No progress data available', phase: 'idle' };
  }
  const lines = progressFile.trim().split('\n');
  const lastLine = lines[lines.length - 1];
  try { return JSON.parse(lastLine!); }
  catch { return { error: 'Could not parse progress data', phase: 'unknown' }; }
};

// ─── Tool Router (pure dispatch) ───

const toolHandlers: Readonly<Record<string, ToolHandler>> = {
  'list_probed_elements': listProbedElements,
  'get_screen_capture': getScreenCapture,
  'get_knowledge_state': getKnowledgeState,
  'get_queue_items': getQueueItems,
  'get_fitness_metrics': getFitnessMetrics,
  'approve_work_item': approveWorkItem,
  'skip_work_item': skipWorkItem,
  'get_iteration_status': getIterationStatus,
};

const routeToolCall = (
  invocation: McpToolInvocation,
  options: DashboardMcpServerOptions,
): McpToolResult => {
  const handler = toolHandlers[invocation.tool];
  if (!handler) {
    return { tool: invocation.tool, result: { error: `Unknown tool: ${invocation.tool}` }, isError: true };
  }
  try {
    const result = handler(invocation.arguments, options);
    return { tool: invocation.tool, result, isError: false };
  } catch (err) {
    return { tool: invocation.tool, result: { error: String(err) }, isError: true };
  }
};

// ─── McpServerPort Implementation ───

export function createDashboardMcpServer(options: DashboardMcpServerOptions): McpServerPort {
  return {
    listTools: () => Effect.succeed(dashboardMcpTools as readonly McpToolDefinition[]),

    handleToolCall: (invocation: McpToolInvocation) =>
      Effect.sync(() => routeToolCall(invocation, options)),
  };
}

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
import type { McpServerPort, McpToolInvocation, McpToolResult } from '../../application/ports/observation-ports';
import type { McpToolDefinition, WorkItemDecision, ScreenCapturedEvent } from '../../domain/types';
import { dashboardMcpTools, dashboardEvent } from '../../domain/types/intervention-context';
import { resolveResource, buildResourceUri } from './resource-provider';
import type { ResourceArtifactReader } from './resource-provider';
import type { PlaywrightBridgePort, BrowserAction } from './playwright-mcp-bridge';
import { RETRY_POLICIES, formatRetryMetadata, retryMetadata, retryScheduleForTaggedErrors } from '../../application/resilience/schedules';

// ─── Configuration ───

/** Default page size for paginated list responses. */
const DEFAULT_PAGE_SIZE = 100;
/** Maximum page size allowed. */
const MAX_PAGE_SIZE = 500;

function paginationArgs(args: Record<string, unknown>): { offset: number; limit: number } {
  const offset = Math.max(0, Number(args.offset) || 0);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, Number(args.limit) || DEFAULT_PAGE_SIZE));
  return { offset, limit };
}

function paginate<T>(items: readonly T[], args: Record<string, unknown>): { items: readonly T[]; total: number; offset: number; limit: number; hasMore: boolean } {
  const { offset, limit } = paginationArgs(args);
  const page = items.slice(offset, offset + limit);
  return { items: page, total: items.length, offset, limit, hasMore: offset + limit < items.length };
}

export interface DashboardMcpServerOptions {
  /** Read a JSON artifact from the .tesseract/ directory. Returns null if not found. */
  readonly readArtifact: (relativePath: string) => unknown | null;
  /** In-memory cache of the latest screenshot. */
  readonly screenshotCache: { readonly get: () => ScreenCapturedEvent | null };
  /** Pending decisions Map — shared with the WS adapter. Resolving resumes the fiber. */
  readonly pendingDecisions: ReadonlyMap<string, (decision: WorkItemDecision) => void>;
  /** Broadcast an event to all connected WS clients. */
  readonly broadcast: (event: unknown) => void;
  /** Optional Playwright bridge for live browser interaction (headed mode). */
  readonly playwrightBridge?: PlaywrightBridgePort;
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

  const page = paginate(elements, args);
  return { elements: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
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

  const page = paginate(filtered, args);
  return {
    nodes: page.items,
    totalNodes: page.total,
    totalEdges: (graph.edges ?? []).length,
    offset: page.offset,
    limit: page.limit,
    hasMore: page.hasMore,
  };
};

const getQueueItems: ToolHandler = (args, options) => {
  const workbench = options.readArtifact('.tesseract/workbench/index.json') as {
    readonly items?: readonly Record<string, unknown>[];
    readonly summary?: Record<string, unknown>;
  } | null;
  if (!workbench?.items) return { items: [], count: 0 };

  const statusFilter = (args.status as string) ?? 'all';
  let items: readonly Record<string, unknown>[];
  if (statusFilter === 'all') {
    items = workbench.items;
  } else {
    // Read completions ONCE outside the filter loop (was O(N) artifact reads)
    const completions = options.readArtifact('.tesseract/workbench/completions.json') as {
      readonly completions?: readonly { readonly workItemId: string }[];
    } | null;
    const completedIds = new Set((completions?.completions ?? []).map((c) => c.workItemId));
    items = workbench.items.filter((item) =>
      statusFilter === 'pending'
        ? !completedIds.has(item.id as string)
        : completedIds.has(item.id as string),
    );
  }

  const page = paginate(items, args);
  return { items: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore, summary: workbench.summary ?? null };
};

const getFitnessMetrics: ToolHandler = (_args, options) => {
  const scorecard = options.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly highWaterMark?: Record<string, unknown>;
  } | null;
  return scorecard?.highWaterMark ?? { error: 'No scorecard available yet' };
};

/**
 * Atomically claim a pending decision resolver: get + delete in one step.
 * Prevents race conditions when two agents approve/skip the same item concurrently.
 */
function claimResolver(pendingDecisions: ReadonlyMap<string, (d: WorkItemDecision) => void>, workItemId: string): ((d: WorkItemDecision) => void) | null {
  const map = pendingDecisions as Map<string, (d: WorkItemDecision) => void>;
  const resolver = map.get(workItemId);
  if (!resolver) return null;
  map.delete(workItemId);
  return resolver;
}

const approveWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const resolver = claimResolver(options.pendingDecisions, workItemId);
  if (!resolver) return { error: `No pending decision for ${workItemId}`, isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'completed',
    rationale: (args.rationale as string) ?? 'Approved via MCP tool',
  };
  resolver(decision);
  options.broadcast(dashboardEvent('item-completed', decision));
  return { ok: true, workItemId, status: 'completed' };
};

const skipWorkItem: ToolHandler = (args, options) => {
  const workItemId = args.workItemId as string;
  if (!workItemId) return { error: 'workItemId is required', isError: true };

  const resolver = claimResolver(options.pendingDecisions, workItemId);
  if (!resolver) return { error: `No pending decision for ${workItemId}`, isError: true };

  const decision: WorkItemDecision = {
    workItemId,
    status: 'skipped',
    rationale: (args.rationale as string) ?? 'Skipped via MCP tool',
  };
  resolver(decision);
  options.broadcast(dashboardEvent('item-completed', decision));
  return { ok: true, workItemId, status: 'skipped' };
};

const getIterationStatus: ToolHandler = (_args, options) => {
  const progressFile = options.readArtifact('.tesseract/runs/speedrun-progress.jsonl');
  if (!progressFile || typeof progressFile !== 'string') {
    return { error: 'No progress data available', phase: 'idle' };
  }
  // Extract only the last line without splitting entire file into array
  const trimmed = progressFile.trimEnd();
  const lastNewline = trimmed.lastIndexOf('\n');
  const lastLine = lastNewline === -1 ? trimmed : trimmed.slice(lastNewline + 1);
  try { return JSON.parse(lastLine); }
  catch { return { error: 'Could not parse progress data', phase: 'unknown' }; }
};

// ─── Resource-backed Tool Handlers (W3.3) ───

const asReader = (options: DashboardMcpServerOptions): ResourceArtifactReader => ({
  readArtifact: options.readArtifact,
});

const getProposal: ToolHandler = (args, options) => {
  const id = (args.proposalId ?? args.id) as string;
  if (!id) return { error: 'proposalId is required', isError: true };
  const response = resolveResource(buildResourceUri('proposal', id), asReader(options));
  return response.found ? response.data : { ...(response.data as Record<string, unknown>), isError: true };
};

const listProposalsHandler: ToolHandler = (args, options) => {
  const reader = asReader(options);
  const proposals = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const indexProposals = reader.readArtifact('.tesseract/learning/proposals/index.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;
  const all = [
    ...(proposals?.proposals ?? []),
    ...(indexProposals?.proposals ?? []),
  ];
  const statusFilter = (args.status as string) ?? 'all';
  const filtered = statusFilter === 'all'
    ? all
    : all.filter((p) => (p.status as string) === statusFilter);
  const page = paginate(filtered, args);
  return { proposals: page.items, count: page.total, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
};

const getBottleneck: ToolHandler = (args, options) => {
  const screen = args.screen as string;
  if (!screen) return { error: 'screen is required', isError: true };
  const response = resolveResource(buildResourceUri('bottleneck', screen), asReader(options));
  return response.data;
};

const getRun: ToolHandler = (args, options) => {
  const runId = args.runId as string;
  if (!runId) return { error: 'runId is required', isError: true };
  const response = resolveResource(buildResourceUri('run', runId), asReader(options));
  return response.found ? response.data : { ...response.data as object, isError: true };
};

const getResolutionGraph: ToolHandler = (args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
    readonly edges?: readonly Record<string, unknown>[];
  } | null;
  if (!graph) return { nodes: [], edges: [], totalNodes: 0, totalEdges: 0 };
  const screenFilter = args.screen as string | undefined;
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];
  const filteredNodes = screenFilter
    ? nodes.filter((n) => (n.screen as string) === screenFilter)
    : nodes;
  const page = paginate(filteredNodes, args);
  return { nodes: page.items, edges: edges.slice(0, MAX_PAGE_SIZE), totalNodes: page.total, totalEdges: edges.length, offset: page.offset, limit: page.limit, hasMore: page.hasMore };
};

const getTaskResolution: ToolHandler = (args, options) => {
  const taskId = args.taskId as string;
  if (!taskId) return { error: 'taskId is required', isError: true };
  const resolution = options.readArtifact(`.tesseract/tasks/${taskId}.resolution.json`);
  return resolution ?? { error: `Resolution for ${taskId} not found`, isError: true };
};

const listScreens: ToolHandler = (_args, options) => {
  const graph = options.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
  } | null;
  if (!graph?.nodes) return { screens: [], count: 0 };
  const screenMap = new Map<string, number>();
  for (const node of graph.nodes) {
    const screen = (node.screen as string) ?? 'unknown';
    screenMap.set(screen, (screenMap.get(screen) ?? 0) + 1);
  }
  const screens = Array.from(screenMap.entries()).map(([screen, elementCount]) => ({
    screen,
    elementCount,
  }));
  return { screens, count: screens.length };
};

// ─── Browser Tool Handlers (Playwright MCP bridge) ───
// These delegate to the PlaywrightBridgePort when available.
// When no bridge is injected, they return a structured error.

const executeBrowserAction = (
  action: BrowserAction,
  options: DashboardMcpServerOptions,
): unknown => {
  const bridge = options.playwrightBridge;
  if (!bridge) return { error: 'Playwright bridge not available (headless mode)', available: false };
  const startedAt = Date.now();
  let attempts = 0;
  let result: unknown = null;
  Effect.runSync(
    Effect.suspend(() => {
      attempts += 1;
      return bridge.execute(action);
    }).pipe(
      Effect.retryOrElse(
        retryScheduleForTaggedErrors(
          RETRY_POLICIES.playwrightBridgeTransient,
          (error) => error._tag === 'PlaywrightBridgeTransientError',
        ),
        (error) => Effect.fail(error),
      ),
      Effect.tap((r) => Effect.sync(() => { result = r; })),
      Effect.catchAll((err) => Effect.sync(() => {
        result = {
          error: String(err),
          success: false,
          retry: formatRetryMetadata(
            retryMetadata(RETRY_POLICIES.playwrightBridgeTransient, attempts, startedAt, true),
          ),
        };
      })),
    ),
  );
  return result;
};

const browserScreenshot: ToolHandler = (_args, options) =>
  executeBrowserAction({ kind: 'screenshot' }, options);

const browserQuery: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'query', selector: args.selector as string }, options);

const browserAriaSnapshot: ToolHandler = (_args, options) =>
  executeBrowserAction({ kind: 'aria-snapshot' }, options);

const browserClick: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'click', selector: args.selector as string }, options);

const browserFill: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'fill', selector: args.selector as string, value: args.value as string }, options);

const browserNavigate: ToolHandler = (args, options) =>
  executeBrowserAction({ kind: 'navigate', url: args.url as string }, options);

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
  'get_proposal': getProposal,
  'list_proposals': listProposalsHandler,
  'get_bottleneck': getBottleneck,
  'get_run': getRun,
  'get_resolution_graph': getResolutionGraph,
  'get_task_resolution': getTaskResolution,
  'list_screens': listScreens,
  'browser_screenshot': browserScreenshot,
  'browser_query': browserQuery,
  'browser_aria_snapshot': browserAriaSnapshot,
  'browser_click': browserClick,
  'browser_fill': browserFill,
  'browser_navigate': browserNavigate,
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

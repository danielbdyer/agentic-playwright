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

  // ─── Lifecycle callbacks (host-mode only) ───

  /** Start the speedrun loop. Returns immediately; the loop runs as a background fiber.
   *  Provided by the host process when the MCP server owns the speedrun lifecycle. */
  readonly startSpeedrun?: (config: SpeedrunStartConfig) => Promise<SpeedrunHandle>;
  /** Stop a running speedrun. Interrupts the background fiber. */
  readonly stopSpeedrun?: () => Promise<void>;
  /** Get the current loop status from the host process. */
  readonly getLoopStatus?: () => LoopStatus;

  // ─── Knowledge contribution callbacks (host-mode only) ───

  /** Write a hint to a screen's hints.yaml file. Returns the written path. */
  readonly writeHint?: (params: HintContribution) => string | null;
  /** Write a locator alias to a screen's hints.yaml file. Returns the written path. */
  readonly writeLocatorAlias?: (params: LocatorAliasContribution) => string | null;
}

/** Configuration for starting a speedrun via MCP tool. */
export interface SpeedrunStartConfig {
  readonly count?: number | undefined;
  readonly seeds?: readonly string[] | undefined;
  readonly maxIterations?: number | undefined;
  readonly knowledgePosture?: string | undefined;
  readonly interpreterMode?: string | undefined;
}

/** Handle to a running speedrun fiber. */
export interface SpeedrunHandle {
  readonly status: 'started';
  readonly seeds: readonly string[];
  readonly maxIterations: number;
}

/** Status of the speedrun loop. */
export interface LoopStatus {
  readonly phase: 'idle' | 'running' | 'paused-for-decisions' | 'completed' | 'failed';
  readonly iteration?: number | undefined;
  readonly maxIterations?: number | undefined;
  readonly pendingDecisionCount?: number | undefined;
  readonly elapsedMs?: number | undefined;
  readonly error?: string | undefined;
  readonly lastProgress?: unknown;
}

/** Hint contribution from an agent. */
export interface HintContribution {
  readonly screen: string;
  readonly element: string;
  readonly hint: string;
  readonly confidence?: number | undefined;
}

/** Locator alias contribution from an agent. */
export interface LocatorAliasContribution {
  readonly screen: string;
  readonly element: string;
  readonly alias: string;
  readonly source?: string | undefined;
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

// ─── Lifecycle Tool Handlers ───

const startSpeedrun: ToolHandler = (args, options) => {
  if (!options.startSpeedrun) return { error: 'Speedrun lifecycle not available (standalone mode). Start the MCP server with lifecycle support.', isError: true };
  const status = options.getLoopStatus?.();
  if (status?.phase === 'running' || status?.phase === 'paused-for-decisions') {
    return { error: `Speedrun already ${status.phase}. Stop it first with stop_speedrun.`, isError: true };
  }
  const config: SpeedrunStartConfig = {
    count: args.count as number | undefined,
    seeds: args.seeds as string[] | undefined,
    maxIterations: args.maxIterations as number | undefined,
    knowledgePosture: args.knowledgePosture as string | undefined,
    interpreterMode: args.interpreterMode as string | undefined,
  };
  // Mark as async — the tool returns a promise indicator, not the final result.
  // The actual speedrun runs as a background fiber; use get_loop_status to monitor.
  options.startSpeedrun(config).catch(() => { /* errors tracked via getLoopStatus */ });
  return { ok: true, status: 'starting', message: 'Speedrun starting as background fiber. Use get_loop_status to monitor progress.' };
};

const stopSpeedrun: ToolHandler = (_args, options) => {
  if (!options.stopSpeedrun) return { error: 'Speedrun lifecycle not available (standalone mode)', isError: true };
  const status = options.getLoopStatus?.();
  if (!status || status.phase === 'idle' || status.phase === 'completed' || status.phase === 'failed') {
    return { error: `No active speedrun to stop (phase: ${status?.phase ?? 'idle'})`, isError: true };
  }
  options.stopSpeedrun().catch(() => { /* cleanup errors are non-fatal */ });
  return { ok: true, status: 'stopping', message: 'Speedrun interruption requested.' };
};

const getLoopStatus: ToolHandler = (_args, options) => {
  if (options.getLoopStatus) {
    return options.getLoopStatus();
  }
  // Fallback: read progress from disk (standalone mode)
  return getIterationStatus(_args, options);
};

// ─── Knowledge Contribution Tool Handlers ───

const suggestHint: ToolHandler = (args, options) => {
  if (!options.writeHint) return { error: 'Knowledge contribution not available (standalone mode). Start the MCP server with lifecycle support.', isError: true };
  const screen = args.screen as string;
  const element = args.element as string;
  const hint = args.hint as string;
  if (!screen || !element || !hint) return { error: 'screen, element, and hint are required', isError: true };
  const writtenPath = options.writeHint({
    screen, element, hint,
    confidence: args.confidence as number | undefined,
  });
  return writtenPath
    ? { ok: true, writtenPath, message: `Hint written for ${screen}/${element}. Will be picked up on next iteration.` }
    : { error: `Failed to write hint for ${screen}/${element}`, isError: true };
};

const suggestLocatorAlias: ToolHandler = (args, options) => {
  if (!options.writeLocatorAlias) return { error: 'Knowledge contribution not available (standalone mode)', isError: true };
  const screen = args.screen as string;
  const element = args.element as string;
  const alias = args.alias as string;
  if (!screen || !element || !alias) return { error: 'screen, element, and alias are required', isError: true };
  const writtenPath = options.writeLocatorAlias({
    screen, element, alias,
    source: args.source as string | undefined,
  });
  return writtenPath
    ? { ok: true, writtenPath, message: `Alias "${alias}" added for ${screen}/${element}. Will be picked up on next iteration.` }
    : { error: `Failed to write alias for ${screen}/${element}`, isError: true };
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
  // Lifecycle tools
  'start_speedrun': startSpeedrun,
  'stop_speedrun': stopSpeedrun,
  'get_loop_status': getLoopStatus,
  // Knowledge contribution tools
  'suggest_hint': suggestHint,
  'suggest_locator_alias': suggestLocatorAlias,
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
  // Compose tool catalog: base tools + lifecycle tools (when host-mode) + knowledge tools (when host-mode)
  const allTools: McpToolDefinition[] = [...dashboardMcpTools];
  if (options.startSpeedrun) allTools.push(...lifecycleMcpTools);
  if (options.writeHint) allTools.push(...knowledgeMcpTools);

  return {
    listTools: () => Effect.succeed(allTools as readonly McpToolDefinition[]),

    handleToolCall: (invocation: McpToolInvocation) =>
      Effect.sync(() => routeToolCall(invocation, options)),
  };
}

// ─── Lifecycle Tool Definitions ───

const lifecycleMcpTools: readonly McpToolDefinition[] = [
  {
    name: 'start_speedrun',
    category: 'control',
    description: 'Start the dogfood loop as a background fiber. The loop generates scenarios, compiles, executes via Playwright, and iterates. Use get_loop_status to monitor progress. Use get_queue_items to see pending decisions.',
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Number of scenarios to generate (default: 50)' },
        seeds: { type: 'array', items: { type: 'string' }, description: 'Seed strings for scenario generation' },
        maxIterations: { type: 'number', description: 'Maximum improvement iterations (default: 5)' },
        knowledgePosture: { type: 'string', enum: ['cold-start', 'warm-start', 'production'], description: 'Knowledge loading posture (default: warm-start)' },
        interpreterMode: { type: 'string', enum: ['playwright', 'diagnostic', 'dry-run'], description: 'Execution mode (default: playwright)' },
      },
    },
  },
  {
    name: 'stop_speedrun',
    category: 'control',
    description: 'Stop a running speedrun by interrupting the background fiber. Use when you want to abort the loop early.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_loop_status',
    category: 'observe',
    description: 'Get the current speedrun loop status: phase (idle/running/paused-for-decisions/completed/failed), iteration number, pending decision count, and elapsed time.',
    inputSchema: { type: 'object', properties: {} },
  },
];

// ─── Knowledge Contribution Tool Definitions ───

const knowledgeMcpTools: readonly McpToolDefinition[] = [
  {
    name: 'suggest_hint',
    category: 'decide',
    description: 'Write a hint for an element on a screen. Hints are persisted to knowledge/screens/{screen}.hints.yaml and picked up on the next iteration. Use this to teach the system about element behavior, affordances, or interaction patterns.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'Screen ID (e.g., "policy-search")' },
        element: { type: 'string', description: 'Element ID (e.g., "searchButton")' },
        hint: { type: 'string', description: 'The hint text describing how to interact with or identify this element' },
        confidence: { type: 'number', description: 'Confidence score 0-1 (default: 0.8)' },
      },
      required: ['screen', 'element', 'hint'],
    },
  },
  {
    name: 'suggest_locator_alias',
    category: 'decide',
    description: 'Add a locator alias for an element. Aliases are alternative names the resolution pipeline uses to find elements. Persisted to knowledge/screens/{screen}.hints.yaml.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'Screen ID' },
        element: { type: 'string', description: 'Element ID' },
        alias: { type: 'string', description: 'The alias to add (e.g., "submit button", "search field")' },
        source: { type: 'string', description: 'Source of the alias (e.g., "aria-label", "agent-observation")' },
      },
      required: ['screen', 'element', 'alias'],
    },
  },
];

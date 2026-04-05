/**
 * Dashboard domain types — the contract between the Effect fiber and
 * the React view layer.
 */

import type { Governance } from '../governance/workflow-types';
import type { ActorKind } from './events';

export * from './events';
export * from './factory';

export interface WorkItemDecision {
  readonly workItemId: string;
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
}

export type KnowledgeNodeStatus = 'approved' | 'learning' | 'needs-review' | 'blocked';

export interface KnowledgeNodeProjection {
  readonly screen: string;
  readonly element: string;
  readonly confidence: number;
  readonly aliases: readonly string[];
  readonly status: KnowledgeNodeStatus;
  readonly lastActor: ActorKind;
  readonly governance: Governance;
}

// ─── WebMCP Tool Definitions ───
// These types define the structured tools that the dashboard exposes
// via Chrome WebMCP or standalone MCP server. Agents use these to
// observe and interact with the Tesseract system programmatically.
//
// The tool surface is a strict superset of what the spatial dashboard
// renders — same data, structured access instead of visual.

/** MCP tool categories exposed by the dashboard. */
export type McpToolCategory = 'observe' | 'decide' | 'control';

/** A single MCP tool definition (for catalog generation). */
export interface McpToolDefinition {
  readonly name: string;
  readonly category: McpToolCategory;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
}

/** Structured invocation of an MCP tool. */
export interface McpToolInvocation {
  readonly tool: string;
  readonly arguments: Record<string, unknown>;
}

/** Structured result from an MCP tool invocation. */
export interface McpToolResult {
  readonly tool: string;
  readonly result: unknown;
  readonly isError: boolean;
}

/** The dashboard's MCP tool catalog — all tools an agent can invoke. */
export const dashboardMcpTools: readonly McpToolDefinition[] = [
  // Observation tools — same data the spatial canvas renders
  {
    name: 'list_probed_elements',
    category: 'observe',
    description: 'List all elements currently probed in the resolution pipeline, with bounding boxes, confidence, and locator strategy.',
    inputSchema: { type: 'object', properties: { screen: { type: 'string', description: 'Filter by screen ID' } } },
  },
  {
    name: 'get_screen_capture',
    category: 'observe',
    description: 'Get the latest screenshot of the application under test as base64 PNG.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_knowledge_state',
    category: 'observe',
    description: 'Get current knowledge graph state: screens, elements, confidence scores, approval status.',
    inputSchema: { type: 'object', properties: { screen: { type: 'string' } } },
  },
  {
    name: 'get_queue_items',
    category: 'observe',
    description: 'List pending work items in the decision queue with priority scores and context.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'processing', 'all'] } } },
  },
  {
    name: 'get_fitness_metrics',
    category: 'observe',
    description: 'Get current fitness scorecard: knowledge hit rate, translation precision, convergence velocity, proposal yield.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Decision tools — same actions the dashboard buttons trigger
  {
    name: 'approve_work_item',
    category: 'decide',
    description: 'Approve a pending work item, resuming the paused Effect fiber.',
    inputSchema: { type: 'object', properties: { workItemId: { type: 'string' }, rationale: { type: 'string' } }, required: ['workItemId'] },
  },
  {
    name: 'skip_work_item',
    category: 'decide',
    description: 'Skip a pending work item, resuming the paused Effect fiber with skip status.',
    inputSchema: { type: 'object', properties: { workItemId: { type: 'string' }, rationale: { type: 'string' } }, required: ['workItemId'] },
  },
  {
    name: 'get_decision_context',
    category: 'observe',
    description: 'Get the complete decision package for a work item in one call: the item itself, linked proposals with patches, bottleneck analysis, resolution evidence, task resolution, screenshot availability, and a suggested action with rationale. Use this before approve_work_item or skip_work_item.',
    inputSchema: { type: 'object', properties: { workItemId: { type: 'string', description: 'The work item ID to get context for' } }, required: ['workItemId'] },
  },
  // Control tools — fiber lifecycle
  {
    name: 'get_iteration_status',
    category: 'control',
    description: 'Get current iteration number, phase, elapsed time, and convergence metrics.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Browser tools — Playwright Page interaction (progressive enhancement, headed mode only)
  // Available when PlaywrightBridge is injected. Read-only tools are always safe.
  // Write tools (click, fill, navigate) are safe during fiber pause.
  {
    name: 'browser_screenshot',
    category: 'observe',
    description: 'Capture current page screenshot via Playwright. Available in headed mode.',
    inputSchema: { type: 'object', properties: { fullPage: { type: 'boolean' } } },
  },
  {
    name: 'browser_query',
    category: 'observe',
    description: 'Get bounding box of an element via Playwright locator. Available in headed mode.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
  },
  {
    name: 'browser_aria_snapshot',
    category: 'observe',
    description: 'Get ARIA accessibility tree snapshot of the current page.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'browser_click',
    category: 'control',
    description: 'Click an element on the page via Playwright. Only safe during fiber pause.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' } }, required: ['selector'] },
  },
  {
    name: 'browser_fill',
    category: 'control',
    description: 'Fill an input field via Playwright. Only safe during fiber pause.',
    inputSchema: { type: 'object', properties: { selector: { type: 'string' }, value: { type: 'string' } }, required: ['selector', 'value'] },
  },
  {
    name: 'browser_navigate',
    category: 'control',
    description: 'Navigate the browser to a URL via Playwright. Only safe during fiber pause.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
  },
  // Resource-backed observation tools (W3.3 MCP resource expansion)
  {
    name: 'get_proposal',
    category: 'observe',
    description: 'Get details of a specific proposal by ID, including patch, rationale, and activation status.',
    inputSchema: { type: 'object', properties: { proposalId: { type: 'string', description: 'The proposal ID to look up' } }, required: ['proposalId'] },
  },
  {
    name: 'list_proposals',
    category: 'observe',
    description: 'List all proposals with optional status filter. Returns proposal IDs, artifact types, and activation status.',
    inputSchema: { type: 'object', properties: { status: { type: 'string', enum: ['pending', 'activated', 'blocked', 'all'] }, screen: { type: 'string' } } },
  },
  {
    name: 'get_bottleneck',
    category: 'observe',
    description: 'Get bottleneck analysis for a specific screen: unresolved elements, resolution failure rates, and calibration weights.',
    inputSchema: { type: 'object', properties: { screen: { type: 'string', description: 'The screen ID to analyze' } }, required: ['screen'] },
  },
  {
    name: 'get_run',
    category: 'observe',
    description: 'Get details of a specific run by ID. Includes timing, pass/fail counts, and convergence metrics.',
    inputSchema: { type: 'object', properties: { runId: { type: 'string', description: 'The run ID to look up' } }, required: ['runId'] },
  },
  {
    name: 'get_resolution_graph',
    category: 'observe',
    description: 'Get the resolution graph with optional screen filter. Returns nodes, edges, and summary statistics.',
    inputSchema: { type: 'object', properties: { screen: { type: 'string', description: 'Filter by screen ID' } } },
  },
  {
    name: 'get_task_resolution',
    category: 'observe',
    description: 'Get resolution details for a specific task/ADO ID, including winning source and confidence.',
    inputSchema: { type: 'object', properties: { taskId: { type: 'string', description: 'The task/ADO ID' } }, required: ['taskId'] },
  },
  {
    name: 'list_screens',
    category: 'observe',
    description: 'List all screens with element counts, confidence summaries, and governance status.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_contribution_impact',
    category: 'observe',
    description: 'Get the impact of knowledge contributions: how many proposals were activated vs pending, average node confidence, hints files written, and fitness high-water-mark. Use after contributing hints or aliases to see if they helped.',
    inputSchema: { type: 'object', properties: { screen: { type: 'string', description: 'Optional screen filter' } } },
  },
  {
    name: 'get_suggested_action',
    category: 'observe',
    description: 'Get ranked suggestions for what to do next based on current system state. Examines loop phase, pending decisions, bottlenecks, knowledge gaps, and fitness trends to recommend the highest-value next action.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Proposal lifecycle tools
  {
    name: 'activate_proposal',
    category: 'decide',
    description: 'Activate a specific pending proposal, writing its knowledge (alias, hint) to the appropriate hints.yaml file. The activated knowledge is used by the resolution pipeline in subsequent iterations. Use list_proposals to find proposal IDs.',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: { type: 'string', description: 'The proposal ID to activate' },
      },
      required: ['proposalId'],
    },
  },
  // Convergence proof results
  {
    name: 'get_convergence_proof',
    category: 'observe',
    description: 'Get the latest convergence proof results: whether the recursive improvement loop converges, the learning contribution per iteration, hit rate trajectories, proposal consumption rates, and bottleneck analysis across trials.',
    inputSchema: { type: 'object', properties: {} },
  },
  // Learning summary — the "orient me" tool
  {
    name: 'get_learning_summary',
    category: 'observe',
    description: 'Get a holistic learning summary combining loop status, convergence proof, fitness metrics, proposal statistics, pending decisions, and inbox items. This is the first tool to call when starting a session — it tells you everything you need to orient and the highest-priority actions to take.',
    inputSchema: { type: 'object', properties: {} },
  },
] as const;

// ─── Headed Runtime Capability ───
// When the dashboard runs in headed mode (with a real browser),
// it can serve as an agent's eyes and hands. The agent observes
// through MCP tools and acts through decision tools, while the
// spatial visualization renders what the agent "sees."

/** Capability flags for the dashboard's runtime mode. */
export interface DashboardCapabilities {
  /** Layer 0: screenshot textures available via WS. */
  readonly screenshotStream: boolean;
  /** Layer 1: live DOM portal (iframe to app under test). */
  readonly liveDomPortal: boolean;
  /** Layer 2: MCP tool server running (WebMCP or standalone). */
  readonly mcpServer: boolean;
  /** Whether Playwright MCP is available for direct DOM interaction. */
  readonly playwrightMcp: boolean;
}

/** Default capabilities: screenshot-only (always available). */
export const baseCapabilities: DashboardCapabilities = {
  screenshotStream: true,
  liveDomPortal: false,
  mcpServer: false,
  playwrightMcp: false,
};

/** Detect available capabilities from environment. Pure. */
export const detectCapabilities = (options: {
  readonly headed?: boolean;
  readonly mcpEnabled?: boolean;
  readonly playwrightMcpEnabled?: boolean;
}): DashboardCapabilities => ({
  screenshotStream: true,
  liveDomPortal: options.headed ?? false,
  mcpServer: options.mcpEnabled ?? false,
  playwrightMcp: options.playwrightMcpEnabled ?? false,
});

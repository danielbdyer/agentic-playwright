/**
 * Dashboard domain types — the contract between the Effect fiber and
 * the React view layer.
 *
 * The Effect fiber emits DashboardEvents as it progresses through the
 * improvement loop. The fiber pauses at decision points (awaitDecision)
 * and resumes when the human responds via the dashboard.
 *
 * This is NOT a UI concern — it's a domain contract. The WS adapter
 * (infrastructure) implements the transport. The React app (view)
 * renders the events. The fiber (domain) drives everything.
 *
 * Progressive enhancement layers:
 *   Layer 0: Screenshot texture (base — always available)
 *   Layer 1: Live DOM portal (iframe — when headed)
 *   Layer 2: WebMCP / Playwright MCP (structured agent access)
 *
 * WebMCP coherence: the spatial overlay (glows, particles, knowledge)
 * is representationally identical to the MCP observation surface.
 * Both are projections of the same observable: a running DOM with
 * structured interaction affordances.
 */

import type { AgentWorkItem, WorkItemCompletion, ScreenGroupContext } from './workbench';
import type { SpeedrunProgressEvent } from './improvement';

export type DashboardEventKind =
  | 'iteration-start'
  | 'iteration-complete'
  | 'progress'
  | 'screen-group-start'
  | 'item-pending'
  | 'item-processing'
  | 'item-completed'
  | 'workbench-updated'
  | 'fitness-updated'
  | 'element-probed'
  | 'screen-captured'
  | 'connected'
  | 'error';

export interface DashboardEvent {
  readonly type: DashboardEventKind;
  readonly timestamp: string;
  readonly data: unknown;
}

export interface WorkItemDecision {
  readonly workItemId: string;
  readonly status: 'completed' | 'skipped';
  readonly rationale: string;
}

/** Build a dashboard event with current timestamp. Pure. */
export function dashboardEvent(type: DashboardEventKind, data: unknown): DashboardEvent {
  return { type, timestamp: new Date().toISOString(), data };
}

// ─── Spatial Observation Events ───
// These events bridge the resolution pipeline → spatial dashboard.
// They are the same data that WebMCP would expose as structured tools.

/** Emitted when the resolution pipeline probes a DOM element. */
export interface ElementProbedEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly boundingBox: { readonly x: number; readonly y: number; readonly width: number; readonly height: number } | null;
  readonly locatorRung: number;
  readonly strategy: string;
  readonly found: boolean;
  readonly confidence: number;
}

/** Emitted when a page screenshot is captured during execution. */
export interface ScreenCapturedEvent {
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
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
  // Control tools — fiber lifecycle
  {
    name: 'get_iteration_status',
    category: 'control',
    description: 'Get current iteration number, phase, elapsed time, and convergence metrics.',
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

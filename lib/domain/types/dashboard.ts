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

import type { Governance, ResolutionMode } from './workflow';

// ─── Actor Model ───
// Three-value subset of ParticipantKind scoped to the dashboard observation surface.
// The full ParticipantKind includes benchmark-runner/reviewer/optimizer — the
// visualization only needs the three actors that touch the DOM under test.

export type ActorKind = 'system' | 'agent' | 'operator';

// ─── Shared Geometry ───

export interface BoundingBox {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

// ─── Inbox / Pause Semantics ───

/** Whether a human-required item blocks the fiber or is queued for later review. */
export type InboxUrgency = 'blocking' | 'queued';

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
  | 'element-escalated'
  | 'inbox-item-arrived'
  | 'fiber-paused'
  | 'fiber-resumed'
  | 'rung-shift'
  | 'calibration-update'
  | 'proposal-activated'
  | 'confidence-crossed'
  | 'artifact-written'
  | 'stage-lifecycle'
  | 'surface-discovered'
  | 'route-navigated'
  | 'aria-tree-captured'
  | 'suite-slice-selected'
  | 'scenario-prioritized'
  | 'step-bound'
  | 'scenario-compiled'
  | 'step-executing'
  | 'step-resolved'
  | 'scenario-executed'
  | 'trust-policy-evaluated'
  | 'knowledge-activated'
  | 'convergence-evaluated'
  | 'iteration-summary'
  | 'diagnostics'
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

/** Emitted when the resolution pipeline probes a DOM element.
 *  Carries actor provenance so the visualization can distinguish
 *  deterministic pipeline triage, agent MCP exploration, and human override. */
export interface ElementProbedEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly boundingBox: BoundingBox | null;
  readonly locatorRung: number;
  readonly strategy: string;
  readonly found: boolean;
  readonly confidence: number;
  /** Which actor initiated this probe. */
  readonly actor: ActorKind;
  /** Current governance state of the resolved element. */
  readonly governance: Governance;
  /** How the element was resolved (deterministic, translation, or agentic). */
  readonly resolutionMode: ResolutionMode;
}

/** Emitted when a page screenshot is captured during execution. */
export interface ScreenCapturedEvent {
  readonly imageBase64: string;
  readonly width: number;
  readonly height: number;
  readonly url: string;
}

// ─── Knowledge Node Projection ───
// Shared type for the knowledge observatory. Dashboard imports this directly
// instead of maintaining a parallel KnowledgeNode interface.

export type KnowledgeNodeStatus = 'approved' | 'learning' | 'needs-review' | 'blocked';

export interface KnowledgeNodeProjection {
  readonly screen: string;
  readonly element: string;
  readonly confidence: number;
  readonly aliases: readonly string[];
  readonly status: KnowledgeNodeStatus;
  /** Which actor last touched this node. */
  readonly lastActor: ActorKind;
  /** Current governance state. */
  readonly governance: Governance;
}

// ─── Resolution Flow Events ───
// These events model element handoffs between actors and inbox semantics,
// enabling the visualization to render escalation arcs and pause indicators.

/** Emitted when an element transitions from one actor's domain to another. */
export interface ElementEscalatedEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly fromActor: ActorKind;
  readonly toActor: ActorKind;
  readonly reason: string;
  readonly governance: Governance;
  readonly boundingBox: BoundingBox | null;
}

/** Emitted when a decision point lands in the human operator's inbox. */
export interface InboxItemEvent {
  readonly id: string;
  readonly element: string;
  readonly screen: string;
  readonly urgency: InboxUrgency;
  readonly reason: string;
  readonly governance: Governance;
  readonly relatedWorkItemId: string | null;
}

/** Emitted when the Effect fiber pauses, waiting for human engagement. */
export interface FiberPauseEvent {
  readonly workItemId: string;
  readonly reason: string;
  readonly screen: string;
  readonly element: string | null;
}

/** Emitted when the Effect fiber resumes after human decision. */
export interface FiberResumeEvent {
  readonly workItemId: string;
  readonly decision: 'completed' | 'skipped';
}

// ─── Convergence & Learning Events (Layer 2) ───
// These events surface the self-improving loop's internal signals so the
// dashboard can render learning trajectory, calibration dynamics, and
// knowledge crystallization in real-time.

/** Emitted after each iteration with resolution rung distribution. */
export interface RungShiftEvent {
  readonly iteration: number;
  readonly distribution: readonly { readonly rung: string; readonly wins: number; readonly rate: number }[];
  readonly knowledgeHitRate: number;
  readonly totalSteps: number;
}

/** Emitted after each iteration with self-calibrating bottleneck weights. */
export interface CalibrationUpdateEvent {
  readonly iteration: number;
  readonly weights: {
    readonly repairDensity: number;
    readonly translationRate: number;
    readonly unresolvedRate: number;
    readonly inverseFragmentShare: number;
  };
  readonly weightDrift: number;
  readonly correlations: readonly { readonly signal: string; readonly strength: number }[];
}

/** Emitted when a proposal is activated or blocked by trust policy. */
export interface ProposalActivatedEvent {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly targetPath: string;
  readonly status: 'activated' | 'blocked';
  readonly confidence: number;
  readonly iteration: number;
}

/** Emitted when a knowledge artifact crosses a confidence threshold. */
export interface ConfidenceCrossedEvent {
  readonly artifactId: string;
  readonly screen: string | null;
  readonly element: string | null;
  readonly previousStatus: string;
  readonly newStatus: 'approved-equivalent' | 'needs-review' | 'learning';
  readonly score: number;
  readonly threshold: number;
}

// ─── Infrastructure Events (Layer 3 & 4) ───

/** Emitted when an artifact is written to disk. */
export interface ArtifactWrittenEvent {
  readonly path: string;
  readonly operation: 'write-text' | 'write-json' | 'ensure-dir';
}

/** Emitted when an Effect pipeline stage starts or completes. */
export interface StageLifecycleEvent {
  readonly stage: string;
  readonly phase: 'start' | 'complete';
  readonly durationMs?: number | undefined;
  readonly adoId?: string | undefined;
  readonly runId?: string | undefined;
  readonly iteration?: number | undefined;
  readonly workItemId?: string | undefined;
  readonly cacheStatus?: 'hit' | 'miss' | undefined;
  readonly rewrittenFiles?: readonly string[] | undefined;
}

// ─── Flywheel Visualization Events (Part II) ───

export interface SurfaceDiscoveredEvent {
  readonly screen: string;
  readonly region: string;
  readonly role: string;
  readonly boundingBox: BoundingBox;
  readonly childCount: number;
}

export interface RouteNavigatedEvent {
  readonly url: string;
  readonly screenId: string | null;
  readonly isSeeded: boolean;
}

export interface AriaTreeCapturedEvent {
  readonly screen: string;
  readonly nodeCount: number;
  readonly landmarkCount: number;
  readonly interactableCount: number;
}

export interface SuiteSliceSelectedEvent {
  readonly selectedCount: number;
  readonly totalCount: number;
  readonly estimatedCoverage: number;
  readonly topScreens: readonly string[];
  readonly sharedKnowledgeDensity: number;
  readonly costBudget: number;
}

export interface ScenarioPrioritizedEvent {
  readonly adoId: string;
  readonly priority: number;
  readonly rank: number;
  readonly inSlice: boolean;
  readonly sharedScreens: number;
  readonly sharedElements: number;
  readonly decompositionConfidence: number;
}

export interface StepBoundEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly stepText: string;
  readonly bindingKind: 'bound' | 'deferred' | 'unbound';
  readonly confidence: number;
  readonly targetRef: string | null;
  readonly screen: string | null;
  readonly element: string | null;
  readonly resolutionRung: number | null;
}

export interface ScenarioCompiledEvent {
  readonly adoId: string;
  readonly totalSteps: number;
  readonly boundSteps: number;
  readonly deferredSteps: number;
  readonly unboundSteps: number;
  readonly specPath: string;
  readonly tracePath: string;
}

export interface StepExecutingEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly screen: string | null;
  readonly element: string | null;
  readonly resolutionMode: ResolutionMode;
}

export interface StepResolvedEvent {
  readonly adoId: string;
  readonly stepIndex: number;
  readonly success: boolean;
  readonly actualRung: number;
  readonly durationMs: number;
  readonly failureClass: string | null;
  readonly proposalDrafted: boolean;
  readonly evidenceRecorded: boolean;
}

export interface ScenarioExecutedEvent {
  readonly adoId: string;
  readonly passed: boolean;
  readonly resolutionDistribution: readonly {
    readonly rung: number;
    readonly count: number;
  }[];
}

export interface TrustPolicyEvaluatedEvent {
  readonly proposalId: string;
  readonly artifactType: string;
  readonly confidence: number;
  readonly threshold: number;
  readonly decision: 'approved' | 'review-required' | 'blocked';
  readonly reasons: readonly string[];
  readonly trustPolicyRule: string;
}

export interface KnowledgeActivatedEvent {
  readonly proposalId: string;
  readonly screen: string;
  readonly element: string | null;
  readonly artifactPath: string;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly activatedAliases: readonly string[];
}

export interface ConvergenceEvaluatedEvent {
  readonly iteration: number;
  readonly converged: boolean;
  readonly reason: string;
  readonly knowledgeHitRate: number;
  readonly previousHitRate: number;
  readonly delta: number;
  readonly proposalsRemaining: number;
  readonly budgetRemaining: {
    readonly iterations: number;
    readonly tokens: number | null;
  };
}

export interface IterationSummaryEvent {
  readonly iteration: number;
  readonly scenariosExecuted: number;
  readonly scenariosPassed: number;
  readonly scenariosFailed: number;
  readonly stepsResolved: number;
  readonly stepsDeferred: number;
  readonly stepsUnresolved: number;
  readonly proposalsGenerated: number;
  readonly proposalsActivated: number;
  readonly proposalsBlocked: number;
  readonly knowledgeNodesCreated: number;
  readonly knowledgeNodesUpdated: number;
  readonly wallClockMs: number;
  readonly tokenEstimate: number | null;
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

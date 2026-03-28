/**
 * MCP Resource Provider — structured resource access via URI scheme.
 *
 * Implements `tesseract://` URI resources:
 *   - `tesseract://proposal/{id}` — proposal details
 *   - `tesseract://bottleneck/{screen}` — bottleneck analysis for a screen
 *   - `tesseract://run/{runId}` — run details
 *
 * Each resource is a pure function from (URI, options) → structured result.
 * No side effects except reading artifacts from `.tesseract/`.
 *
 * The resource provider extends the tool surface from 8 core tools to ~15
 * by adding resource-backed observation tools alongside the existing
 * dashboard tools.
 */

import { Effect } from 'effect';
import type { TesseractError } from '../../domain/errors';
import type { McpToolDefinition } from '../../domain/types/dashboard';

// ─── URI Parsing ───

export type McpResourceKind = 'proposal' | 'bottleneck' | 'run';

export interface McpResourceUri {
  readonly scheme: 'tesseract';
  readonly kind: McpResourceKind;
  readonly id: string;
}

/** Parse a `tesseract://{kind}/{id}` URI. Returns null for malformed URIs. Pure. */
export function parseResourceUri(uri: string): McpResourceUri | null {
  const match = uri.match(/^tesseract:\/\/(proposal|bottleneck|run)\/(.+)$/);
  if (!match) return null;
  return {
    scheme: 'tesseract',
    kind: match[1] as McpResourceKind,
    id: match[2]!,
  };
}

/** Build a canonical resource URI from parts. Pure. */
export function buildResourceUri(kind: McpResourceKind, id: string): string {
  return `tesseract://${kind}/${id}`;
}

// ─── Resource Response Envelope ───

export interface McpResourceResponse {
  readonly uri: string;
  readonly kind: McpResourceKind;
  readonly data: unknown;
  readonly found: boolean;
  readonly timestamp: string;
}

function resourceResponse(uri: string, kind: McpResourceKind, data: unknown, found: boolean): McpResourceResponse {
  return { uri, kind, data, found, timestamp: new Date().toISOString() };
}

// ─── Artifact Reader Contract ───

export interface ResourceArtifactReader {
  /** Read a JSON artifact from the .tesseract/ directory. Returns null if not found. */
  readonly readArtifact: (relativePath: string) => unknown | null;
}

// ─── Resource Handlers (pure) ───

type ResourceHandler = (id: string, reader: ResourceArtifactReader) => McpResourceResponse;

const resolveProposal: ResourceHandler = (id, reader) => {
  const uri = buildResourceUri('proposal', id);

  // Try proposals from the learning directory
  const proposals = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;

  const proposal = proposals?.proposals?.find(
    (p) => (p.id as string) === id || (p.proposalId as string) === id,
  ) ?? null;

  if (proposal) {
    return resourceResponse(uri, 'proposal', proposal, true);
  }

  // Try individual proposal file
  const individual = reader.readArtifact(`.tesseract/learning/proposals/${id}.json`);
  return individual
    ? resourceResponse(uri, 'proposal', individual, true)
    : resourceResponse(uri, 'proposal', { error: `Proposal ${id} not found` }, false);
};

const resolveBottleneck: ResourceHandler = (screen, reader) => {
  const uri = buildResourceUri('bottleneck', screen);

  // Read bottleneck analysis from calibration data
  const calibration = reader.readArtifact('.tesseract/benchmarks/calibration.json') as {
    readonly bottlenecks?: readonly Record<string, unknown>[];
    readonly screens?: Record<string, unknown>;
  } | null;

  const screenBottlenecks = calibration?.bottlenecks?.filter(
    (b) => (b.screen as string) === screen,
  ) ?? [];

  // Read scorecard for screen-level metrics
  const scorecard = reader.readArtifact('.tesseract/benchmarks/scorecard.json') as {
    readonly screenMetrics?: Record<string, unknown>;
  } | null;

  const screenMetrics = scorecard?.screenMetrics
    ? (scorecard.screenMetrics as Record<string, unknown>)[screen] ?? null
    : null;

  // Read resolution failures for this screen
  const tasks = reader.readArtifact('.tesseract/tasks/index.json') as {
    readonly tasks?: readonly Record<string, unknown>[];
  } | null;

  const screenTasks = tasks?.tasks?.filter(
    (t) => (t.screen as string) === screen,
  ) ?? [];

  const unresolvedCount = screenTasks.filter(
    (t) => (t.status as string) === 'needs-human' || (t.status as string) === 'unresolved',
  ).length;

  const data = {
    screen,
    bottlenecks: screenBottlenecks,
    metrics: screenMetrics,
    taskCount: screenTasks.length,
    unresolvedCount,
    bottleneckScore: screenTasks.length > 0
      ? unresolvedCount / screenTasks.length
      : 0,
  };

  return resourceResponse(uri, 'bottleneck', data, true);
};

const resolveRun: ResourceHandler = (runId, reader) => {
  const uri = buildResourceUri('run', runId);

  // Try run record from runs directory
  const runRecord = reader.readArtifact(`.tesseract/runs/${runId}.json`);
  if (runRecord) {
    return resourceResponse(uri, 'run', runRecord, true);
  }

  // Try the latest run if "latest" is requested
  if (runId === 'latest') {
    const progressFile = reader.readArtifact('.tesseract/runs/speedrun-progress.jsonl');
    if (progressFile && typeof progressFile === 'string') {
      const lines = progressFile.trim().split('\n');
      const lastLine = lines[lines.length - 1];
      try {
        const parsed = JSON.parse(lastLine!);
        return resourceResponse(uri, 'run', parsed, true);
      } catch {
        return resourceResponse(uri, 'run', { error: 'Could not parse latest run data' }, false);
      }
    }
  }

  // Try session records
  const session = reader.readArtifact(`.tesseract/sessions/${runId}.json`);
  if (session) {
    return resourceResponse(uri, 'run', session, true);
  }

  return resourceResponse(uri, 'run', { error: `Run ${runId} not found` }, false);
};

// ─── Resource Router ───

const resourceHandlers: Readonly<Record<McpResourceKind, ResourceHandler>> = {
  proposal: resolveProposal,
  bottleneck: resolveBottleneck,
  run: resolveRun,
};

/** Resolve a resource URI to its response. Pure. */
export function resolveResource(uri: string, reader: ResourceArtifactReader): McpResourceResponse {
  const parsed = parseResourceUri(uri);
  if (!parsed) {
    return resourceResponse(uri, 'proposal', { error: `Malformed URI: ${uri}` }, false);
  }
  const handler = resourceHandlers[parsed.kind];
  return handler(parsed.id, reader);
}

// ─── Expanded Tool Definitions ───
// These tools complement the existing 8 dashboard tools and 6 browser tools.
// They provide resource-backed observation tools for deeper introspection.

export const resourceMcpTools: readonly McpToolDefinition[] = [
  // Resource observation tools
  {
    name: 'get_proposal',
    category: 'observe',
    description: 'Get details of a specific proposal by ID, including patch, rationale, and activation status.',
    inputSchema: {
      type: 'object',
      properties: {
        proposalId: { type: 'string', description: 'The proposal ID to look up' },
      },
      required: ['proposalId'],
    },
  },
  {
    name: 'list_proposals',
    category: 'observe',
    description: 'List all proposals with optional status filter. Returns proposal IDs, artifact types, and activation status.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'activated', 'blocked', 'all'], description: 'Filter by proposal status' },
        screen: { type: 'string', description: 'Filter by target screen' },
      },
    },
  },
  {
    name: 'get_bottleneck_analysis',
    category: 'observe',
    description: 'Get bottleneck analysis for a specific screen: unresolved elements, resolution failure rates, and calibration weights.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'The screen ID to analyze' },
      },
      required: ['screen'],
    },
  },
  {
    name: 'list_bottlenecks',
    category: 'observe',
    description: 'List screens ranked by bottleneck severity. Returns screens with highest unresolved rates first.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of screens to return (default: 10)' },
      },
    },
  },
  {
    name: 'get_run_details',
    category: 'observe',
    description: 'Get details of a specific run by ID or "latest" for the most recent run. Includes timing, pass/fail counts, and convergence metrics.',
    inputSchema: {
      type: 'object',
      properties: {
        runId: { type: 'string', description: 'The run ID or "latest"' },
      },
      required: ['runId'],
    },
  },
  {
    name: 'list_runs',
    category: 'observe',
    description: 'List recent runs with summary statistics. Returns run IDs, timestamps, and pass rates.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Maximum number of runs to return (default: 10)' },
      },
    },
  },
  {
    name: 'get_resolution_history',
    category: 'observe',
    description: 'Get resolution history for a specific element on a screen. Shows which rungs succeeded or failed across runs.',
    inputSchema: {
      type: 'object',
      properties: {
        screen: { type: 'string', description: 'Screen ID' },
        element: { type: 'string', description: 'Element ID' },
      },
      required: ['screen', 'element'],
    },
  },
] as const;

// ─── Expanded Tool Handlers ───

type ExpandedToolHandler = (
  args: Record<string, unknown>,
  reader: ResourceArtifactReader,
) => unknown;

const getProposal: ExpandedToolHandler = (args, reader) => {
  const proposalId = args.proposalId as string;
  if (!proposalId) return { error: 'proposalId is required', isError: true };
  return resolveResource(buildResourceUri('proposal', proposalId), reader).data;
};

const listProposals: ExpandedToolHandler = (args, reader) => {
  const proposals = reader.readArtifact('.tesseract/learning/proposals.json') as {
    readonly proposals?: readonly Record<string, unknown>[];
  } | null;

  if (!proposals?.proposals) return { proposals: [], count: 0 };

  const statusFilter = (args.status as string) ?? 'all';
  const screenFilter = args.screen as string | undefined;

  const filtered = proposals.proposals
    .filter((p) => statusFilter === 'all' || (p.status as string) === statusFilter)
    .filter((p) => !screenFilter || (p.targetPath as string)?.includes(screenFilter));

  return { proposals: filtered, count: filtered.length };
};

const getBottleneckAnalysis: ExpandedToolHandler = (args, reader) => {
  const screen = args.screen as string;
  if (!screen) return { error: 'screen is required', isError: true };
  return resolveResource(buildResourceUri('bottleneck', screen), reader).data;
};

const listBottlenecks: ExpandedToolHandler = (args, reader) => {
  const limit = (args.limit as number) ?? 10;

  const graph = reader.readArtifact('.tesseract/graph/index.json') as {
    readonly nodes?: readonly Record<string, unknown>[];
  } | null;

  if (!graph?.nodes) return { screens: [], count: 0 };

  // Extract unique screens and compute bottleneck scores
  const screenNodes = graph.nodes.filter((n) => (n.kind as string) === 'screen');
  const screens = screenNodes.map((node) => {
    const screen = node.id as string;
    const response = resolveResource(buildResourceUri('bottleneck', screen), reader);
    const data = response.data as { bottleneckScore?: number; unresolvedCount?: number; taskCount?: number };
    return {
      screen,
      bottleneckScore: data.bottleneckScore ?? 0,
      unresolvedCount: data.unresolvedCount ?? 0,
      taskCount: data.taskCount ?? 0,
    };
  });

  const sorted = [...screens].sort((a, b) => b.bottleneckScore - a.bottleneckScore);
  return { screens: sorted.slice(0, limit), count: screens.length };
};

const getRunDetails: ExpandedToolHandler = (args, reader) => {
  const runId = args.runId as string;
  if (!runId) return { error: 'runId is required', isError: true };
  return resolveResource(buildResourceUri('run', runId), reader).data;
};

const listRuns: ExpandedToolHandler = (args, reader) => {
  const limit = (args.limit as number) ?? 10;

  const runsIndex = reader.readArtifact('.tesseract/runs/index.json') as {
    readonly runs?: readonly Record<string, unknown>[];
  } | null;

  if (!runsIndex?.runs) return { runs: [], count: 0 };

  const sorted = [...runsIndex.runs].sort((a, b) => {
    const aTime = (a.timestamp as string) ?? '';
    const bTime = (b.timestamp as string) ?? '';
    return bTime.localeCompare(aTime);
  });

  return { runs: sorted.slice(0, limit), count: runsIndex.runs.length };
};

const getResolutionHistory: ExpandedToolHandler = (args, reader) => {
  const screen = args.screen as string;
  const element = args.element as string;
  if (!screen || !element) return { error: 'screen and element are required', isError: true };

  const evidence = reader.readArtifact(`.tesseract/evidence/${screen}/${element}.json`);
  if (evidence) return evidence;

  // Fallback: scan task resolutions
  const tasks = reader.readArtifact('.tesseract/tasks/index.json') as {
    readonly tasks?: readonly Record<string, unknown>[];
  } | null;

  const relevant = tasks?.tasks?.filter(
    (t) => (t.screen as string) === screen && (t.element as string) === element,
  ) ?? [];

  return { screen, element, history: relevant, count: relevant.length };
};

// ─── Expanded Tool Router ───

export const expandedToolHandlers: Readonly<Record<string, ExpandedToolHandler>> = {
  get_proposal: getProposal,
  list_proposals: listProposals,
  get_bottleneck_analysis: getBottleneckAnalysis,
  list_bottlenecks: listBottlenecks,
  get_run_details: getRunDetails,
  list_runs: listRuns,
  get_resolution_history: getResolutionHistory,
};

/** Route a tool call to an expanded tool handler. Returns null if not a resource tool. */
export function routeExpandedToolCall(
  tool: string,
  args: Record<string, unknown>,
  reader: ResourceArtifactReader,
): { readonly result: unknown; readonly isError: boolean } | null {
  const handler = expandedToolHandlers[tool];
  if (!handler) return null;
  try {
    const result = handler(args, reader);
    const isError = typeof result === 'object' && result !== null && 'isError' in result
      ? (result as { isError: boolean }).isError
      : false;
    return { result, isError };
  } catch (err) {
    return { result: { error: String(err) }, isError: true };
  }
}

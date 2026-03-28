/**
 * MCP Resource Expansion — Law Tests (W3.3)
 *
 * Pure function invariants for URI parsing, resource resolution, and response formatting.
 * Tests the `tesseract://` URI scheme and the expanded tool surface.
 *
 * Laws tested:
 *   1. URI parsing: valid URIs parse correctly, invalid URIs return null
 *   2. URI parsing determinism: same input always produces same output
 *   3. Resource resolution — proposal: reads from learning artifacts
 *   4. Resource resolution — bottleneck: reads from calibration/tasks
 *   5. Resource resolution — run: reads from runs directory
 *   6. Response structure: all responses have uri, kind, data, found fields
 *   7. Round-trip: parse → resolve preserves the URI
 *   8. Invalid URI resolution: returns found=false
 *   9. Tool catalog expansion: dashboardMcpTools includes resource tools
 *  10. Tool handler routing: dashboard server dispatches resource tools
 *  11. Tool handler errors: missing required args produce isError
 *  12. Server listTools includes expanded tools
 *  13. Empty artifact graceful degradation
 *  14. Bottleneck score monotonicity
 *  15. Existing tools unbroken
 */

import { expect, test } from '@playwright/test';
import {
  parseResourceUri,
  resolveResource,
  buildResourceUri,
  type McpResourceUri,
  type ResourceArtifactReader,
  type McpResourceResponse,
  type McpResourceKind,
} from '../lib/infrastructure/mcp/resource-provider';
import { dashboardMcpTools } from '../lib/domain/types/dashboard';
import { createDashboardMcpServer, type DashboardMcpServerOptions } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import { Effect } from 'effect';

// ─── Test Fixtures ───

function emptyReader(): ResourceArtifactReader {
  return { readArtifact: () => null };
}

function artifactReader(artifacts: Readonly<Record<string, unknown>>): ResourceArtifactReader {
  return { readArtifact: (path) => artifacts[path] ?? null };
}

function mockProposal(id: string, overrides: Record<string, unknown> = {}) {
  return { id, proposalId: id, title: `Proposal ${id}`, status: 'pending', ...overrides };
}

function mockRunRecord(runId: string, overrides: Record<string, unknown> = {}) {
  return { runId, status: 'completed', startTime: '2026-01-01T00:00:00Z', ...overrides };
}

function mockMcpServerOptions(artifacts: Readonly<Record<string, unknown>> = {}): DashboardMcpServerOptions {
  return {
    readArtifact: (path: string) => artifacts[path] ?? null,
    screenshotCache: { get: () => null },
    pendingDecisions: new Map(),
    broadcast: () => {},
  };
}

// ─── Law 1: URI Parsing — Valid URIs ───

test.describe('URI Parsing — Valid URIs', () => {
  const validCases: readonly { readonly uri: string; readonly kind: McpResourceKind; readonly id: string }[] = [
    { uri: 'tesseract://proposal/abc-123', kind: 'proposal', id: 'abc-123' },
    { uri: 'tesseract://bottleneck/login-screen', kind: 'bottleneck', id: 'login-screen' },
    { uri: 'tesseract://run/run-001', kind: 'run', id: 'run-001' },
    { uri: 'tesseract://proposal/with/slashes', kind: 'proposal', id: 'with/slashes' },
    { uri: 'tesseract://run/uuid-4a3b-c8d9', kind: 'run', id: 'uuid-4a3b-c8d9' },
    { uri: 'tesseract://bottleneck/policy-search', kind: 'bottleneck', id: 'policy-search' },
  ];

  for (const { uri, kind, id } of validCases) {
    test(`parses ${uri} as kind=${kind}, id=${id}`, () => {
      const result = parseResourceUri(uri);
      expect(result).not.toBeNull();
      const parsed = result as McpResourceUri;
      expect(parsed.scheme).toBe('tesseract');
      expect(parsed.kind).toBe(kind);
      expect(parsed.id).toBe(id);
    });
  }
});

// ─── Law 2: URI Parsing — Invalid URIs ───

test.describe('URI Parsing — Invalid URIs', () => {
  const invalidCases: readonly string[] = [
    '',
    'tesseract://',
    'tesseract://unknown/thing',
    'http://proposal/123',
    'tesseract://proposal',
    'tesseract://proposal/',
    'not-a-uri',
    'tesseract:///proposal/123',
    'TESSERACT://proposal/123',
  ];

  for (const uri of invalidCases) {
    test(`rejects invalid URI: "${uri}"`, () => {
      const result = parseResourceUri(uri);
      expect(result).toBeNull();
    });
  }
});

// ─── Law 3: URI Parsing Determinism ───

test.describe('URI Parsing — Determinism', () => {
  test('same URI always produces same parse result', () => {
    const uri = 'tesseract://proposal/abc-123';
    const a = parseResourceUri(uri);
    const b = parseResourceUri(uri);
    expect(a).toEqual(b);
  });

  test('same invalid URI always produces null', () => {
    const uri = 'not-a-uri';
    const a = parseResourceUri(uri);
    const b = parseResourceUri(uri);
    expect(a).toBeNull();
    expect(b).toBeNull();
  });
});

// ─── Law 4: buildResourceUri round-trip with parseResourceUri ───

test.describe('buildResourceUri round-trip', () => {
  const kinds: readonly McpResourceKind[] = ['proposal', 'bottleneck', 'run'];

  for (const kind of kinds) {
    test(`build then parse preserves kind=${kind}`, () => {
      const uri = buildResourceUri(kind, 'test-id-42');
      const parsed = parseResourceUri(uri);
      expect(parsed).not.toBeNull();
      expect(parsed!.kind).toBe(kind);
      expect(parsed!.id).toBe('test-id-42');
    });
  }
});

// ─── Law 5: Resource Resolution — Proposal ───

test.describe('Resource Resolution — Proposal', () => {
  test('resolves proposal from learning/proposals index', () => {
    const reader = artifactReader({
      '.tesseract/learning/proposals.json': { proposals: [mockProposal('p-001')] },
    });
    const result = resolveResource('tesseract://proposal/p-001', reader);
    expect(result.found).toBe(true);
    expect(result.kind).toBe('proposal');
    expect(result.uri).toBe('tesseract://proposal/p-001');
  });

  test('resolves proposal from individual file', () => {
    const reader = artifactReader({
      '.tesseract/learning/proposals/p-002.json': mockProposal('p-002', { status: 'approved' }),
    });
    const result = resolveResource('tesseract://proposal/p-002', reader);
    expect(result.found).toBe(true);
    expect((result.data as { status: string }).status).toBe('approved');
  });

  test('returns found=false for missing proposal', () => {
    const result = resolveResource('tesseract://proposal/missing', emptyReader());
    expect(result.found).toBe(false);
    expect(result.kind).toBe('proposal');
    expect(result.uri).toBe('tesseract://proposal/missing');
  });

  test('proposals index takes precedence over individual file', () => {
    const reader = artifactReader({
      '.tesseract/learning/proposals.json': { proposals: [mockProposal('dup-001', { source: 'index' })] },
      '.tesseract/learning/proposals/dup-001.json': mockProposal('dup-001', { source: 'file' }),
    });
    const result = resolveResource('tesseract://proposal/dup-001', reader);
    expect(result.found).toBe(true);
    expect((result.data as { source: string }).source).toBe('index');
  });
});

// ─── Law 6: Resource Resolution — Bottleneck ───

test.describe('Resource Resolution — Bottleneck', () => {
  test('returns bottleneck data with task-based scoring', () => {
    const reader = artifactReader({
      '.tesseract/tasks/index.json': {
        tasks: [
          { screen: 'login', status: 'resolved' },
          { screen: 'login', status: 'needs-human' },
          { screen: 'login', status: 'unresolved' },
        ],
      },
    });
    const result = resolveResource('tesseract://bottleneck/login', reader);
    expect(result.found).toBe(true);
    expect(result.kind).toBe('bottleneck');
    const data = result.data as { screen: string; taskCount: number; unresolvedCount: number; bottleneckScore: number };
    expect(data.screen).toBe('login');
    expect(data.taskCount).toBe(3);
    expect(data.unresolvedCount).toBe(2);
    expect(data.bottleneckScore).toBeCloseTo(2 / 3);
  });

  test('bottleneck score is zero when no tasks exist', () => {
    const result = resolveResource('tesseract://bottleneck/login', emptyReader());
    expect(result.found).toBe(true); // always found, just with zero data
    const data = result.data as { bottleneckScore: number };
    expect(data.bottleneckScore).toBe(0);
  });

  test('bottleneck score is zero for fully resolved screen', () => {
    const reader = artifactReader({
      '.tesseract/tasks/index.json': {
        tasks: [
          { screen: 'home', status: 'resolved' },
          { screen: 'home', status: 'resolved' },
        ],
      },
    });
    const result = resolveResource('tesseract://bottleneck/home', reader);
    expect((result.data as { bottleneckScore: number }).bottleneckScore).toBe(0);
  });
});

// ─── Law 7: Resource Resolution — Run ───

test.describe('Resource Resolution — Run', () => {
  test('resolves run from direct file', () => {
    const reader = artifactReader({
      '.tesseract/runs/run-001.json': mockRunRecord('run-001'),
    });
    const result = resolveResource('tesseract://run/run-001', reader);
    expect(result.found).toBe(true);
    expect(result.kind).toBe('run');
    expect((result.data as { runId: string }).runId).toBe('run-001');
  });

  test('resolves "latest" from speedrun progress JSONL', () => {
    const reader = artifactReader({
      '.tesseract/runs/speedrun-progress.jsonl': `{"runId":"sr-001","phase":"compile"}\n{"runId":"sr-002","phase":"execute"}`,
    });
    const result = resolveResource('tesseract://run/latest', reader);
    expect(result.found).toBe(true);
    expect((result.data as { runId: string }).runId).toBe('sr-002');
  });

  test('resolves run from session file', () => {
    const reader = artifactReader({
      '.tesseract/sessions/sess-001.json': { sessionId: 'sess-001', status: 'completed' },
    });
    const result = resolveResource('tesseract://run/sess-001', reader);
    expect(result.found).toBe(true);
  });

  test('returns found=false for missing run', () => {
    const result = resolveResource('tesseract://run/missing', emptyReader());
    expect(result.found).toBe(false);
  });

  test('direct file takes precedence over session', () => {
    const reader = artifactReader({
      '.tesseract/runs/run-001.json': mockRunRecord('run-001', { source: 'direct' }),
      '.tesseract/sessions/run-001.json': { source: 'session' },
    });
    const result = resolveResource('tesseract://run/run-001', reader);
    expect((result.data as { source: string }).source).toBe('direct');
  });
});

// ─── Law 8: Response Structure Consistency ───

test.describe('Response Structure', () => {
  const kinds: readonly McpResourceKind[] = ['proposal', 'bottleneck', 'run'];

  for (const kind of kinds) {
    test(`${kind} response always has uri, kind, data, found, timestamp fields`, () => {
      const result = resolveResource(`tesseract://${kind}/test-id`, emptyReader());
      expect(result).toHaveProperty('uri');
      expect(result).toHaveProperty('kind');
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('found');
      expect(result).toHaveProperty('timestamp');
      expect(result.kind).toBe(kind);
      expect(result.uri).toBe(`tesseract://${kind}/test-id`);
    });
  }

  test('not-found response has data with error message', () => {
    const result = resolveResource('tesseract://proposal/missing', emptyReader());
    expect(result.found).toBe(false);
    expect(result.data).toHaveProperty('error');
  });
});

// ─── Law 9: Round-Trip — parse → resolve preserves URI ───

test.describe('Round-Trip URI Preservation', () => {
  const uris = [
    'tesseract://proposal/abc-123',
    'tesseract://bottleneck/login',
    'tesseract://run/run-001',
  ];

  for (const uri of uris) {
    test(`round-trip preserves URI: ${uri}`, () => {
      const result = resolveResource(uri, emptyReader());
      expect(result.uri).toBe(uri);
    });
  }
});

// ─── Law 10: Invalid URI resolution returns found=false ───

test.describe('Invalid URI resolution', () => {
  test('invalid URI returns found=false with error', () => {
    const result = resolveResource('invalid-uri', emptyReader());
    expect(result.found).toBe(false);
  });
});

// ─── Law 11: Tool Catalog Expansion ───

test.describe('Tool Catalog Expansion', () => {
  test('catalog contains at least 15 tools (8 core + 6 browser + 7 resource)', () => {
    expect(dashboardMcpTools.length).toBeGreaterThanOrEqual(15);
  });

  const expectedNewTools = [
    'get_proposal',
    'get_bottleneck',
    'get_run',
    'get_resolution_graph',
    'list_proposals',
    'get_task_resolution',
    'list_screens',
  ];

  for (const toolName of expectedNewTools) {
    test(`catalog includes ${toolName}`, () => {
      const tool = dashboardMcpTools.find((t) => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool!.category).toBeTruthy();
      expect(tool!.description).toBeTruthy();
      expect(tool!.inputSchema).toBeTruthy();
    });
  }

  test('all tools have unique names', () => {
    const names = dashboardMcpTools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every tool has a valid category', () => {
    const validCategories = new Set(['observe', 'decide', 'control']);
    for (const tool of dashboardMcpTools) {
      expect(validCategories.has(tool.category)).toBe(true);
    }
  });

  test('every tool has a non-empty description', () => {
    for (const tool of dashboardMcpTools) {
      expect(tool.description.length).toBeGreaterThan(10);
    }
  });

  test('every tool has an inputSchema with type=object', () => {
    for (const tool of dashboardMcpTools) {
      expect(tool.inputSchema.type).toBe('object');
    }
  });
});

// ─── Law 12: Tool Handler Routing — New Tools ───

test.describe('Tool Handler Routing', () => {
  test('get_proposal routes to proposal resolution', () => {
    const options = mockMcpServerOptions({
      '.tesseract/learning/proposals/p-001.json': mockProposal('p-001'),
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_proposal', arguments: { proposalId: 'p-001' } }));
    expect(result.isError).toBe(false);
  });

  test('get_bottleneck routes to bottleneck analysis', () => {
    const options = mockMcpServerOptions({
      '.tesseract/tasks/index.json': { tasks: [{ screen: 'login', status: 'resolved' }] },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_bottleneck', arguments: { screen: 'login' } }));
    expect(result.isError).toBe(false);
  });

  test('get_run routes to run resolution', () => {
    const options = mockMcpServerOptions({
      '.tesseract/runs/run-001.json': mockRunRecord('run-001'),
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_run', arguments: { runId: 'run-001' } }));
    expect(result.isError).toBe(false);
  });

  test('get_resolution_graph returns graph data', () => {
    const options = mockMcpServerOptions({
      '.tesseract/graph/index.json': { nodes: [{ id: 'login/btn', screen: 'login', confidence: 0.5 }], edges: [] },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_resolution_graph', arguments: {} }));
    expect(result.isError).toBe(false);
    expect((result.result as { totalNodes: number }).totalNodes).toBe(1);
  });

  test('get_resolution_graph filters by screen', () => {
    const options = mockMcpServerOptions({
      '.tesseract/graph/index.json': {
        nodes: [
          { id: 'login/btn', screen: 'login', confidence: 0.5 },
          { id: 'home/nav', screen: 'home', confidence: 0.8 },
        ],
        edges: [],
      },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_resolution_graph', arguments: { screen: 'login' } }));
    expect(result.isError).toBe(false);
    expect((result.result as { totalNodes: number }).totalNodes).toBe(1);
  });

  test('list_proposals returns all proposals', () => {
    const options = mockMcpServerOptions({
      '.tesseract/learning/proposals/index.json': {
        proposals: [mockProposal('p-001'), mockProposal('p-002', { status: 'approved' })],
      },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'list_proposals', arguments: {} }));
    expect(result.isError).toBe(false);
    expect((result.result as { count: number }).count).toBe(2);
  });

  test('list_proposals filters by status', () => {
    const options = mockMcpServerOptions({
      '.tesseract/learning/proposals/index.json': {
        proposals: [mockProposal('p-001'), mockProposal('p-002', { status: 'approved' })],
      },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'list_proposals', arguments: { status: 'approved' } }));
    expect(result.isError).toBe(false);
    expect((result.result as { count: number }).count).toBe(1);
  });

  test('get_task_resolution returns resolution data', () => {
    const options = mockMcpServerOptions({
      '.tesseract/tasks/10001.resolution.json': { adoId: '10001', winningSource: 'compiler-derived', confidence: 0.95 },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_task_resolution', arguments: { taskId: '10001' } }));
    expect(result.isError).toBe(false);
    expect((result.result as { winningSource: string }).winningSource).toBe('compiler-derived');
  });

  test('list_screens returns screen summaries', () => {
    const options = mockMcpServerOptions({
      '.tesseract/graph/index.json': {
        nodes: [
          { id: 'login/user', screen: 'login', confidence: 0.8 },
          { id: 'login/pass', screen: 'login', confidence: 0.6 },
          { id: 'home/nav', screen: 'home', confidence: 0.9 },
        ],
      },
    });
    const server = createDashboardMcpServer(options);
    const result = Effect.runSync(server.handleToolCall({ tool: 'list_screens', arguments: {} }));
    expect(result.isError).toBe(false);
    const data = result.result as { screens: readonly { screen: string; elementCount: number }[]; count: number };
    expect(data.count).toBe(2);
    const loginScreen = data.screens.find((s) => s.screen === 'login');
    expect(loginScreen).toBeDefined();
    expect(loginScreen!.elementCount).toBe(2);
  });
});

// ─── Law 13: Tool Handler Error Cases ───

test.describe('Tool Handler Error Cases', () => {
  test('get_proposal without proposalId returns error', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_proposal', arguments: {} }));
    expect(result.isError).toBe(false); // handler returns error in result, not isError on envelope
    expect((result.result as { isError: boolean }).isError).toBe(true);
  });

  test('get_bottleneck without screen returns error', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_bottleneck', arguments: {} }));
    expect((result.result as { isError: boolean }).isError).toBe(true);
  });

  test('get_run without runId returns error', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_run', arguments: {} }));
    expect((result.result as { isError: boolean }).isError).toBe(true);
  });

  test('get_task_resolution without taskId returns error', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_task_resolution', arguments: {} }));
    expect((result.result as { isError: boolean }).isError).toBe(true);
  });

  test('unknown tool returns isError=true on envelope', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'nonexistent_tool', arguments: {} }));
    expect(result.isError).toBe(true);
  });
});

// ─── Law 14: Server listTools Returns Expanded Catalog ───

test.describe('Server listTools', () => {
  test('listTools returns all tools including new ones', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const tools = Effect.runSync(server.listTools());
    expect(tools.length).toBeGreaterThanOrEqual(15);
    const names = tools.map((t: { name: string }) => t.name);
    expect(names).toContain('get_proposal');
    expect(names).toContain('get_bottleneck');
    expect(names).toContain('get_run');
    expect(names).toContain('list_screens');
  });
});

// ─── Law 15: Empty Artifact Graceful Degradation ───

test.describe('Empty Artifact Graceful Degradation', () => {
  test('get_resolution_graph with no graph returns empty', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'get_resolution_graph', arguments: {} }));
    expect(result.isError).toBe(false);
    expect((result.result as { totalNodes: number }).totalNodes).toBe(0);
  });

  test('list_proposals with no proposals returns empty', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'list_proposals', arguments: {} }));
    expect(result.isError).toBe(false);
    expect((result.result as { count: number }).count).toBe(0);
  });

  test('list_screens with no graph returns empty', () => {
    const server = createDashboardMcpServer(mockMcpServerOptions());
    const result = Effect.runSync(server.handleToolCall({ tool: 'list_screens', arguments: {} }));
    expect(result.isError).toBe(false);
    expect((result.result as { count: number }).count).toBe(0);
  });
});

// ─── Law 16: Bottleneck Score Monotonicity ───

test.describe('Bottleneck Score Monotonicity', () => {
  test('more unresolved tasks produce higher bottleneck score', () => {
    const readerA = artifactReader({
      '.tesseract/tasks/index.json': {
        tasks: [
          { screen: 'login', status: 'resolved' },
          { screen: 'login', status: 'resolved' },
        ],
      },
    });
    const readerB = artifactReader({
      '.tesseract/tasks/index.json': {
        tasks: [
          { screen: 'login', status: 'resolved' },
          { screen: 'login', status: 'needs-human' },
        ],
      },
    });
    const scoreA = (resolveResource('tesseract://bottleneck/login', readerA).data as { bottleneckScore: number }).bottleneckScore;
    const scoreB = (resolveResource('tesseract://bottleneck/login', readerB).data as { bottleneckScore: number }).bottleneckScore;
    expect(scoreB).toBeGreaterThan(scoreA);
  });
});

// ─── Law 17: Existing Tools Still Work ───

test.describe('Existing Tools Unbroken', () => {
  const existingTools = [
    'list_probed_elements',
    'get_screen_capture',
    'get_knowledge_state',
    'get_queue_items',
    'get_fitness_metrics',
    'get_iteration_status',
  ];

  for (const toolName of existingTools) {
    test(`${toolName} still routes correctly`, () => {
      const server = createDashboardMcpServer(mockMcpServerOptions());
      const result = Effect.runSync(server.handleToolCall({ tool: toolName, arguments: {} }));
      expect(result.isError).toBe(false);
    });
  }
});

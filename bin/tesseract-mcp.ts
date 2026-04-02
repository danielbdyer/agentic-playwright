#!/usr/bin/env node
/**
 * Tesseract MCP Server — stdio transport and speedrun host process.
 *
 * This is the agent's single entry point. Claude Code launches it via .mcp.json.
 * It serves two roles:
 *
 *   1. **Observation**: Read .tesseract/ artifacts from disk (always available)
 *   2. **Host process**: Own the speedrun lifecycle, browser pool, fixture server,
 *      and pipeline event bus. Lifecycle and knowledge tools are available when
 *      the host process is active.
 *
 * The agent workflow:
 *   1. Call start_speedrun to launch the dogfood loop as a background fiber
 *   2. Call get_loop_status / get_queue_items to monitor progress
 *   3. Call approve_work_item / skip_work_item to decide on pending items
 *   4. Call suggest_hint / suggest_locator_alias to contribute knowledge
 *   5. Call get_fitness_metrics to see results
 *   6. Call stop_speedrun to abort early if needed
 */

import { Effect, Fiber } from 'effect';
import {
  createDashboardMcpServer,
  type DashboardMcpServerOptions,
  type SpeedrunStartConfig,
  type LoopStatus,
} from '../lib/infrastructure/mcp/dashboard-mcp-server';
import type { McpToolDefinition } from '../lib/domain/types';
import type { WorkItemDecision } from '../lib/domain/types/dashboard';
import { createProjectPaths } from '../lib/application/paths';
import { multiSeedSpeedrun, type MultiSeedResult } from '../lib/application/speedrun';
import { createLocalServiceContext, type LocalServiceOptions } from '../lib/composition/local-services';
import { createPipelineEventBus } from '../lib/infrastructure/dashboard/pipeline-event-bus';
import { createPlaywrightBrowserPool } from '../lib/infrastructure/playwright-browser-pool';
import { startFixtureServer, type FixtureServer } from '../lib/infrastructure/fixture-server';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/types';
import type { BrowserPoolPort } from '../lib/application/browser-pool';
import type { DashboardPort } from '../lib/application/ports';
import type { KnowledgePosture, PipelineConfig, SpeedrunProgressEvent } from '../lib/domain/types';
import { createHintsWriter } from '../lib/infrastructure/knowledge/hints-writer';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Configuration ───

const argAfter = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1]! : null;
};

const ROOT_DIR = argAfter('--root-dir') ?? process.env.TESSERACT_ROOT ?? process.cwd();
const SUITE_ROOT = path.join(ROOT_DIR, 'dogfood');
const DECISIONS_DIR = path.join(ROOT_DIR, '.tesseract', 'workbench', 'decisions');

// ─── Artifact Reader ───

function readArtifact(relativePath: string): unknown | null {
  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  const normalizedRoot = path.resolve(ROOT_DIR) + path.sep;
  if (!absolutePath.startsWith(normalizedRoot) && absolutePath !== path.resolve(ROOT_DIR)) {
    process.stderr.write(`Blocked path traversal attempt: ${relativePath}\n`);
    return null;
  }
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// ─── Speedrun Host State ───

interface HostState {
  phase: LoopStatus['phase'];
  fiber: Fiber.RuntimeFiber<MultiSeedResult, unknown> | null;
  fixtureServer: FixtureServer | null;
  browserPool: BrowserPoolPort | null;
  dashboardPort: DashboardPort | null;
  pendingDecisions: Map<string, (decision: WorkItemDecision) => void>;
  lastProgress: SpeedrunProgressEvent | null;
  startTime: number | null;
  result: MultiSeedResult | null;
  error: string | null;
}

const hostState: HostState = {
  phase: 'idle',
  fiber: null,
  fixtureServer: null,
  browserPool: null,
  dashboardPort: null,
  pendingDecisions: new Map(),
  lastProgress: null,
  startTime: null,
  result: null,
  error: null,
};

// ─── Screenshot Cache ───

import type { ScreenCapturedEvent } from '../lib/domain/types/dashboard';

let latestScreenshot: ScreenCapturedEvent | null = null;
const screenshotCache = { get: () => latestScreenshot };

// ─── Knowledge Contribution (delegated to infrastructure adapter) ───

const { writeHint, writeLocatorAlias } = createHintsWriter(SUITE_ROOT);

// ─── Speedrun Lifecycle ───

function getLoopStatus(): LoopStatus {
  return {
    phase: hostState.phase,
    iteration: (hostState.lastProgress as Record<string, unknown> | null)?.iteration as number | undefined,
    maxIterations: (hostState.lastProgress as Record<string, unknown> | null)?.maxIterations as number | undefined,
    pendingDecisionCount: hostState.pendingDecisions.size,
    elapsedMs: hostState.startTime ? Date.now() - hostState.startTime : undefined,
    error: hostState.error ?? undefined,
    lastProgress: hostState.lastProgress,
  };
}

async function startSpeedrunHost(config: SpeedrunStartConfig): Promise<{ status: 'started'; seeds: readonly string[]; maxIterations: number }> {
  const seeds = config.seeds?.length ? config.seeds : ['speedrun-v1'];
  const count = config.count ?? 50;
  const maxIterations = config.maxIterations ?? 5;
  const knowledgePosture = (config.knowledgePosture ?? 'warm-start') as KnowledgePosture;
  const interpreterMode = (config.interpreterMode ?? 'playwright') as 'playwright' | 'diagnostic' | 'dry-run';

  hostState.phase = 'running';
  hostState.startTime = Date.now();
  hostState.error = null;
  hostState.result = null;
  hostState.lastProgress = null;

  // Load pipeline config
  const configPath = path.join(ROOT_DIR, 'pipeline.config.json');
  let pipelineConfig: PipelineConfig = DEFAULT_PIPELINE_CONFIG;
  try {
    const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>;
    pipelineConfig = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, overrides);
  } catch { /* use defaults */ }

  const paths = createProjectPaths(ROOT_DIR, SUITE_ROOT);

  // Start fixture server (for Playwright mode)
  if (interpreterMode === 'playwright' && !hostState.fixtureServer) {
    try {
      process.stderr.write('Starting fixture server...\n');
      hostState.fixtureServer = await startFixtureServer({ rootDir: ROOT_DIR });
      process.stderr.write(`Fixture server ready at ${hostState.fixtureServer.baseUrl}\n`);
    } catch (err) {
      process.stderr.write(`Fixture server failed: ${err}\n`);
      // Fall through — the speedrun can still run in diagnostic mode
    }
  }

  // Create browser pool (for Playwright mode)
  if (interpreterMode === 'playwright' && !hostState.browserPool) {
    try {
      process.stderr.write('Creating browser pool...\n');
      hostState.browserPool = await createPlaywrightBrowserPool({
        config: { poolSize: 4, preWarm: true, maxPageAgeMs: 300_000 },
      });
      process.stderr.write('Browser pool ready.\n');
    } catch (err) {
      process.stderr.write(`Browser pool failed: ${err}\n`);
    }
  }

  // Create pipeline event bus for in-memory decision sharing
  const pendingDecisions = hostState.pendingDecisions;

  // Progress callback — updates hostState so get_loop_status is always fresh
  const onProgress = (event: SpeedrunProgressEvent) => {
    hostState.lastProgress = event;
    // Track pending decision state
    if (pendingDecisions.size > 0) {
      hostState.phase = 'paused-for-decisions';
    } else {
      hostState.phase = 'running';
    }
  };

  // Create the DashboardPort that shares pendingDecisions in-memory
  const dashboardPort: DashboardPort = {
    emit: () => Effect.void,
    awaitDecision: (item) => Effect.async<WorkItemDecision, never, never>((resume) => {
      hostState.phase = 'paused-for-decisions';
      process.stderr.write(`[MCP] Awaiting decision for work item: ${item.id} (${item.title})\n`);

      pendingDecisions.set(item.id, (decision) => {
        process.stderr.write(`[MCP] Decision received for ${item.id}: ${decision.status}\n`);
        if (pendingDecisions.size === 0) {
          hostState.phase = 'running';
        }
        resume(Effect.succeed(decision));
      });

      // Auto-skip timeout (120s)
      const timer = setTimeout(() => {
        if (pendingDecisions.has(item.id)) {
          pendingDecisions.delete(item.id);
          const d: WorkItemDecision = {
            workItemId: item.id,
            status: 'skipped',
            rationale: 'Auto-skip (120s timeout — no agent decision received)',
          };
          process.stderr.write(`[MCP] Auto-skipped ${item.id} (timeout)\n`);
          if (pendingDecisions.size === 0) {
            hostState.phase = 'running';
          }
          resume(Effect.succeed(d));
        }
      }, 120_000);

      return Effect.sync(() => {
        clearTimeout(timer);
        pendingDecisions.delete(item.id);
      });
    }),
  };

  hostState.dashboardPort = dashboardPort;

  // Build the service context
  const serviceOptions: LocalServiceOptions = {
    posture: {
      interpreterMode,
      writeMode: 'persist',
      executionProfile: 'dogfood',
    },
    suiteRoot: SUITE_ROOT,
    pipelineConfig,
    dashboard: dashboardPort,
    browserPool: hostState.browserPool ?? undefined,
  };

  const ctx = createLocalServiceContext(ROOT_DIR, serviceOptions);

  // Build the speedrun program
  const program = multiSeedSpeedrun({
    paths,
    config: pipelineConfig,
    seeds: seeds as string[],
    count,
    maxIterations,
    knowledgePosture,
    onProgress,
    interpreterMode,
    baseUrl: hostState.fixtureServer?.baseUrl,
    browserPool: hostState.browserPool ?? undefined,
  });

  // Run as background fiber
  const withServices = ctx.provide(program);
  hostState.fiber = Effect.runFork(withServices);

  // Monitor fiber completion in background
  Effect.runPromise(Fiber.join(hostState.fiber)).then(
    (result) => {
      hostState.phase = 'completed';
      hostState.result = result;
      process.stderr.write(`[MCP] Speedrun completed. Scorecard ${result.scorecardUpdated ? 'UPDATED' : 'unchanged'}.\n`);
    },
    (error) => {
      hostState.phase = 'failed';
      hostState.error = String(error);
      process.stderr.write(`[MCP] Speedrun failed: ${error}\n`);
    },
  );

  return { status: 'started', seeds, maxIterations };
}

async function stopSpeedrunHost(): Promise<void> {
  if (hostState.fiber) {
    Effect.runFork(Fiber.interrupt(hostState.fiber));
    hostState.fiber = null;
  }
  hostState.phase = 'idle';
  hostState.pendingDecisions.clear();
  process.stderr.write('[MCP] Speedrun stopped.\n');
}

// ─── Create MCP Server ───

const mcpOptions: DashboardMcpServerOptions = {
  readArtifact,
  screenshotCache,
  pendingDecisions: hostState.pendingDecisions,
  broadcast: () => {},
  // Lifecycle callbacks
  startSpeedrun: startSpeedrunHost,
  stopSpeedrun: stopSpeedrunHost,
  getLoopStatus,
  // Knowledge contribution callbacks
  writeHint,
  writeLocatorAlias,
};

const mcpServer = createDashboardMcpServer(mcpOptions);

// ─── JSON-RPC Stdio Protocol ───

interface JsonRpcRequest {
  readonly jsonrpc: '2.0';
  readonly id: number | string;
  readonly method: string;
  readonly params?: Record<string, unknown>;
}

function sendResponse(id: number | string, result: unknown): void {
  const response = JSON.stringify({ jsonrpc: '2.0', id, result });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
}

function sendError(id: number | string, code: number, message: string): void {
  const response = JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(response)}\r\n\r\n${response}`);
}

function mcpToolToJsonSchema(tool: McpToolDefinition) {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  };
}

async function handleRequest(request: JsonRpcRequest): Promise<void> {
  switch (request.method) {
    case 'initialize': {
      sendResponse(request.id, {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'tesseract-dashboard',
          version: '0.2.0',
        },
      });
      break;
    }

    case 'notifications/initialized': {
      break;
    }

    case 'tools/list': {
      const tools = Effect.runSync(mcpServer.listTools());
      sendResponse(request.id, {
        tools: tools.map(mcpToolToJsonSchema),
      });
      break;
    }

    case 'tools/call': {
      const params = request.params as { name: string; arguments?: Record<string, unknown> } | undefined;
      if (!params?.name) {
        sendError(request.id, -32602, 'Missing tool name');
        break;
      }

      const result = Effect.runSync(mcpServer.handleToolCall({
        tool: params.name,
        arguments: params.arguments ?? {},
      }));
      sendResponse(request.id, {
        content: [{ type: 'text', text: JSON.stringify(result.result, null, 2) }],
        isError: result.isError,
      });
      break;
    }

    default: {
      if (request.id !== undefined) {
        sendError(request.id, -32601, `Method not found: ${request.method}`);
      }
    }
  }
}

// ─── Stdio Transport (Content-Length framing) ───

const MAX_BUFFER_SIZE = 10 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 30_000;

let buffer = '';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  buffer += line + '\n';

  if (Buffer.byteLength(buffer) > MAX_BUFFER_SIZE) {
    process.stderr.write(`Buffer exceeded ${MAX_BUFFER_SIZE} bytes, resetting\n`);
    buffer = '';
    return;
  }

  const trimmed = buffer.trim();
  if (!trimmed) return;

  if (trimmed.startsWith('Content-Length:')) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return;
    const bodyStart = headerEnd + 4;
    const contentLengthMatch = buffer.match(/Content-Length:\s*(\d+)/);
    if (!contentLengthMatch) return;
    const contentLength = parseInt(contentLengthMatch[1]!, 10);
    const body = buffer.slice(bodyStart);
    if (Buffer.byteLength(body) < contentLength) return;
    const jsonStr = body.slice(0, contentLength);
    buffer = body.slice(contentLength);
    try {
      const request = JSON.parse(jsonStr) as JsonRpcRequest;
      const timer = setTimeout(() => {
        sendError(request.id, -32000, 'Request timed out');
      }, REQUEST_TIMEOUT_MS);
      handleRequest(request).catch((err) => {
        process.stderr.write(`Error handling request: ${err}\n`);
      }).finally(() => clearTimeout(timer));
    } catch {
      process.stderr.write('Failed to parse JSON-RPC request\n');
    }
    return;
  }

  try {
    const request = JSON.parse(trimmed) as JsonRpcRequest;
    buffer = '';
    const timer = setTimeout(() => {
      sendError(request.id, -32000, 'Request timed out');
    }, REQUEST_TIMEOUT_MS);
    handleRequest(request).catch((err) => {
      process.stderr.write(`Error handling request: ${err}\n`);
    }).finally(() => clearTimeout(timer));
  } catch {
    // Not yet a complete JSON object — keep buffering
  }
});

// ─── Graceful Shutdown ───

async function shutdown(): Promise<void> {
  if (hostState.fiber) {
    Effect.runFork(Fiber.interrupt(hostState.fiber));
  }
  if (hostState.browserPool) {
    await hostState.browserPool.close().catch(() => {});
  }
  if (hostState.fixtureServer) {
    await hostState.fixtureServer.stop().catch(() => {});
  }
}

process.on('SIGINT', () => { shutdown().then(() => process.exit(0)); });
process.on('SIGTERM', () => { shutdown().then(() => process.exit(0)); });
process.on('exit', () => { shutdown().catch(() => {}); });

process.stderr.write('Tesseract MCP server started (stdio, host-mode)\n');

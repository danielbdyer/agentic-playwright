#!/usr/bin/env node
/**
 * Tesseract MCP Server — stdio transport and speedrun host process.
 *
 * This is the agent's single entry point. Claude Code launches it via .mcp.json.
 * It serves two roles:
 *
 *   1. **Observation**: Read .tesseract/ artifacts from disk (always available)
 *   2. **Host process**: Own the speedrun lifecycle, browser pool, fixture server,
 *      and in-memory decision bridge. Lifecycle and knowledge tools are available.
 *
 * The agent workflow:
 *   1. Call start_speedrun to launch the dogfood loop as a background fiber
 *   2. Receive push notifications when decisions are pending (tools/list_changed)
 *   3. Call get_decision_context for rich context, then approve/skip
 *   4. Call suggest_hint / suggest_locator_alias to contribute knowledge
 *   5. Call get_contribution_impact to see if contributions helped
 *   6. Call get_fitness_metrics to see results
 */

import { Effect, Fiber } from 'effect';
import {
  createDashboardMcpServer,
  type DashboardMcpServerOptions,
  type SpeedrunStartConfig,
  type LoopStatus,
} from '../lib/infrastructure/mcp/dashboard-mcp-server';
import type { McpToolDefinition } from '../lib/domain/types';
import type { WorkItemDecision } from '../lib/domain/observation/dashboard';
import type { ScreenCapturedEvent } from '../lib/domain/observation/dashboard';
import { createProjectPaths } from '../lib/application/paths';
import { multiSeedSpeedrun, type MultiSeedResult } from '../lib/application/improvement/speedrun';
import { createLocalServiceContext, type LocalServiceOptions } from '../lib/composition/local-services';
import { createPlaywrightBrowserPool } from '../lib/infrastructure/runtime/playwright-browser-pool';
import { startFixtureServer, type FixtureServer } from '../lib/infrastructure/tooling/fixture-server';
import { createHintsWriter } from '../lib/infrastructure/knowledge/hints-writer';
import { DEFAULT_PIPELINE_CONFIG, mergePipelineConfig } from '../lib/domain/types';
import type { BrowserPoolPort } from '../lib/application/runtime-support/browser-pool';
import type { DashboardPort } from '../lib/application/ports';
import type { KnowledgePosture, PipelineConfig, SpeedrunProgressEvent } from '../lib/domain/types';
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
  config: SpeedrunStartConfig | null;
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
  config: null,
};

// ─── Screenshot Cache ───

let latestScreenshot: ScreenCapturedEvent | null = null;
const screenshotCache = { get: () => latestScreenshot };

// ─── Knowledge Contribution (delegated to infrastructure adapter) ───

const { writeHint, writeLocatorAlias } = createHintsWriter(SUITE_ROOT);

// ─── MCP Push Notifications ───

/** Send a JSON-RPC notification to the client (no id, no response expected). */
function sendNotification(method: string, params?: Record<string, unknown>): void {
  const notification = JSON.stringify({
    jsonrpc: '2.0',
    method,
    ...(params ? { params } : {}),
  });
  process.stdout.write(`Content-Length: ${Buffer.byteLength(notification)}\r\n\r\n${notification}`);
}

/**
 * Notify the client that the tool list may have changed.
 * Claude Code responds by re-fetching tools, which triggers re-engagement.
 */
function notifyToolsChanged(): void {
  sendNotification('notifications/tools/list_changed');
}

// ─── Speedrun Lifecycle ───

function getLoopStatus(): LoopStatus {
  const progress = hostState.lastProgress as Record<string, unknown> | null;
  return {
    phase: hostState.phase,
    iteration: progress?.iteration as number | undefined,
    maxIterations: progress?.maxIterations as number | undefined,
    pendingDecisionCount: hostState.pendingDecisions.size,
    elapsedMs: hostState.startTime ? Date.now() - hostState.startTime : undefined,
    error: hostState.error ?? undefined,
    lastProgress: hostState.lastProgress,
  };
}

/**
 * Start the speedrun loop. Blocks through infrastructure setup (fixture server,
 * browser pool) so the caller sees errors immediately. The dogfood loop itself
 * runs as a background fiber.
 */
async function startSpeedrunHost(config: SpeedrunStartConfig): Promise<{ status: 'started'; seeds: readonly string[]; maxIterations: number }> {
  const seeds = config.seeds?.length ? config.seeds : ['speedrun-v1'];
  const count = config.count ?? 50;
  const maxIterations = config.maxIterations ?? 5;
  const knowledgePosture = (config.knowledgePosture ?? 'warm-start') as KnowledgePosture;
  const interpreterMode = (config.interpreterMode ?? 'playwright') as 'playwright' | 'diagnostic' | 'dry-run';

  // Item 7: Extract configuration from start config
  const poolSize = (config as Record<string, unknown>).poolSize as number | undefined ?? 4;
  const decisionTimeoutMs = (config as Record<string, unknown>).decisionTimeoutMs as number | undefined ?? 120_000;
  const headed = (config as Record<string, unknown>).headed as boolean | undefined ?? false;
  const baseUrlOverride = (config as Record<string, unknown>).baseUrl as string | undefined;

  hostState.phase = 'running';
  hostState.startTime = Date.now();
  hostState.error = null;
  hostState.result = null;
  hostState.lastProgress = null;
  hostState.config = config;

  // Load pipeline config
  const configPath = path.join(ROOT_DIR, 'pipeline.config.json');
  let pipelineConfig: PipelineConfig = DEFAULT_PIPELINE_CONFIG;
  try {
    const overrides = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Partial<PipelineConfig>;
    pipelineConfig = mergePipelineConfig(DEFAULT_PIPELINE_CONFIG, overrides);
  } catch { /* use defaults */ }

  const paths = createProjectPaths(ROOT_DIR, SUITE_ROOT);

  // Item 4: Synchronous infrastructure setup — block until ready or fail
  // Start fixture server (for Playwright mode, unless baseUrl overridden)
  if (interpreterMode === 'playwright' && !baseUrlOverride && !hostState.fixtureServer) {
    process.stderr.write('[MCP] Starting fixture server...\n');
    hostState.fixtureServer = await startFixtureServer({ rootDir: ROOT_DIR });
    process.stderr.write(`[MCP] Fixture server ready at ${hostState.fixtureServer.baseUrl}\n`);
  }

  // Create browser pool (for Playwright mode)
  if (interpreterMode === 'playwright' && !hostState.browserPool) {
    process.stderr.write(`[MCP] Creating browser pool (size=${poolSize}, headed=${headed})...\n`);
    hostState.browserPool = await createPlaywrightBrowserPool({
      config: { poolSize, preWarm: true, maxPageAgeMs: 300_000 },
      headless: !headed,
    });
    process.stderr.write('[MCP] Browser pool ready.\n');
  }

  const resolvedBaseUrl = baseUrlOverride ?? hostState.fixtureServer?.baseUrl;
  const pendingDecisions = hostState.pendingDecisions;

  // Progress callback — updates hostState and notifies client
  const onProgress = (event: SpeedrunProgressEvent) => {
    hostState.lastProgress = event;
    if (pendingDecisions.size > 0) {
      hostState.phase = 'paused-for-decisions';
    } else {
      hostState.phase = 'running';
    }
  };

  // Item 3: Consolidated DashboardPort with configurable timeout
  const dashboardPort: DashboardPort = {
    emit: () => Effect.void,
    awaitDecision: (item) => Effect.async<WorkItemDecision, never, never>((resume) => {
      hostState.phase = 'paused-for-decisions';
      process.stderr.write(`[MCP] Awaiting decision: ${item.id} (${item.title})\n`);

      pendingDecisions.set(item.id, (decision) => {
        process.stderr.write(`[MCP] Decision received: ${item.id} → ${decision.status}\n`);
        if (pendingDecisions.size === 0) {
          hostState.phase = 'running';
        }
        resume(Effect.succeed(decision));
      });

      // Item 2: Push notification — tell the client decisions are pending
      notifyToolsChanged();

      // Configurable auto-skip timeout
      const timer = setTimeout(() => {
        if (pendingDecisions.has(item.id)) {
          pendingDecisions.delete(item.id);
          const d: WorkItemDecision = {
            workItemId: item.id,
            status: 'skipped',
            rationale: `Auto-skip (${decisionTimeoutMs}ms timeout — no agent decision received)`,
          };
          process.stderr.write(`[MCP] Auto-skipped ${item.id} (${decisionTimeoutMs}ms timeout)\n`);
          if (pendingDecisions.size === 0) {
            hostState.phase = 'running';
          }
          resume(Effect.succeed(d));
        }
      }, decisionTimeoutMs);

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
      headed,
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
    baseUrl: resolvedBaseUrl,
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
      notifyToolsChanged(); // Notify client that loop completed
    },
    (error) => {
      hostState.phase = 'failed';
      hostState.error = String(error);
      process.stderr.write(`[MCP] Speedrun failed: ${error}\n`);
      notifyToolsChanged(); // Notify client that loop failed
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
        capabilities: { tools: {}, resources: {}, notifications: {} },
        serverInfo: {
          name: 'tesseract-dashboard',
          version: '0.3.0',
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

    case 'resources/list': {
      const resources = Effect.runSync(mcpServer.listResources());
      sendResponse(request.id, { resources });
      break;
    }

    case 'resources/read': {
      const params = request.params as { uri?: string } | undefined;
      if (!params?.uri) {
        sendError(request.id, -32602, 'Missing resource URI');
        break;
      }
      try {
        const content = Effect.runSync(mcpServer.readResource(params.uri));
        sendResponse(request.id, { contents: [content] });
      } catch (err) {
        sendError(request.id, -32002, String(err));
      }
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

// ─── Graceful Shutdown (Item 5) ───

let shuttingDown = false;

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stderr.write('[MCP] Shutting down...\n');

  // Interrupt the speedrun fiber
  if (hostState.fiber) {
    try {
      Effect.runFork(Fiber.interrupt(hostState.fiber));
      hostState.fiber = null;
    } catch { /* ignore interrupt errors */ }
  }

  // Close browser pool (returns pages, closes browser)
  if (hostState.browserPool) {
    try {
      const stats = hostState.browserPool.stats;
      process.stderr.write(`[MCP] Browser pool stats: acquired=${stats.totalAcquired} released=${stats.totalReleased}\n`);
      await hostState.browserPool.close();
      process.stderr.write('[MCP] Browser pool closed.\n');
    } catch (err) {
      process.stderr.write(`[MCP] Browser pool close error: ${err}\n`);
    }
    hostState.browserPool = null;
  }

  // Stop fixture server (kills child process)
  if (hostState.fixtureServer) {
    try {
      await hostState.fixtureServer.stop();
      process.stderr.write('[MCP] Fixture server stopped.\n');
    } catch (err) {
      process.stderr.write(`[MCP] Fixture server stop error: ${err}\n`);
    }
    hostState.fixtureServer = null;
  }

  process.stderr.write('[MCP] Shutdown complete.\n');
}

// SIGINT/SIGTERM: async cleanup then exit
process.on('SIGINT', () => {
  shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
  // Safety net: force exit after 5s if cleanup hangs
  setTimeout(() => process.exit(1), 5000).unref();
});

process.on('SIGTERM', () => {
  shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
  setTimeout(() => process.exit(1), 5000).unref();
});

// stdin close (parent process died)
process.stdin.on('end', () => {
  shutdown().then(() => process.exit(0)).catch(() => process.exit(1));
});

process.stderr.write('Tesseract MCP server started (stdio, host-mode)\n');

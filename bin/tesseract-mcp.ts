#!/usr/bin/env node
/**
 * Tesseract MCP Server — stdio transport for Claude Code / VSCode Copilot.
 *
 * Wraps the Dashboard MCP Server (internal McpServerPort) in the JSON-RPC
 * stdio protocol that Claude Code and VSCode extensions expect.
 *
 * Usage:
 *   node dist/bin/tesseract-mcp.js [--root-dir <path>]
 *
 * This is the entry point referenced by .mcp.json for agent integration.
 */

import { Effect } from 'effect';
import { createDashboardMcpServer, type DashboardMcpServerOptions } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import type { McpToolDefinition } from '../lib/domain/types';
import type { WorkItemDecision } from '../lib/domain/types/dashboard';
import { writeDecisionFile } from '../lib/infrastructure/dashboard/file-decision-bridge';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';

// ─── Configuration ───

const argAfter = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1]! : null;
};

const ROOT_DIR = argAfter('--root-dir') ?? process.env.TESSERACT_ROOT ?? process.cwd();
const DECISIONS_DIR = path.join(ROOT_DIR, '.tesseract', 'workbench', 'decisions');

// ─── Artifact Reader ───

function readArtifact(relativePath: string): unknown | null {
  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  // Guard against path traversal: resolved path must stay within ROOT_DIR
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

// ─── Create Dashboard MCP Server ───

const options: DashboardMcpServerOptions = {
  readArtifact,
  screenshotCache: { get: () => null },
  pendingDecisions: new Map(),
  broadcast: () => {},
};

const mcpServer = createDashboardMcpServer(options);

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
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: 'tesseract-dashboard',
          version: '0.1.0',
        },
      });
      break;
    }

    case 'notifications/initialized': {
      // Client acknowledgement — no response needed
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

      // Intercept decision tools: write to filesystem instead of in-memory Map.
      // The speedrun process watches for these files and resumes paused fibers.
      if (params.name === 'approve_work_item' || params.name === 'skip_work_item') {
        const workItemId = (params.arguments?.workItemId) as string;
        if (!workItemId) { sendError(request.id, -32602, 'workItemId is required'); break; }
        const decision: WorkItemDecision = {
          workItemId,
          status: params.name === 'approve_work_item' ? 'completed' : 'skipped',
          rationale: (params.arguments?.rationale as string) ?? `${params.name} via MCP`,
        };
        writeDecisionFile(DECISIONS_DIR, decision);
        sendResponse(request.id, {
          content: [{ type: 'text', text: JSON.stringify({ ok: true, workItemId, status: decision.status }) }],
          isError: false,
        });
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

/** Maximum buffer size (10 MB) to prevent memory exhaustion from malformed input. */
const MAX_BUFFER_SIZE = 10 * 1024 * 1024;
/** Request handling timeout (30s). */
const REQUEST_TIMEOUT_MS = 30_000;

let buffer = '';

const rl = readline.createInterface({ input: process.stdin });

rl.on('line', (line) => {
  buffer += line + '\n';

  // Guard against unbounded buffer growth from malformed input
  if (Buffer.byteLength(buffer) > MAX_BUFFER_SIZE) {
    process.stderr.write(`Buffer exceeded ${MAX_BUFFER_SIZE} bytes, resetting\n`);
    buffer = '';
    return;
  }

  // Try to parse complete JSON-RPC messages from the buffer.
  // MCP uses Content-Length framing, but also works with newline-delimited JSON.
  const trimmed = buffer.trim();
  if (!trimmed) return;

  // Handle Content-Length framing
  if (trimmed.startsWith('Content-Length:')) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) return; // Wait for full header
    const bodyStart = headerEnd + 4;
    const contentLengthMatch = buffer.match(/Content-Length:\s*(\d+)/);
    if (!contentLengthMatch) return;
    const contentLength = parseInt(contentLengthMatch[1]!, 10);
    const body = buffer.slice(bodyStart);
    if (Buffer.byteLength(body) < contentLength) return; // Wait for full body
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
      process.stderr.write(`Failed to parse JSON-RPC request\n`);
    }
    return;
  }

  // Try newline-delimited JSON (simpler framing)
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

process.stderr.write('Tesseract MCP server started (stdio)\n');

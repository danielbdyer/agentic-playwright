#!/usr/bin/env npx tsx
/**
 * Direct MCP tool caller — bypasses stdio transport.
 *
 * Thin CLI wrapper: parse args → call MCP server handler → print result.
 * All domain logic lives in the MCP server itself (dashboard-mcp-server.ts).
 *
 * Usage: npx tsx scripts/mcp-call.ts <tool-name> [json-args]
 * Example: npx tsx scripts/mcp-call.ts get_learning_summary
 * Example: npx tsx scripts/mcp-call.ts list_proposals '{"status":"activated"}'
 * Example: npx tsx scripts/mcp-call.ts approve_work_item '{"workItemId":"abc","rationale":"..."}'
 */

import { Effect } from 'effect';
import { createDashboardMcpServer } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import { createHintsWriter } from '../lib/infrastructure/knowledge/hints-writer';
import { createProjectPaths } from '../lib/application/paths';
import type { ScreenCapturedEvent } from '../lib/domain/observation/dashboard';
import * as fs from 'fs';
import * as path from 'path';

const ROOT_DIR = process.cwd();
const SUITE_ROOT = path.join(ROOT_DIR, 'dogfood');
const paths = createProjectPaths(ROOT_DIR, SUITE_ROOT);

function readArtifact(relativePath: string): unknown | null {
  const absolutePath = path.resolve(ROOT_DIR, relativePath);
  try {
    const content = fs.readFileSync(absolutePath, 'utf-8');
    if (absolutePath.endsWith('.json')) return JSON.parse(content);
    if (absolutePath.endsWith('.jsonl')) return content;
    return content;
  } catch {
    return null;
  }
}

const { writeHint, writeLocatorAlias } = createHintsWriter(SUITE_ROOT);

const server = createDashboardMcpServer({
  readArtifact,
  screenshotCache: { get: () => null as ScreenCapturedEvent | null },
  pendingDecisions: new Map(),
  broadcast: () => {},
  writeHint,
  writeLocatorAlias,
  decisionsDir: paths.decisionsDir,
});

const toolName = process.argv[2];

async function main() {
  if (!toolName) {
    const tools = await Effect.runPromise(server.listTools());
    console.log(JSON.stringify({ tools: tools.map(t => ({ name: t.name, category: t.category, description: t.description.slice(0, 80) })) }, null, 2));
    process.exit(0);
  }

  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

  const result = await Effect.runPromise(
    server.handleToolCall({ tool: toolName, arguments: args }),
  );

  console.log(JSON.stringify(result.result, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });

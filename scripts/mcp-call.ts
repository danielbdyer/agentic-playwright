#!/usr/bin/env npx tsx
/**
 * Direct MCP tool caller — bypasses stdio transport.
 *
 * Usage: npx tsx scripts/mcp-call.ts <tool-name> [json-args]
 * Example: npx tsx scripts/mcp-call.ts get_learning_summary
 * Example: npx tsx scripts/mcp-call.ts list_proposals '{"status":"activated"}'
 */

import { Effect } from 'effect';
import { createDashboardMcpServer } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import { createHintsWriter } from '../lib/infrastructure/knowledge/hints-writer';
import { writeDecisionFile } from '../lib/infrastructure/dashboard/file-decision-bridge';
import { createProjectPaths } from '../lib/application/paths';
import type { ScreenCapturedEvent, WorkItemDecision } from '../lib/domain/types/dashboard';
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
});

const toolName = process.argv[2];

// ─── File-bridge intercept for cross-process decisions ───
// When a speedrun is running with --mcp-decisions, approve_work_item and
// skip_work_item need to write decision files instead of resolving in-memory
// callbacks (which don't exist in this standalone process).

const FILE_BRIDGE_TOOLS = new Set(['approve_work_item', 'skip_work_item']);

function handleFileBridgeDecision(tool: string, args: Record<string, unknown>): void {
  const workItemId = args.workItemId as string;
  if (!workItemId) {
    console.error(JSON.stringify({ error: 'workItemId is required' }));
    process.exit(1);
  }
  const decision: WorkItemDecision = {
    workItemId,
    status: tool === 'approve_work_item' ? 'completed' : 'skipped',
    rationale: (args.rationale as string) ?? `${tool} via bridge`,
  };
  writeDecisionFile(paths.decisionsDir, decision);
  console.log(JSON.stringify({ ok: true, ...decision, writtenTo: paths.decisionsDir }));
}

async function main() {
  if (!toolName) {
    const tools = await Effect.runPromise(server.listTools());
    console.log(JSON.stringify({ tools: tools.map(t => ({ name: t.name, category: t.category, description: t.description.slice(0, 80) })) }, null, 2));
    process.exit(0);
  }

  const args = process.argv[3] ? JSON.parse(process.argv[3]) : {};

  // File-bridge intercept: write decision files for a running --mcp-decisions speedrun
  if (FILE_BRIDGE_TOOLS.has(toolName)) {
    handleFileBridgeDecision(toolName, args);
    return;
  }

  const result = await Effect.runPromise(
    server.handleToolCall({ tool: toolName, arguments: args }),
  );

  console.log(JSON.stringify(result.result, null, 2));
}

main().catch((err) => { console.error(err); process.exit(1); });

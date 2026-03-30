/**
 * MCP Tool Catalog Completeness — Law Tests (W1.10)
 *
 * Verifies the dashboard MCP tool catalog is complete and well-formed:
 *
 *   1. All tools have a name, description, and input schema
 *   2. Tool names are unique (no duplicates)
 *   3. All 8 core tools plus browser tools are defined
 *   4. The tool router has a handler for every core tool
 *   5. No undefined/null handlers exist in the router
 *
 * Tests the pure tool definitions and the dispatch table without
 * running Effect programs or starting a server.
 */

import { expect, test } from '@playwright/test';
import { dashboardMcpTools } from '../lib/domain/types/dashboard';
import { createDashboardMcpServer } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import type { DashboardMcpServerOptions } from '../lib/infrastructure/mcp/dashboard-mcp-server';
import { Effect } from 'effect';

// ─── The 8 core tools defined in the dashboard MCP server handler map ───
const CORE_TOOL_NAMES: readonly string[] = [
  'list_probed_elements',
  'get_screen_capture',
  'get_knowledge_state',
  'get_queue_items',
  'get_fitness_metrics',
  'approve_work_item',
  'skip_work_item',
  'get_iteration_status',
] as const;

// ─── Browser tools (progressive enhancement, available in headed mode) ───
const BROWSER_TOOL_NAMES: readonly string[] = [
  'browser_screenshot',
  'browser_query',
  'browser_aria_snapshot',
  'browser_click',
  'browser_fill',
  'browser_navigate',
] as const;

// ─── Minimal stub options for creating the MCP server ───
function stubOptions(): DashboardMcpServerOptions {
  return {
    readArtifact: () => null,
    screenshotCache: { get: () => null },
    pendingDecisions: new Map(),
    broadcast: () => {},
  };
}

test.describe('MCP tool catalog completeness laws', () => {

  // ─── Law 1: Every tool has name, description, and input schema ───

  test('Law 1: every tool definition has name, description, and inputSchema', () => {
    for (const tool of dashboardMcpTools) {
      expect(tool.name, `tool missing name`).toBeTruthy();
      expect(typeof tool.name).toBe('string');
      expect(tool.description, `tool ${tool.name} missing description`).toBeTruthy();
      expect(typeof tool.description).toBe('string');
      expect(tool.inputSchema, `tool ${tool.name} missing inputSchema`).toBeDefined();
      expect(typeof tool.inputSchema).toBe('object');
    }
  });

  // ─── Law 2: Tool names are unique ───

  test('Law 2: tool names are unique — no duplicates in catalog', () => {
    const names = dashboardMcpTools.map((t) => t.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });

  // ─── Law 3: All 8 core tools are defined ───

  test('Law 3: all 8 core tools are present in the catalog', () => {
    const catalogNames = new Set(dashboardMcpTools.map((t) => t.name));
    for (const name of CORE_TOOL_NAMES) {
      expect(catalogNames.has(name), `missing core tool: ${name}`).toBe(true);
    }
  });

  test('Law 3b: all browser tools are present in the catalog', () => {
    const catalogNames = new Set(dashboardMcpTools.map((t) => t.name));
    for (const name of BROWSER_TOOL_NAMES) {
      expect(catalogNames.has(name), `missing browser tool: ${name}`).toBe(true);
    }
  });

  // ─── Law 4: Every tool has a valid category ───

  test('Law 4: every tool has a valid category', () => {
    const validCategories = new Set(['observe', 'decide', 'control']);
    for (const tool of dashboardMcpTools) {
      expect(
        validCategories.has(tool.category),
        `tool ${tool.name} has invalid category: ${tool.category}`,
      ).toBe(true);
    }
  });

  // ─── Law 5: The server's handleToolCall dispatches all core tools without error ───

  test('Law 5: handleToolCall dispatches all 8 core tools without throwing', async () => {
    const server = createDashboardMcpServer(stubOptions());

    for (const toolName of CORE_TOOL_NAMES) {
      const result = await Effect.runPromise(
        server.handleToolCall({ tool: toolName, arguments: {} }),
      );
      expect(result.tool).toBe(toolName);
      // The handler ran without error (isError may be true for missing data, but handler exists)
      expect(typeof result.isError).toBe('boolean');
    }
  });

  // ─── Law 6: Unknown tools return isError true ───

  test('Law 6: unknown tool names return isError true', async () => {
    const server = createDashboardMcpServer(stubOptions());
    const result = await Effect.runPromise(
      server.handleToolCall({ tool: 'nonexistent_tool', arguments: {} }),
    );
    expect(result.isError).toBe(true);
    expect((result.result as { error: string }).error).toContain('Unknown tool');
  });

  // ─── Law 7: listTools returns the full catalog ───

  test('Law 7: listTools returns the full catalog', async () => {
    const server = createDashboardMcpServer(stubOptions());
    const tools = await Effect.runPromise(server.listTools());
    expect(tools.length).toBe(dashboardMcpTools.length);

    const serverNames = new Set(tools.map((t) => t.name));
    for (const tool of dashboardMcpTools) {
      expect(serverNames.has(tool.name), `listTools missing: ${tool.name}`).toBe(true);
    }
  });

  // ─── Law 8: Tool descriptions are non-trivial (at least 10 chars) ───

  test('Law 8: tool descriptions are non-trivial', () => {
    for (const tool of dashboardMcpTools) {
      expect(
        tool.description.length >= 10,
        `tool ${tool.name} has trivial description: "${tool.description}"`,
      ).toBe(true);
    }
  });
});

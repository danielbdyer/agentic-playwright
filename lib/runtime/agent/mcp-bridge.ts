/**
 * MCP Bridge — gives the internal agent interpreter (Rung 9) the same
 * tool access as external MCP agents.
 *
 * Architecture:
 *   External agents invoke MCP tools via the MCP protocol (JSON-RPC).
 *   The internal agent interpreter at Rung 9 needs the same capabilities
 *   but without the protocol overhead. This bridge maps MCP tool definitions
 *   to callable functions that return structured results.
 *
 * The bridge is a pure adapter: it takes MCP tool definitions and a tool
 * invocation function, and produces an AgentToolProvider that the internal
 * agent can call directly.
 *
 * Design: Strategy pattern — the bridge is one provider implementation.
 * The agent interpreter selects its tool provider at composition time.
 */

import { Effect } from 'effect';
import type { McpToolDefinition } from '../../domain/types';
import type { McpToolInvocation, McpToolResult } from '../../application/ports';

// ─── Agent Tool Provider Contract ───

/** A single tool available to the internal agent. */
export interface AgentTool {
  readonly name: string;
  readonly category: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly invoke: (args: Record<string, unknown>) => Promise<AgentToolResult>;
}

/** Result of an agent tool invocation. */
export interface AgentToolResult {
  readonly tool: string;
  readonly result: unknown;
  readonly isError: boolean;
  /** Provenance tag for tracing which tool produced this result. */
  readonly source: 'mcp-bridge';
}

/** Provider that gives the internal agent access to tools. */
export interface AgentToolProvider {
  /** All available tools with their schemas. */
  readonly tools: readonly AgentTool[];
  /** Look up a tool by name. Returns undefined if not found. */
  readonly getTool: (name: string) => AgentTool | undefined;
  /** Invoke a tool by name with arguments. */
  readonly invoke: (name: string, args: Record<string, unknown>) => Promise<AgentToolResult>;
  /** Number of available tools. */
  readonly toolCount: number;
  /** Optional release hook for lifecycle-managed providers. */
  readonly release?: (() => Promise<void>) | undefined;
}

// ─── Tool Invocation Adapter ───

/**
 * Adapter function type — routes tool calls to the MCP server.
 * This is injected at composition time so the bridge does not
 * depend on a specific MCP server implementation.
 */
export type McpToolInvoker = (invocation: McpToolInvocation) => Promise<McpToolResult>;

export interface McpBridgeLifecycle {
  readonly release?: (() => Promise<void>) | undefined;
}

// ─── Bridge Factory ───

/**
 * Create a tool from an MCP definition and an invoker.
 * Pure function — no side effects.
 */
function createAgentTool(
  definition: McpToolDefinition,
  invoker: McpToolInvoker,
): AgentTool {
  return {
    name: definition.name,
    category: definition.category,
    description: definition.description,
    inputSchema: definition.inputSchema,
    invoke: async (args) => {
      const mcpResult = await invoker({ tool: definition.name, arguments: args });
      return {
        tool: mcpResult.tool,
        result: mcpResult.result,
        isError: mcpResult.isError,
        source: 'mcp-bridge' as const,
      };
    },
  };
}

/**
 * Create an AgentToolProvider that bridges MCP tools to the internal agent.
 *
 * The bridge maps each MCP tool definition to a callable AgentTool.
 * Tool invocations are routed through the provided invoker function,
 * which typically calls the dashboard MCP server's handleToolCall.
 *
 * Usage:
 *   const mcpServer = createDashboardMcpServer(options);
 *   const tools = await Effect.runPromise(mcpServer.listTools());
 *   const invoker = async (inv) => Effect.runPromise(mcpServer.handleToolCall(inv));
 *   const provider = createInternalMCPBridge(tools, invoker);
 *   // Agent can now call provider.invoke('get_knowledge_state', { screen: 'login' })
 */
export function createInternalMCPBridge(
  tools: readonly McpToolDefinition[],
  invoker: McpToolInvoker,
  lifecycle?: McpBridgeLifecycle,
): AgentToolProvider {
  const agentTools = tools.map((def) => createAgentTool(def, invoker));
  const toolIndex = new Map(agentTools.map((t) => [t.name, t]));

  const notFoundResult = (name: string): AgentToolResult => ({
    tool: name,
    result: { error: `Tool "${name}" not found in MCP bridge. Available: ${agentTools.map((t) => t.name).join(', ')}` },
    isError: true,
    source: 'mcp-bridge' as const,
  });

  return {
    tools: agentTools,
    toolCount: agentTools.length,
    getTool: (name) => toolIndex.get(name),
    invoke: async (name, args) => {
      const tool = toolIndex.get(name);
      return tool
        ? tool.invoke(args)
        : notFoundResult(name);
    },
    release: lifecycle?.release,
  };
}

/**
 * Scoped internal MCP bridge constructor.
 * Ensures bridge-level cleanup executes on scope close and disables usage after release.
 */
export function createScopedInternalMCPBridge(
  tools: readonly McpToolDefinition[],
  invoker: McpToolInvoker,
  lifecycle?: McpBridgeLifecycle,
){
  return Effect.acquireRelease(
    Effect.sync(() => {
      const bridge = createInternalMCPBridge(tools, invoker, lifecycle);
      const state: { closed: boolean } = { closed: false };
      return {
        ...bridge,
        getTool: (name: string) => (state.closed ? undefined : bridge.getTool(name)),
        invoke: (name: string, args: Record<string, unknown>) => state.closed
          ? Promise.resolve({
              tool: name,
              result: { error: 'MCP bridge handle is closed' },
              isError: true,
              source: 'mcp-bridge' as const,
            })
          : bridge.invoke(name, args),
        release: async () => {
          state.closed = true;
          await bridge.release?.();
        },
      };
    }),
    (bridge) => bridge.release
      ? Effect.promise(() => bridge.release!()).pipe(Effect.catchAll(() => Effect.void))
      : Effect.void,
  );
}

/**
 * Create a disabled AgentToolProvider (no tools available).
 * Used when no MCP server is configured.
 */
export function createDisabledToolProvider(): AgentToolProvider {
  return {
    tools: [],
    toolCount: 0,
    getTool: () => undefined,
    invoke: async (name) => ({
      tool: name,
      result: { error: 'MCP bridge is disabled — no tools available' },
      isError: true,
      source: 'mcp-bridge' as const,
    }),
  };
}

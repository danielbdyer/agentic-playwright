/**
 * MCP Internal Bridge — Law Tests
 *
 * Pure function invariants for the bridge that gives the internal agent
 * interpreter (Rung 9) the same tool access as external MCP agents.
 *
 * Laws tested:
 *   1. Bridge creation: creates callable tools from MCP definitions
 *   2. Tool lookup: getTool finds by name, returns undefined for unknown
 *   3. Tool invocation: invoke routes through the MCP invoker
 *   4. Result format: all results have tool, result, isError, source fields
 *   5. Error handling: missing tool returns typed error
 *   6. Disabled provider: returns error for all invocations
 *   7. Tool count: matches input definitions
 *   8. Determinism: same input always produces same output
 *   9. Schema passthrough: inputSchema from MCP definition preserved
 *  10. Provenance: source field always set to 'mcp-bridge'
 */

import { expect, test } from '@playwright/test';
import {
  createInternalMCPBridge,
  createDisabledToolProvider,
  type AgentToolProvider,
  type McpToolInvoker,
} from '../lib/runtime/agent/mcp-bridge';
import { dashboardMcpTools, type McpToolDefinition } from '../lib/domain/types/dashboard';
import type { McpToolInvocation, McpToolResult } from '../lib/application/ports';

// ─── Test Fixtures ───

function mockToolDefinition(name: string, overrides: Partial<McpToolDefinition> = {}): McpToolDefinition {
  return {
    name,
    category: 'observe' as const,
    description: `Mock tool: ${name}`,
    inputSchema: { type: 'object', properties: {} },
    ...overrides,
  };
}

function mockInvoker(responses: Readonly<Record<string, unknown>> = {}): McpToolInvoker {
  return async (invocation: McpToolInvocation): Promise<McpToolResult> => ({
    tool: invocation.tool,
    result: responses[invocation.tool] ?? { echo: invocation.arguments },
    isError: false,
  });
}

function errorInvoker(errorMessage: string): McpToolInvoker {
  return async (invocation: McpToolInvocation): Promise<McpToolResult> => ({
    tool: invocation.tool,
    result: { error: errorMessage },
    isError: true,
  });
}

const standardTools: readonly McpToolDefinition[] = [
  mockToolDefinition('list_probed_elements'),
  mockToolDefinition('get_knowledge_state', {
    inputSchema: { type: 'object', properties: { screen: { type: 'string' } } },
  }),
  mockToolDefinition('get_fitness_metrics'),
  mockToolDefinition('get_proposal', {
    category: 'observe',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  }),
  mockToolDefinition('approve_work_item', {
    category: 'decide',
    inputSchema: { type: 'object', properties: { workItemId: { type: 'string' } }, required: ['workItemId'] },
  }),
];

function standardBridge(): AgentToolProvider {
  return createInternalMCPBridge(standardTools, mockInvoker());
}

// ─── Law 1: Bridge Creation ───

test.describe('Bridge Creation', () => {
  test('creates AgentToolProvider from MCP definitions', () => {
    const bridge = standardBridge();
    expect(bridge).toBeDefined();
    expect(bridge.tools).toBeDefined();
    expect(bridge.getTool).toBeDefined();
    expect(bridge.invoke).toBeDefined();
    expect(bridge.toolCount).toBeDefined();
  });

  test('tools array contains one AgentTool per MCP definition', () => {
    const bridge = standardBridge();
    expect(bridge.tools.length).toBe(standardTools.length);
  });

  test('each tool has name, category, description, inputSchema, invoke', () => {
    const bridge = standardBridge();
    for (const tool of bridge.tools) {
      expect(tool.name).toBeTruthy();
      expect(tool.category).toBeTruthy();
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeDefined();
      expect(typeof tool.invoke).toBe('function');
    }
  });

  test('empty tools array creates empty provider', () => {
    const bridge = createInternalMCPBridge([], mockInvoker());
    expect(bridge.tools.length).toBe(0);
    expect(bridge.toolCount).toBe(0);
  });
});

// ─── Law 2: Tool Lookup ───

test.describe('Tool Lookup', () => {
  test('getTool returns tool for known name', () => {
    const bridge = standardBridge();
    const tool = bridge.getTool('list_probed_elements');
    expect(tool).toBeDefined();
    expect(tool!.name).toBe('list_probed_elements');
  });

  test('getTool returns undefined for unknown name', () => {
    const bridge = standardBridge();
    const tool = bridge.getTool('nonexistent_tool');
    expect(tool).toBeUndefined();
  });

  test('getTool is case-sensitive', () => {
    const bridge = standardBridge();
    expect(bridge.getTool('LIST_PROBED_ELEMENTS')).toBeUndefined();
  });

  test('every tool in definitions is findable via getTool', () => {
    const bridge = standardBridge();
    for (const def of standardTools) {
      expect(bridge.getTool(def.name)).toBeDefined();
    }
  });
});

// ─── Law 3: Tool Invocation ───

test.describe('Tool Invocation', () => {
  test('invoke routes to the MCP invoker', async () => {
    const invocations: McpToolInvocation[] = [];
    const capturingInvoker: McpToolInvoker = async (inv) => {
      invocations.push(inv);
      return { tool: inv.tool, result: { ok: true }, isError: false };
    };
    const bridge = createInternalMCPBridge(standardTools, capturingInvoker);

    await bridge.invoke('list_probed_elements', { screen: 'login' });

    expect(invocations.length).toBe(1);
    expect(invocations[0]!.tool).toBe('list_probed_elements');
    expect(invocations[0]!.arguments).toEqual({ screen: 'login' });
  });

  test('invoke passes arguments through to MCP invoker', async () => {
    const bridge = createInternalMCPBridge(standardTools, mockInvoker());
    const result = await bridge.invoke('get_knowledge_state', { screen: 'policy-search' });
    expect(result.isError).toBe(false);
    expect((result.result as { echo: Record<string, unknown> }).echo).toEqual({ screen: 'policy-search' });
  });

  test('invoke with empty arguments works', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('get_fitness_metrics', {});
    expect(result.isError).toBe(false);
  });

  test('individual tool invoke works the same as provider invoke', async () => {
    const bridge = standardBridge();
    const tool = bridge.getTool('list_probed_elements')!;
    const directResult = await tool.invoke({ screen: 'login' });
    const providerResult = await bridge.invoke('list_probed_elements', { screen: 'login' });
    expect(directResult.tool).toBe(providerResult.tool);
    expect(directResult.isError).toBe(providerResult.isError);
    expect(directResult.source).toBe(providerResult.source);
  });
});

// ─── Law 4: Result Format ───

test.describe('Result Format', () => {
  test('successful result has tool, result, isError=false, source=mcp-bridge', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('list_probed_elements', {});
    expect(result.tool).toBe('list_probed_elements');
    expect(result.result).toBeDefined();
    expect(result.isError).toBe(false);
    expect(result.source).toBe('mcp-bridge');
  });

  test('error result from invoker preserves isError=true', async () => {
    const bridge = createInternalMCPBridge(standardTools, errorInvoker('test error'));
    const result = await bridge.invoke('list_probed_elements', {});
    expect(result.isError).toBe(true);
    expect(result.source).toBe('mcp-bridge');
  });

  test('not-found result has isError=true and source=mcp-bridge', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('nonexistent', {});
    expect(result.isError).toBe(true);
    expect(result.source).toBe('mcp-bridge');
  });

  test('result tool field matches requested tool name', async () => {
    const bridge = standardBridge();
    for (const def of standardTools) {
      const result = await bridge.invoke(def.name, {});
      expect(result.tool).toBe(def.name);
    }
  });
});

// ─── Law 5: Missing Tool Error ───

test.describe('Missing Tool Error', () => {
  test('invoke with unknown tool returns typed error', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('this_tool_does_not_exist', {});
    expect(result.isError).toBe(true);
    expect(result.tool).toBe('this_tool_does_not_exist');
    expect((result.result as { error: string }).error).toContain('not found');
  });

  test('error message lists available tools', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('missing', {});
    const errorMsg = (result.result as { error: string }).error;
    expect(errorMsg).toContain('list_probed_elements');
    expect(errorMsg).toContain('get_knowledge_state');
  });
});

// ─── Law 6: Disabled Provider ───

test.describe('Disabled Provider', () => {
  test('has zero tools', () => {
    const provider = createDisabledToolProvider();
    expect(provider.tools.length).toBe(0);
    expect(provider.toolCount).toBe(0);
  });

  test('getTool always returns undefined', () => {
    const provider = createDisabledToolProvider();
    expect(provider.getTool('list_probed_elements')).toBeUndefined();
    expect(provider.getTool('anything')).toBeUndefined();
  });

  test('invoke always returns error result', async () => {
    const provider = createDisabledToolProvider();
    const result = await provider.invoke('list_probed_elements', {});
    expect(result.isError).toBe(true);
    expect(result.source).toBe('mcp-bridge');
    expect((result.result as { error: string }).error).toContain('disabled');
  });

  test('invoke returns error for any tool name', async () => {
    const provider = createDisabledToolProvider();
    const names = ['list_probed_elements', 'get_proposal', 'random_tool'];
    for (const name of names) {
      const result = await provider.invoke(name, {});
      expect(result.isError).toBe(true);
    }
  });
});

// ─── Law 7: Tool Count ───

test.describe('Tool Count', () => {
  test('toolCount matches tools array length', () => {
    const bridge = standardBridge();
    expect(bridge.toolCount).toBe(bridge.tools.length);
  });

  test('toolCount matches input definition count', () => {
    const bridge = standardBridge();
    expect(bridge.toolCount).toBe(standardTools.length);
  });

  test('empty bridge has toolCount 0', () => {
    const bridge = createInternalMCPBridge([], mockInvoker());
    expect(bridge.toolCount).toBe(0);
  });

  test('single tool bridge has toolCount 1', () => {
    const bridge = createInternalMCPBridge([mockToolDefinition('solo')], mockInvoker());
    expect(bridge.toolCount).toBe(1);
  });
});

// ─── Law 8: Determinism ───

test.describe('Determinism', () => {
  test('same definitions produce same tool names', () => {
    const a = createInternalMCPBridge(standardTools, mockInvoker());
    const b = createInternalMCPBridge(standardTools, mockInvoker());
    expect(a.tools.map((t) => t.name)).toEqual(b.tools.map((t) => t.name));
  });

  test('tool descriptions are preserved exactly', () => {
    const a = createInternalMCPBridge(standardTools, mockInvoker());
    const b = createInternalMCPBridge(standardTools, mockInvoker());
    expect(a.tools.map((t) => t.description)).toEqual(b.tools.map((t) => t.description));
  });

  test('same invocation produces same result structure', async () => {
    const bridge = standardBridge();
    const a = await bridge.invoke('list_probed_elements', { screen: 'login' });
    const b = await bridge.invoke('list_probed_elements', { screen: 'login' });
    expect(a.tool).toBe(b.tool);
    expect(a.isError).toBe(b.isError);
    expect(a.source).toBe(b.source);
  });
});

// ─── Law 9: Schema Passthrough ───

test.describe('Schema Passthrough', () => {
  test('inputSchema is preserved from MCP definition', () => {
    const bridge = standardBridge();
    const tool = bridge.getTool('get_knowledge_state')!;
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: { screen: { type: 'string' } },
    });
  });

  test('inputSchema with required fields is preserved', () => {
    const bridge = standardBridge();
    const tool = bridge.getTool('get_proposal')!;
    expect(tool.inputSchema).toEqual({
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    });
  });

  test('category is preserved from MCP definition', () => {
    const bridge = standardBridge();
    expect(bridge.getTool('approve_work_item')!.category).toBe('decide');
    expect(bridge.getTool('list_probed_elements')!.category).toBe('observe');
  });
});

// ─── Law 10: Provenance ───

test.describe('Provenance', () => {
  test('all results have source=mcp-bridge', async () => {
    const bridge = standardBridge();
    for (const tool of standardTools) {
      const result = await bridge.invoke(tool.name, {});
      expect(result.source).toBe('mcp-bridge');
    }
  });

  test('error results have source=mcp-bridge', async () => {
    const bridge = createInternalMCPBridge(standardTools, errorInvoker('fail'));
    for (const tool of standardTools) {
      const result = await bridge.invoke(tool.name, {});
      expect(result.source).toBe('mcp-bridge');
    }
  });

  test('not-found results have source=mcp-bridge', async () => {
    const bridge = standardBridge();
    const result = await bridge.invoke('missing', {});
    expect(result.source).toBe('mcp-bridge');
  });

  test('disabled provider results have source=mcp-bridge', async () => {
    const provider = createDisabledToolProvider();
    const result = await provider.invoke('anything', {});
    expect(result.source).toBe('mcp-bridge');
  });
});

// ─── Law 11: Integration with Full Tool Catalog ───

test.describe('Full Catalog Integration', () => {
  test('bridge can be created from dashboardMcpTools', () => {
    const bridge = createInternalMCPBridge(dashboardMcpTools, mockInvoker());
    expect(bridge.toolCount).toBe(dashboardMcpTools.length);
    expect(bridge.toolCount).toBeGreaterThanOrEqual(15);
  });

  test('all dashboard tools are accessible via getTool', () => {
    const bridge = createInternalMCPBridge(dashboardMcpTools, mockInvoker());
    for (const tool of dashboardMcpTools) {
      expect(bridge.getTool(tool.name)).toBeDefined();
    }
  });

  test('all dashboard tools can be invoked', async () => {
    const bridge = createInternalMCPBridge(dashboardMcpTools, mockInvoker());
    for (const tool of dashboardMcpTools) {
      const result = await bridge.invoke(tool.name, {});
      expect(result.tool).toBe(tool.name);
      expect(result.source).toBe('mcp-bridge');
    }
  });
});

// ─── Law 12: Concurrent Invocations ───

test.describe('Concurrent Invocations', () => {
  test('multiple concurrent invocations return correct results', async () => {
    const invoker: McpToolInvoker = async (inv) => ({
      tool: inv.tool,
      result: { toolName: inv.tool },
      isError: false,
    });
    const bridge = createInternalMCPBridge(standardTools, invoker);

    const results = await Promise.all(
      standardTools.map((t) => bridge.invoke(t.name, {})),
    );

    for (let i = 0; i < standardTools.length; i++) {
      expect(results[i]!.tool).toBe(standardTools[i]!.name);
      expect((results[i]!.result as { toolName: string }).toolName).toBe(standardTools[i]!.name);
    }
  });
});

// ─── Law 13: Invoker Exception Handling ───

test.describe('Invoker Exception Handling', () => {
  test('invoker that throws is propagated (caller handles)', async () => {
    const throwingInvoker: McpToolInvoker = async () => {
      throw new Error('invoker exploded');
    };
    const bridge = createInternalMCPBridge(standardTools, throwingInvoker);

    await expect(bridge.invoke('list_probed_elements', {})).rejects.toThrow('invoker exploded');
  });
});

// ─── Law 14: Tool Names Are Unique ───

test.describe('Tool Name Uniqueness', () => {
  test('duplicate definitions: last wins in lookup', () => {
    const defs: readonly McpToolDefinition[] = [
      mockToolDefinition('dup', { description: 'first' }),
      mockToolDefinition('dup', { description: 'second' }),
    ];
    const bridge = createInternalMCPBridge(defs, mockInvoker());
    // Map constructor takes last entry for duplicate keys
    const tool = bridge.getTool('dup')!;
    expect(tool.description).toBe('second');
  });

  test('bridge reports correct toolCount even with duplicates', () => {
    const defs: readonly McpToolDefinition[] = [
      mockToolDefinition('dup', { description: 'first' }),
      mockToolDefinition('dup', { description: 'second' }),
    ];
    const bridge = createInternalMCPBridge(defs, mockInvoker());
    // tools array preserves all entries; toolCount = array length
    expect(bridge.toolCount).toBe(2);
  });
});

// ─── Law 15: Bridge Does Not Mutate Input ───

test.describe('Immutability', () => {
  test('creating bridge does not mutate input definitions array', () => {
    const defs = [...standardTools];
    const originalLength = defs.length;
    createInternalMCPBridge(defs, mockInvoker());
    expect(defs.length).toBe(originalLength);
  });

  test('invocation does not mutate arguments object', async () => {
    const bridge = standardBridge();
    const args = { screen: 'login' };
    const argsCopy = { ...args };
    await bridge.invoke('get_knowledge_state', args);
    expect(args).toEqual(argsCopy);
  });
});

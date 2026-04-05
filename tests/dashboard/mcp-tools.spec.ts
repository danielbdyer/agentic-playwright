import { expect, test } from '@playwright/test';
import { createMcpToolsRegistry } from '../../dashboard/server/mcp-tools';
import type { FileAccess } from '../../dashboard/server/infrastructure/file-access';

const createFileAccess = (store: Readonly<Record<string, string>>): FileAccess => ({
  readTextFile: (relativePath) => store[relativePath] ?? null,
  readJsonFile: (relativePath) => {
    const text = store[relativePath];
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  },
});

test.describe('dashboard MCP tool registry', () => {
  test('lists metadata and resolves list_probed_elements with screen filter', () => {
    const files = createFileAccess({
      '.tesseract/workbench/index.json': JSON.stringify({
        items: [
          { id: 'a', context: { screen: 'home' }, evidence: { confidence: 0.9 } },
          { id: 'b', context: { screen: 'details' }, evidence: { confidence: 0.5 } },
        ],
      }),
    });

    const registry = createMcpToolsRegistry({ files });
    const result = registry.callTool('list_probed_elements', { screen: 'home' }) as {
      elements: Array<{ id: string }>;
      count: number;
    };

    expect(registry.tools.length).toBeGreaterThan(0);
    expect(result.count).toBe(1);
    expect(result.elements).toEqual([{ id: 'a', screen: 'home', confidence: 0.9 }]);
  });

  test('returns last iteration status entry', () => {
    const files = createFileAccess({
      '.tesseract/runs/speedrun-progress.jsonl': `${JSON.stringify({ phase: 'running', iteration: 1 })}\n${JSON.stringify({ phase: 'finished', iteration: 2 })}\n`,
    });

    const registry = createMcpToolsRegistry({ files });
    const result = registry.callTool('get_iteration_status', {}) as Record<string, unknown>;

    expect(result).toEqual({ phase: 'finished', iteration: 2 });
  });

  test('returns error envelope for unknown tools', () => {
    const registry = createMcpToolsRegistry({ files: createFileAccess({}) });

    const result = registry.callTool('non_existing_tool', {}) as { error: string; isError: boolean };

    expect(result.isError).toBe(true);
    expect(result.error).toContain('Unknown tool');
  });
});

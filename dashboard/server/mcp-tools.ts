import type { FileAccess } from './infrastructure/file-access';

export interface McpToolMetadata {
  readonly name: string;
  readonly category: 'observe' | 'decide' | 'control';
  readonly description: string;
}

export type McpToolArgs = Readonly<Record<string, unknown>>;
export type McpToolResult = unknown;

export interface McpToolContext {
  readonly files: FileAccess;
}

type McpToolHandler = (args: McpToolArgs, context: McpToolContext) => McpToolResult;

interface McpToolDefinition {
  readonly metadata: McpToolMetadata;
  readonly handle: McpToolHandler;
}

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null => (
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null
);

const asNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);
const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

const listProbedElements: McpToolHandler = (args, context) => {
  const rawWorkbench = context.files.readJsonFile('.tesseract/workbench/index.json');
  const workbench = asRecord(rawWorkbench);
  const rawItems = workbench?.items;
  const items = Array.isArray(rawItems) ? rawItems : [];
  const screenFilter = asString(args.screen);

  const filteredItems = screenFilter
    ? items.filter((item) => asRecord(item)?.context && asRecord(asRecord(item)?.context)?.screen === screenFilter)
    : items;

  const elements = filteredItems.map((item) => {
    const record = asRecord(item);
    const contextRecord = asRecord(record?.context);
    const evidenceRecord = asRecord(record?.evidence);
    return {
      id: record?.id ?? null,
      screen: contextRecord?.screen ?? null,
      confidence: asNumber(evidenceRecord?.confidence) ?? 0,
    };
  });

  return {
    elements,
    count: elements.length,
  };
};

const getKnowledgeState: McpToolHandler = (_, context) => {
  const graph = asRecord(context.files.readJsonFile('.tesseract/graph/index.json'));
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  return {
    nodes: nodes.slice(0, 100),
    totalNodes: nodes.length,
  };
};

const getQueueItems: McpToolHandler = (_, context) => {
  const workbench = asRecord(context.files.readJsonFile('.tesseract/workbench/index.json'));
  const items = Array.isArray(workbench?.items) ? workbench.items : [];
  return {
    items,
    count: items.length,
    summary: workbench?.summary ?? null,
  };
};

const getFitnessMetrics: McpToolHandler = (_, context) => {
  const scorecard = asRecord(context.files.readJsonFile('.tesseract/benchmarks/scorecard.json'));
  const highWaterMark = asRecord(scorecard?.highWaterMark);
  return highWaterMark ?? { error: 'No scorecard' };
};

const getIterationStatus: McpToolHandler = (_, context) => {
  const text = context.files.readTextFile('.tesseract/runs/speedrun-progress.jsonl');
  if (text === null) return { phase: 'idle' };
  const lastLine = text
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .at(-1);

  if (!lastLine) return { phase: 'idle' };

  try {
    return JSON.parse(lastLine);
  } catch {
    return { phase: 'unknown' };
  }
};

const TOOL_REGISTRY = {
  list_probed_elements: {
    metadata: { name: 'list_probed_elements', category: 'observe', description: 'List probed elements.' },
    handle: listProbedElements,
  },
  get_screen_capture: {
    metadata: { name: 'get_screen_capture', category: 'observe', description: 'Get latest screenshot.' },
    handle: () => ({ error: 'No screenshot available', available: false }),
  },
  get_knowledge_state: {
    metadata: { name: 'get_knowledge_state', category: 'observe', description: 'Get knowledge graph state.' },
    handle: getKnowledgeState,
  },
  get_queue_items: {
    metadata: { name: 'get_queue_items', category: 'observe', description: 'List pending work items.' },
    handle: getQueueItems,
  },
  get_fitness_metrics: {
    metadata: { name: 'get_fitness_metrics', category: 'observe', description: 'Get fitness scorecard.' },
    handle: getFitnessMetrics,
  },
  approve_work_item: {
    metadata: { name: 'approve_work_item', category: 'decide', description: 'Approve work item.' },
    handle: () => ({ error: 'Tool not implemented by dashboard HTTP bridge', isError: true }),
  },
  skip_work_item: {
    metadata: { name: 'skip_work_item', category: 'decide', description: 'Skip work item.' },
    handle: () => ({ error: 'Tool not implemented by dashboard HTTP bridge', isError: true }),
  },
  get_iteration_status: {
    metadata: { name: 'get_iteration_status', category: 'control', description: 'Get iteration status.' },
    handle: getIterationStatus,
  },
} as const satisfies Readonly<Record<string, McpToolDefinition>>;

export type McpToolName = keyof typeof TOOL_REGISTRY;
export const MCP_TOOLS = Object.values(TOOL_REGISTRY).map((entry) => entry.metadata);

const hasTool = (tool: string): tool is McpToolName => tool in TOOL_REGISTRY;

export interface McpToolsRegistry {
  readonly tools: readonly McpToolMetadata[];
  readonly callTool: (tool: string, args: McpToolArgs) => McpToolResult;
}

export const createMcpToolsRegistry = (context: McpToolContext): McpToolsRegistry => ({
  tools: MCP_TOOLS,
  callTool: (tool, args) => (
    hasTool(tool)
      ? TOOL_REGISTRY[tool].handle(args, context)
      : { error: `Unknown tool: ${tool}`, isError: true }
  ),
});

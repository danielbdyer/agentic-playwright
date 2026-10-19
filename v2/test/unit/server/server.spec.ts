import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../../../src/server/server.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import { TOOLS, wireName, CONTRACT_VERSION } from '../../../src/contract/tools.js';
import { ToolError } from '../../../src/core/errors.js';
import type { ToolHandlers } from '../../../src/tools/types.js';
import type { BrowserPool } from '../../../src/browser/types.js';

const nullPool: BrowserPool = {
  open: async () => { throw new ToolError('unavailable', 'no browser in this test'); },
  navigate: async () => { throw new ToolError('unavailable', 'no browser in this test'); },
  get: () => { throw new ToolError('not-found', 'no pages'); },
  list: () => [],
  close: async () => undefined,
  closeAll: async () => undefined,
};

const unimplemented = new Proxy({}, {
  get: (_target, name) => async () => { throw new ToolError('unclassified', `handler ${String(name)} not provided in this test`); },
}) as ToolHandlers;

const handlers: ToolHandlers = {
  ...unimplemented,
  'memory.query': async (input) => ({ facets: [], screenKnown: input.screen === 'known', ...(input.screen === 'known' ? { route: { url: 'Known' } } : {}) }),
  'app.observe': async () => { throw new ToolError('not-found', 'unknown pageId p9', { pageId: 'p9' }); },
  'review.record': async (input) => ({
    at: '2026-10-19T00:00:00.000Z',
    testCaseId: input.testCaseId,
    decision: input.decision,
    reviewer: input.reviewer,
    facetsPromoted: [],
    countsAsAccepted: input.decision !== 'reject',
  }),
  // Deliberately violates its output contract.
  'handoff.raise': async () => ({ handoffId: 42 } as unknown as { handoffId: string; path: string }),
};

describe('MCP server', () => {
  let root: string;
  let runtime: Runtime;
  let client: Client;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-server-'));
    await mkdir(path.join(root, '.tesseract', 'catalog'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'catalog', 'policy-search.yaml'), 'screen: policy-search\nfacets: []\n');
    await mkdir(path.join(root, '.tesseract', 'cases'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'cases', '10001.json'), JSON.stringify({ id: '10001' }));
    await mkdir(path.join(root, '.tesseract', 'handoffs'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'handoffs', '10001-2.json'), JSON.stringify({ handoffId: 'h1', status: 'open' }));
    await writeFile(path.join(root, '.tesseract', 'handoffs', '10001-3.json'), JSON.stringify({ handoffId: 'h2', status: 'resolved' }));
    const workspace = await loadWorkspace(root, {});
    runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, log: () => undefined, session: 's-test' });
    const server = buildMcpServer(runtime);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('registers all sixteen tools with wire names, schemas, and annotations', async () => {
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(16);
    expect(tools.map((t) => t.name).sort()).toEqual(TOOLS.map((t) => wireName(t.name)).sort());
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-z]+_[a-z]+$/);
      expect(tool.inputSchema.type).toBe('object');
      expect(tool.outputSchema?.type).toBe('object');
      expect(tool.annotations?.readOnlyHint).toBeTypeOf('boolean');
      expect(tool.annotations?.destructiveHint).toBeTypeOf('boolean');
      expect(tool.description?.length ?? 0).toBeGreaterThan(80);
    }
    const observe = tools.find((t) => t.name === 'app_observe')!;
    expect(observe.annotations?.readOnlyHint).toBe(true);
    const act = tools.find((t) => t.name === 'app_act')!;
    expect(act.annotations?.destructiveHint).toBe(true);
    const review = tools.find((t) => t.name === 'review_record')!;
    expect(review.description).toMatch(/human reviewer's explicit instruction/);
  });

  it('returns structured content for a successful call and writes an authoring receipt', async () => {
    const result = await client.callTool({ name: 'memory_query', arguments: { screen: 'known', phrase: 'search field' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ facets: [], screenKnown: true, route: { url: 'Known' } });
    const receipts = (await readFile(path.join(root, '.tesseract', 'receipts', 'authoring.jsonl'), 'utf8')).trim().split('\n');
    const last = JSON.parse(receipts[receipts.length - 1]!) as Record<string, unknown>;
    expect(last.tool).toBe('memory.query');
    expect(last.outcome).toBe('succeeded');
    expect(last.session).toBe('s-test');
  });

  it('maps a ToolError onto isError with its family', async () => {
    const result = await client.callTool({ name: 'app_observe', arguments: { pageId: 'p9' } });
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content as { text: string }[])[0]!.text) as { error: { family: string; message: string } };
    expect(payload.error.family).toBe('not-found');
    expect(payload.error.message).toMatch(/p9/);
  });

  it('rejects input outside the contract as invalid-input', async () => {
    const result = await client.callTool({ name: 'review_record', arguments: { testCaseId: '10001', decision: 'maybe', reviewer: 'qa' } });
    expect(result.isError).toBe(true);
    const text = (result.content as { text: string }[])[0]!.text;
    expect(text).toMatch(/invalid/i);
  });

  it('refuses a handler output that violates the contract', async () => {
    const result = await client.callTool({
      name: 'handoff_raise',
      arguments: { testCaseId: '10001', stepIndex: 2, blockage: 'other', unresolvedIntent: 'x', attempted: [], evidence: {}, nextMoves: [] },
    });
    expect(result.isError).toBe(true);
    expect((result.content as { text: string }[])[0]!.text).toMatch(/violates its contract/);
  });

  it('records the human decision tool through the same path', async () => {
    const result = await client.callTool({ name: 'review_record', arguments: { testCaseId: '10001', decision: 'accept', reviewer: 'qa.lead' } });
    expect(result.isError).toBeFalsy();
    expect((result.structuredContent as { countsAsAccepted: boolean }).countsAsAccepted).toBe(true);
  });

  it('serves the contract, playbook, catalog, case, and open-handoff resources', async () => {
    const contract = await client.readResource({ uri: 'tesseract://contract' });
    const doc = JSON.parse((contract.contents[0] as { text: string }).text) as { version: string; tools: unknown[] };
    expect(doc.version).toBe(CONTRACT_VERSION);
    expect(doc.tools).toHaveLength(16);

    const playbook = await client.readResource({ uri: 'tesseract://playbook' });
    expect((playbook.contents[0] as { text: string }).text).toMatch(/Tesseract QA playbook/);

    const list = await client.listResources();
    const uris = list.resources.map((r) => r.uri);
    expect(uris).toContain('tesseract://catalog/policy-search');
    expect(uris).toContain('tesseract://cases/10001');

    const catalog = await client.readResource({ uri: 'tesseract://catalog/policy-search' });
    expect((catalog.contents[0] as { text: string }).text).toMatch(/screen: policy-search/);

    const handoffs = await client.readResource({ uri: 'tesseract://handoffs' });
    const open = JSON.parse((handoffs.contents[0] as { text: string }).text) as { handoffId: string }[];
    expect(open.map((h) => h.handoffId)).toEqual(['h1']);
  });

  it('refuses path traversal through resource templates', async () => {
    await expect(client.readResource({ uri: 'tesseract://catalog/..%2F..%2Fetc' })).rejects.toThrow();
    await expect(client.readResource({ uri: 'tesseract://cases/..' })).rejects.toThrow();
  });

  it('offers the three prompts', async () => {
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(['author-test-case', 'record-flow', 'repair-failing-test']);
    const prompt = await client.getPrompt({ name: 'author-test-case', arguments: { id: '10001', profile: 'qa' } });
    expect((prompt.messages[0]!.content as { text: string }).text).toMatch(/ado_fetch \{ids:\["10001"\]\}/);
  });
});

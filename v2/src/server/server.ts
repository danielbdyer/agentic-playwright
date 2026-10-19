/**
 * The MCP front door. Every tool is registered from the single declaration in
 * contract/tools.ts and dispatched through the shared runtime, so the MCP
 * surface, the CLI, and the playbook cannot disagree about what exists.
 *
 * The server is built to sit behind a gateway it does not own: short stable
 * names, a `contract` resource stating the version, read-only and destructive
 * hints on every tool, and no state between calls beyond the browser pool.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { CONTRACT_VERSION, TOOLS, wireName, type ToolDeclaration } from '../contract/tools.js';
import { listFiles, readText } from '../core/fsio.js';
import { packageRoot } from '../core/package-root.js';
import type { Runtime } from '../tools/runtime.js';

export const SERVER_NAME = 'tesseract-qa';

export const SERVER_INSTRUCTIONS = [
  'Tesseract QA authors plain Playwright tests for OutSystems applications from Azure DevOps test cases, and keeps a provenance-threaded memory of the application (facets) in the repository.',
  'The loop for one test case: ado_fetch → app_open → for each step: memory_query, then (on a miss) app_observe with the step as intent, app_act on the chosen target, app_assert the expected result, memory_mint what you used → test_emit → test_run → ado_publish. Raise handoff_raise instead of guessing.',
  'Read the tesseract://playbook resource once per session. Tools never call a model; you decide, they verify and record. Emitted tests import nothing from Tesseract.',
].join(' ');

const asText = (value: unknown): string => JSON.stringify(value);

/** Hosts reject oversized images (the Claude API: 8000 px a side; most hosts a few MB per request). */
export const MAX_INLINE_IMAGE_BYTES = 1024 * 1024;
export const MAX_INLINE_IMAGE_SIDE = 8000;

/** Width and height from a PNG's IHDR chunk, or null when the bytes are not a PNG. */
const pngSize = (data: Buffer): { readonly width: number; readonly height: number } | null =>
  data.length >= 24 && data.readUInt32BE(0) === 0x89504e47 && data.toString('ascii', 12, 16) === 'IHDR'
    ? { width: data.readUInt32BE(16), height: data.readUInt32BE(20) }
    : null;

/**
 * Only app.observe's viewport screenshot is attached as an image, and only
 * when it fits host limits. Every other screenshot (handoff.raise's full
 * page) stays on disk; its path is in the result for a human or a later read.
 */
const screenshotContent = async (tool: string, output: unknown, root: string): Promise<CallToolResult['content']> => {
  if (tool !== 'app.observe' || output === null || typeof output !== 'object') return [];
  const record = output as Record<string, unknown>;
  const shot = typeof record.screenshotPath === 'string' ? record.screenshotPath : undefined;
  if (shot === undefined) return [];
  try {
    const file = path.resolve(root, shot);
    if ((await fs.stat(file)).size > MAX_INLINE_IMAGE_BYTES) return [];
    const data = await fs.readFile(file);
    const size = pngSize(data);
    if (size === null || size.width > MAX_INLINE_IMAGE_SIDE || size.height > MAX_INLINE_IMAGE_SIDE) return [];
    return [{ type: 'image', data: data.toString('base64'), mimeType: 'image/png' }];
  } catch {
    return [];
  }
};

const toolResult = async (runtime: Runtime, declaration: ToolDeclaration, args: unknown): Promise<CallToolResult> => {
  const result = await runtime.invoke(declaration.name, args);
  if (!result.ok) {
    return {
      isError: true,
      content: [{ type: 'text', text: asText({ error: result.error }) }],
    };
  }
  // Parse through the declared schema so keys outside the contract never leak to the host.
  const output = declaration.output.parse(result.output) as Record<string, unknown>;
  const images = await screenshotContent(declaration.name, output, runtime.ctx.workspace.paths.root);
  return {
    content: [{ type: 'text', text: asText(output) }, ...images],
    structuredContent: output,
  };
};

export const contractDocument = (): unknown => ({
  name: SERVER_NAME,
  version: CONTRACT_VERSION,
  tools: (TOOLS as readonly ToolDeclaration[]).map((tool) => ({
    name: tool.name,
    wireName: wireName(tool.name),
    summary: tool.summary,
    release: tool.release,
    caller: tool.caller,
    readOnly: tool.readOnly,
    destructive: tool.destructive,
    idempotent: tool.idempotent,
    openWorld: tool.openWorld,
    errorFamilies: tool.errorFamilies,
    since: tool.since,
  })),
});

const registerTools = (server: McpServer, runtime: Runtime): void => {
  for (const declaration of TOOLS as readonly ToolDeclaration[]) {
    server.registerTool(
      wireName(declaration.name),
      {
        title: declaration.title,
        description: declaration.caller === 'human'
          ? `${declaration.description} (Records a human decision: call only on a human reviewer's explicit instruction.)`
          : declaration.description,
        inputSchema: declaration.input,
        outputSchema: declaration.output,
        annotations: {
          title: declaration.title,
          readOnlyHint: declaration.readOnly,
          destructiveHint: declaration.destructive,
          idempotentHint: declaration.idempotent,
          openWorldHint: declaration.openWorld,
        },
        _meta: {
          'tesseract/name': declaration.name,
          'tesseract/release': declaration.release,
          'tesseract/caller': declaration.caller,
          'tesseract/errorFamilies': [...declaration.errorFamilies],
          'tesseract/since': declaration.since,
        },
      },
      (async (args: unknown) => toolResult(runtime, declaration, args)) as never,
    );
  }
};

const registerResources = (server: McpServer, runtime: Runtime): void => {
  const paths = runtime.ctx.workspace.paths;

  server.registerResource(
    'contract',
    'tesseract://contract',
    { title: 'Tool contract', description: 'Contract version and every tool with its release, caller, hints, and error families.', mimeType: 'application/json' },
    async (uri) => ({ contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(contractDocument(), null, 2) }] }),
  );

  server.registerResource(
    'playbook',
    'tesseract://playbook',
    { title: 'Playbook', description: 'How to author a test with these tools. Read once per session.', mimeType: 'text/markdown' },
    async (uri) => {
      const text = (await readText(path.join(packageRoot(), 'PLAYBOOK.md'))) ?? '# Playbook\n\n(PLAYBOOK.md is missing from the package.)\n';
      return { contents: [{ uri: uri.href, mimeType: 'text/markdown', text }] };
    },
  );

  const screens = async (): Promise<readonly string[]> =>
    (await listFiles(paths.catalog, '.yaml')).map((file) => path.basename(file, '.yaml'));

  server.registerResource(
    'catalog',
    new ResourceTemplate('tesseract://catalog/{screen}', {
      list: async () => ({
        resources: (await screens()).map((screen) => ({
          uri: `tesseract://catalog/${screen}`,
          name: `catalog/${screen}`,
          title: `Facets on ${screen}`,
          mimeType: 'application/yaml',
        })),
      }),
      complete: { screen: async (value) => (await screens()).filter((screen) => screen.startsWith(value)) },
    }),
    { title: 'Facet catalog', description: 'One screen\'s facets as YAML: names, aliases, locators with health, status, provenance.', mimeType: 'application/yaml' },
    async (uri, variables) => {
      const screen = String(variables.screen ?? '');
      if (!/^[a-z0-9][a-z0-9-]*$/.test(screen)) throw new Error(`invalid screen name: ${screen}`);
      const text = await readText(path.join(paths.catalog, `${screen}.yaml`));
      if (text === null) throw new Error(`no catalog for screen ${screen}`);
      return { contents: [{ uri: uri.href, mimeType: 'application/yaml', text }] };
    },
  );

  const caseIds = async (): Promise<readonly string[]> =>
    (await listFiles(paths.cases, '.json')).map((file) => path.basename(file, '.json'));

  server.registerResource(
    'case',
    new ResourceTemplate('tesseract://cases/{id}', {
      list: async () => ({
        resources: (await caseIds()).map((id) => ({ uri: `tesseract://cases/${id}`, name: `case/${id}`, title: `ADO test case ${id}`, mimeType: 'application/json' })),
      }),
    }),
    { title: 'Cached test case', description: 'A test case as ado_fetch parsed it (steps, parameters, data rows).', mimeType: 'application/json' },
    async (uri, variables) => {
      const id = String(variables.id ?? '');
      if (!/^[A-Za-z0-9_-]+$/.test(id)) throw new Error(`invalid case id: ${id}`);
      const text = await readText(path.join(paths.cases, `${id}.json`));
      if (text === null) throw new Error(`case ${id} has not been fetched`);
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text }] };
    },
  );

  server.registerResource(
    'handoffs',
    'tesseract://handoffs',
    { title: 'Open handoffs', description: 'Steps waiting on a human, with the structured reason.', mimeType: 'application/json' },
    async (uri) => {
      const files = await listFiles(paths.handoffs, '.json');
      const handoffs = (
        await Promise.all(files.map(async (file) => {
          const text = await readText(file);
          try {
            return text === null ? null : (JSON.parse(text) as Record<string, unknown>);
          } catch {
            return null;
          }
        }))
      ).filter((h): h is Record<string, unknown> => h !== null && h.status === 'open');
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(handoffs, null, 2) }] };
    },
  );
};

const registerPrompts = (server: McpServer): void => {
  server.registerPrompt(
    'author-test-case',
    {
      title: 'Author a test case',
      description: 'Author one Azure DevOps test case end to end with the Tesseract tools.',
      argsSchema: { id: z.string().describe('ADO test case id'), profile: z.string().optional().describe('Environment profile') },
    },
    ({ id, profile }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Author Azure DevOps test case ${id} as a plain Playwright test${profile !== undefined ? ` against profile "${profile}"` : ''}.`,
            'Read tesseract://playbook first if you have not this session.',
            `1. ado_fetch {ids:["${id}"]}. 2. memory_preflight for the screens you expect, then app_open${profile !== undefined ? ` {profile:"${profile}"}` : ''}.`,
            '3. For each step: memory_query; on a miss app_observe with the step wording as intent (scope to a landmark the step names); choose; app_act; app_assert the expected result on content, not bare visibility; memory_mint with the test author\'s words as aliases.',
            '4. When a step cannot be resolved after a few attempts, handoff_raise and carry its handoffId on the step.',
            '5. test_emit, then test_run. If it fails on a locator, repair (app_open attach, app_observe, app_act, memory_enrich) and run again.',
            '6. Tell the human the spec path and ask them to review; publish with ado_publish when asked.',
          ].join('\n'),
        },
      }],
    }),
  );

  server.registerPrompt(
    'repair-failing-test',
    {
      title: 'Repair a failing test in place',
      description: 'Run a failing spec with pauseOnFailure, attach to the paused browser, repair the facet, and re-run.',
      argsSchema: { spec: z.string().describe('Workspace-relative spec path') },
    },
    ({ spec }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Repair ${spec} in place.`,
            `1. test_run {specPaths:["${spec}"], pauseOnFailure:true}. If it passes, stop.`,
            '2. From paused.cdpEndpoint: app_open {attach:{cdpEndpoint}}; app_observe scoped to the failing step\'s landmark with the step wording as intent.',
            '3. Find the element the failing facet meant; app_act to try it; memory_enrich the facet with the verified locator and the snapshot as evidence.',
            `4. test_run {specPaths:["${spec}"]} again (this releases the paused run). Report the facet, old and new locator, and the result.`,
          ].join('\n'),
        },
      }],
    }),
  );

  server.registerPrompt(
    'record-flow',
    {
      title: 'Record a flow',
      description: 'Have a QA walk a path once in a headed browser and turn it into facets and a deterministic flow.',
      argsSchema: { name: z.string().describe('kebab-case flow name'), url: z.string().optional(), profile: z.string().optional() },
    },
    ({ name, url, profile }) => ({
      messages: [{
        role: 'user',
        content: {
          type: 'text',
          text: [
            `Record the flow "${name}".`,
            `1. app_open {headed:true${url !== undefined ? `, url:"${url}"` : ''}${profile !== undefined ? `, profile:"${profile}"` : ''}}.`,
            `2. flow_record {name:"${name}", pageId, stopOn:"manual"} and tell the human to walk the path, then press the Stop button shown in the page.`,
            '3. Report the facets minted and the parameters (secrets typed into password fields become parameters).',
            `4. flow_run {name:"${name}"} to confirm it replays.`,
          ].join('\n'),
        },
      }],
    }),
  );
};

export const buildMcpServer = (runtime: Runtime): McpServer => {
  const server = new McpServer(
    { name: SERVER_NAME, version: CONTRACT_VERSION, title: 'Tesseract QA' },
    { instructions: SERVER_INSTRUCTIONS, capabilities: { logging: {} } },
  );
  registerTools(server, runtime);
  registerResources(server, runtime);
  registerPrompts(server);
  return server;
};

/**
 * Streamable HTTP, the way a team gateway would mount the node: the built
 * server on a port, a bearer token, one MCP session per client.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { BIN, V2_ROOT } from './support.js';

const TOKEN = 'e2e-http-token-0123456789abcdef';

describe('tesseract-qa over Streamable HTTP', () => {
  let server: ChildProcess;
  let url = '';
  let root: string;

  beforeAll(async () => {
    await mkdir(path.join(V2_ROOT, '.tmp'), { recursive: true });
    root = await mkdtemp(path.join(V2_ROOT, '.tmp', 'http-'));
    server = spawn(process.execPath, [BIN, 'serve', '--http', '0', '--token-env', 'TQA_TOKEN', '--root', root], {
      env: { ...process.env, TQA_TOKEN: TOKEN },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    url = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      const timer = setTimeout(() => reject(new Error(`server did not start: ${buffer}`)), 30_000);
      server.stderr!.on('data', (chunk: Buffer) => {
        buffer += chunk.toString();
        const match = /at (http:\/\/127\.0\.0\.1:\d+\/mcp)/.exec(buffer);
        if (match !== null) {
          clearTimeout(timer);
          resolve(match[1]!);
        }
      });
    });
  }, 60_000);

  afterAll(async () => {
    server?.kill('SIGTERM');
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a request without the bearer token', async () => {
    const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
    expect(response.status).toBe(401);
  });

  it('answers health checks', async () => {
    const response = await fetch(url.replace(/\/mcp$/, '/healthz'));
    expect(await response.json()).toMatchObject({ ok: true });
  });

  it('serves the sixteen tools and a call to an authenticated session', async () => {
    const client = new Client({ name: 'gateway', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(16);
    const result = await client.callTool({ name: 'memory_query', arguments: { phrase: 'search field' } });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toMatchObject({ facets: [], screenKnown: false });
    const contract = await client.readResource({ uri: 'tesseract://contract' });
    expect(JSON.parse((contract.contents[0] as { text: string }).text).tools).toHaveLength(16);
    await client.close();
  });
});

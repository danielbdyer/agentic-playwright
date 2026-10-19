/**
 * End-to-end support: a workspace under v2/.tmp/ (so the emitted specs
 * resolve @playwright/test through node_modules, as they would in a
 * customer repository), and an MCP client that talks to the BUILT server
 * over stdio exactly as an agent host does.
 */
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export const V2_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const BIN = path.join(V2_ROOT, 'dist', 'bin', 'tesseract-qa.js');

export interface E2eWorkspace {
  readonly root: string;
  readonly dispose: () => Promise<void>;
}

export const createWorkspace = async (options: {
  readonly baseURL: string;
  readonly ado?: { readonly orgUrl: string; readonly project: string };
  readonly profile?: Record<string, unknown>;
}): Promise<E2eWorkspace> => {
  await mkdir(path.join(V2_ROOT, '.tmp'), { recursive: true });
  const root = await mkdtemp(path.join(V2_ROOT, '.tmp', 'e2e-'));
  await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
  await writeFile(
    path.join(root, '.tesseract', 'config.json'),
    JSON.stringify({ pii: 'standard', ...(options.ado !== undefined ? { ado: { orgUrl: options.ado.orgUrl, project: options.ado.project, patEnv: 'AZURE_DEVOPS_PAT' } } : {}) }, null, 2),
  );
  await writeFile(
    path.join(root, '.tesseract', 'profiles', 'qa.json'),
    JSON.stringify({ name: 'qa', baseURL: options.baseURL, ...(options.profile ?? {}) }, null, 2),
  );
  // The customer's own Playwright config, as `tesseract-qa init` tells them to write it.
  await writeFile(
    path.join(root, 'playwright.config.ts'),
    [
      "import { defineConfig } from '@playwright/test';",
      "import { readFileSync } from 'node:fs';",
      "const profile = process.env.TESSERACT_PROFILE ?? 'qa';",
      "const baseURL = process.env.TESSERACT_BASE_URL ?? JSON.parse(readFileSync(`.tesseract/profiles/${profile}.json`, 'utf8')).baseURL;",
      "export default defineConfig({ testDir: 'tests', timeout: 30_000, use: { baseURL, trace: 'retain-on-failure' } });",
      '',
    ].join('\n'),
  );
  return { root, dispose: () => rm(root, { recursive: true, force: true }) };
};

export interface McpSession {
  readonly client: Client;
  readonly call: <T = Record<string, unknown>>(tool: string, args: Record<string, unknown>) => Promise<T>;
  readonly callRaw: (tool: string, args: Record<string, unknown>) => Promise<{ isError: boolean; text: string; structured: unknown }>;
  readonly close: () => Promise<void>;
}

export const connect = async (root: string, env: Record<string, string> = {}): Promise<McpSession> => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [BIN, 'serve', '--root', root],
    env: { ...(process.env as Record<string, string>), ...env },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'e2e-host', version: '1.0.0' });
  await client.connect(transport);
  const callRaw = async (tool: string, args: Record<string, unknown>) => {
    const result = await client.callTool({ name: tool, arguments: args }, undefined, { timeout: 600_000 });
    const text = ((result.content as { type: string; text?: string }[]).find((c) => c.type === 'text')?.text) ?? '';
    return { isError: result.isError === true, text, structured: result.structuredContent };
  };
  const call = async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
    const r = await callRaw(tool, args);
    if (r.isError) throw new Error(`${tool} failed: ${r.text}`);
    return r.structured as T;
  };
  return { client, call, callRaw, close: () => client.close() };
};

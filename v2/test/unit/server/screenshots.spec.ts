/**
 * Which screenshots ride along in a tool result as MCP images. Only
 * app.observe's viewport screenshot does, and only when it is small enough
 * for a host's image limits (about 1 MB, at most 8000 px a side); every
 * other screenshot (handoff.raise's full page) stays a path on disk, so the
 * agent's next model request is never rejected for an oversized image.
 */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { buildMcpServer } from '../../../src/server/server.js';
import { createRuntime } from '../../../src/tools/runtime.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
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

const crcTable = Array.from({ length: 256 }, (_, n) =>
  Array.from({ length: 8 }).reduce<number>((c) => (c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1), n));
const crc32 = (bytes: Buffer): number => (bytes.reduce((c, b) => crcTable[(c ^ b) & 0xff]! ^ (c >>> 8), 0xffffffff) ^ 0xffffffff) >>> 0;
const chunk = (type: string, data: Buffer): Buffer => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

/** A valid grayscale PNG of the given size, optionally padded (after IEND) to a byte length. */
const png = (width: number, height: number, padTo = 0): Buffer => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 0; // grayscale
  const rows = Buffer.alloc((width + 1) * height);
  const image = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return image.length >= padTo ? image : Buffer.concat([image, Buffer.alloc(padTo - image.length, 1)]);
};

const snapshot = (screenshotPath: string) => ({
  snapshotId: 'snap-1',
  pageId: 'p1',
  at: '2026-10-19T00:00:00.000Z',
  url: 'https://qa.example.com/App/Home',
  title: 'Home',
  variant: 'reactive' as const,
  scope: 'page',
  fingerprint: {
    hash: 'h', title: 'Home', path: '/App/Home', landmarks: [], roleCounts: {}, interactive: 0,
    rolelessInteractive: 0, placeholderOnlyInputs: 0, dataBlocks: 0, runtimeGlobal: null,
  },
  candidates: [],
  totalCandidates: 0,
  aria: '',
  truncated: false,
  screenshotPath,
});

describe('screenshots in tool results', () => {
  let root: string;
  let client: Client;
  let observeShot = '';

  const handlers = new Proxy({}, {
    get: (_target, name) => {
      if (name === 'app.observe') return async () => snapshot(observeShot);
      if (name === 'handoff.raise') return async () => ({ handoffId: 'h-1', path: '.tesseract/handoffs/h-1.json', screenshotPath: '.tesseract/snapshots/full.png' });
      return async () => { throw new ToolError('unclassified', `handler ${String(name)} not provided in this test`); };
    },
  }) as ToolHandlers;

  const images = (result: unknown): readonly { type: string; data?: string }[] =>
    (((result as { content?: unknown }).content ?? []) as { type: string; data?: string }[]).filter((c) => c.type === 'image');

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-shots-'));
    await mkdir(path.join(root, '.tesseract', 'snapshots'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'snapshots', 'small.png'), png(1280, 720));
    await writeFile(path.join(root, '.tesseract', 'snapshots', 'full.png'), png(1280, 720));
    await writeFile(path.join(root, '.tesseract', 'snapshots', 'heavy.png'), png(1280, 720, 1_200_000));
    await writeFile(path.join(root, '.tesseract', 'snapshots', 'tall.png'), png(1280, 33_018));
    const workspace = await loadWorkspace(root, {});
    const runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, log: () => undefined, session: 's-test' });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    client = new Client({ name: 'test', version: '1.0.0' });
    await Promise.all([buildMcpServer(runtime).connect(serverTransport), client.connect(clientTransport)]);
  });

  afterEach(async () => {
    await client.close();
    await rm(root, { recursive: true, force: true });
  });

  it('inlines app.observe\'s viewport screenshot', async () => {
    observeShot = '.tesseract/snapshots/small.png';
    const result = await client.callTool({ name: 'app_observe', arguments: { pageId: 'p1', includeScreenshot: true } });
    expect(images(result)).toHaveLength(1);
    expect(Buffer.from(images(result)[0]!.data!, 'base64').subarray(1, 4).toString('ascii')).toBe('PNG');
  });

  it('never inlines handoff.raise\'s full-page screenshot; the path is in the result', async () => {
    const result = await client.callTool({ name: 'handoff_raise', arguments: { testCaseId: '1', stepIndex: 1, blockage: 'not-found', unresolvedIntent: 'Click the Approve button', attempted: [], evidence: {}, nextMoves: [] } });
    expect(result.isError, JSON.stringify(result.content)).toBeFalsy();
    expect(images(result)).toEqual([]);
    expect(result.structuredContent).toMatchObject({ screenshotPath: '.tesseract/snapshots/full.png' });
  });

  it('does not inline a screenshot over 1 MB', async () => {
    observeShot = '.tesseract/snapshots/heavy.png';
    const result = await client.callTool({ name: 'app_observe', arguments: { pageId: 'p1', includeScreenshot: true } });
    expect(images(result)).toEqual([]);
    expect(result.structuredContent).toMatchObject({ screenshotPath: '.tesseract/snapshots/heavy.png' });
  });

  it('does not inline a screenshot taller or wider than 8000 px', async () => {
    observeShot = '.tesseract/snapshots/tall.png';
    const result = await client.callTool({ name: 'app_observe', arguments: { pageId: 'p1', includeScreenshot: true } });
    expect(images(result)).toEqual([]);
  });
});

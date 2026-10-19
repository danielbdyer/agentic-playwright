/**
 * Streamable HTTP front door: who may reach it (bearer token off loopback,
 * a Host allowlist on loopback), what a stale session id gets (404, per the
 * MCP spec, so the client re-initializes), how abandoned sessions are reaped,
 * and that closing the server closes every session's runtime.
 */
import { EventEmitter } from 'node:events';
import http from 'node:http';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as transports from '../../../src/server/transports.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';
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

const handlers = new Proxy({}, {
  get: (_target, name) => async () => {
    if (name === 'memory.query') return { facets: [], screenKnown: false };
    throw new ToolError('unclassified', `handler ${String(name)} not provided in this test`);
  },
}) as ToolHandlers;

const INIT = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'probe', version: '1.0.0' } },
};

const LIST = { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} };

const MCP_HEADERS = { 'content-type': 'application/json', accept: 'application/json, text/event-stream' };

interface Started {
  readonly server: http.Server;
  readonly base: string;
  readonly close: () => Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

describe('serveHttp', () => {
  let root: string;
  let workspace: Workspace;
  let created = 0;
  let closed = 0;
  const running: Started[] = [];

  const makeRuntime = (): Runtime => {
    created += 1;
    const runtime = createRuntime({ workspace, browser: nullPool, handlers, env: {}, log: () => undefined });
    return { ...runtime, close: async () => { closed += 1; await runtime.close(); } };
  };

  const start = async (options: Partial<transports.HttpOptions> = {}): Promise<Started> => {
    const handle = await transports.serveHttp({ port: 0, host: '127.0.0.1', createRuntime: makeRuntime, log: () => undefined, ...options });
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    const started: Started = { server: handle.server, base: `http://127.0.0.1:${port}`, close: handle.close };
    running.push(started);
    return started;
  };

  const initialize = async (base: string): Promise<string> => {
    const response = await fetch(`${base}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify(INIT) });
    expect(response.status).toBe(200);
    await response.text();
    const id = response.headers.get('mcp-session-id');
    expect(id).toBeTruthy();
    return id!;
  };

  const sessionCount = async (base: string): Promise<number> =>
    ((await (await fetch(`${base}/healthz`)).json()) as { sessions: number }).sessions;

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-http-'));
    workspace = await loadWorkspace(root, {});
    created = 0;
    closed = 0;
  });

  afterEach(async () => {
    await Promise.all(running.splice(0).map((s) => s.close().catch(() => undefined)));
    await rm(root, { recursive: true, force: true });
  });

  describe('access', () => {
    it('treats 127.0.0.1, localhost, ::1 and [::1] as loopback, and nothing else', () => {
      for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) expect(transports.isLoopbackHost(host)).toBe(true);
      for (const host of ['0.0.0.0', '::', '10.0.0.5', 'qa-node.internal', '[::]']) expect(transports.isLoopbackHost(host)).toBe(false);
    });

    it('allows the bracketed IPv6 loopback in the Host allowlist, with and without the port', () => {
      const allowed = transports.loopbackAllowedHosts(7341);
      expect(allowed).toEqual(expect.arrayContaining(['127.0.0.1', '127.0.0.1:7341', 'localhost', 'localhost:7341', '[::1]', '[::1]:7341']));
    });

    it('refuses to bind a non-loopback host without a bearer token, and creates nothing', async () => {
      const attempt = transports.serveHttp({ port: 0, host: '0.0.0.0', createRuntime: makeRuntime, log: () => undefined });
      // On the old code the server listened; make sure a stray listener is closed either way.
      const outcome = await attempt.then(
        async (handle) => {
          await handle.close?.();
          (handle as unknown as http.Server).close?.();
          return 'listening';
        },
        (error: unknown) => error,
      );
      expect(outcome).toBeInstanceOf(ToolError);
      expect((outcome as ToolError).family).toBe('not-configured');
      expect((outcome as ToolError).message).toMatch(/--token-env/);
      expect(created).toBe(0);
    });

    it('serves a non-loopback host when a token is configured, and still requires it', async () => {
      const handle = await transports.serveHttp({
        port: 0, host: '0.0.0.0', token: 'a-token-of-sixteen-chars', createRuntime: makeRuntime, log: () => undefined,
      });
      const address = handle.server.address();
      const port = typeof address === 'object' && address !== null ? address.port : 0;
      running.push({ server: handle.server, base: `http://127.0.0.1:${port}`, close: handle.close });
      const anonymous = await fetch(`http://127.0.0.1:${port}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify(INIT) });
      expect(anonymous.status).toBe(401);
      const authorized = await fetch(`http://127.0.0.1:${port}/mcp`, {
        method: 'POST', headers: { ...MCP_HEADERS, authorization: 'Bearer a-token-of-sixteen-chars' }, body: JSON.stringify(INIT),
      });
      expect(authorized.status).toBe(200);
    });

    it('keeps the Host check on loopback (DNS rebinding)', async () => {
      const { base } = await start();
      const port = new URL(base).port;
      const rebound = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          { host: '127.0.0.1', port, path: '/mcp', method: 'POST', headers: { ...MCP_HEADERS, host: `evil.attacker.example:${port}` } },
          (res) => { res.resume(); resolve(res.statusCode ?? 0); },
        );
        req.on('error', reject);
        req.end(JSON.stringify(INIT));
      });
      expect(rebound).toBe(403);
    });
  });

  describe('sessions', () => {
    it('answers an unknown session id with 404 and JSON-RPC -32001, and creates no runtime', async () => {
      const { base } = await start();
      const post = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, 'mcp-session-id': 'stale-session' }, body: JSON.stringify(LIST) });
      expect(post.status).toBe(404);
      expect(await post.json()).toMatchObject({ jsonrpc: '2.0', error: { code: -32001, message: 'Session not found' }, id: null });
      const get = await fetch(`${base}/mcp`, { method: 'GET', headers: { accept: 'text/event-stream', 'mcp-session-id': 'stale-session' } });
      expect(get.status).toBe(404);
      const del = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { 'mcp-session-id': 'stale-session' } });
      expect(del.status).toBe(404);
      expect(created).toBe(0);
    });

    it('answers a session closed by DELETE with 404 afterwards', async () => {
      const { base } = await start();
      const id = await initialize(base);
      const del = await fetch(`${base}/mcp`, { method: 'DELETE', headers: { 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' } });
      expect(del.status).toBe(200);
      const after = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, 'mcp-session-id': id }, body: JSON.stringify(LIST) });
      expect(after.status).toBe(404);
      expect(created).toBe(1);
      expect(closed).toBe(1);
    });

    it('closes the runtime of a POST that never initialized a session', async () => {
      const { base } = await start();
      const response = await fetch(`${base}/mcp`, { method: 'POST', headers: MCP_HEADERS, body: JSON.stringify(LIST) });
      expect(response.status).toBe(400);
      await response.text();
      expect(await sessionCount(base)).toBe(0);
      expect(closed).toBe(created);
    });

    it('lets a client re-initialize after a restart (a 404 on the old id)', async () => {
      const { base } = await start();
      const client = new Client({ name: 'gateway', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { sessionId: 'from-before-the-restart' }));
      const listed = await client.listTools().then(() => 'ok', (error: unknown) => String(error));
      expect(listed).toMatch(/404|Session not found/);
      await client.close();
    });

    it('reaps a session idle past the timeout, closing its runtime', async () => {
      const { base } = await start({ idleTimeoutMs: 400 });
      const id = await initialize(base);
      expect(await sessionCount(base)).toBe(1);
      await sleep(200);
      // Activity resets the clock.
      const listed = await fetch(`${base}/mcp`, {
        method: 'POST', headers: { ...MCP_HEADERS, 'mcp-session-id': id, 'mcp-protocol-version': '2025-06-18' }, body: JSON.stringify(LIST),
      });
      expect(listed.status).toBe(200);
      await listed.text();
      await sleep(250);
      expect(await sessionCount(base)).toBe(1);
      expect(closed).toBe(0);
      await sleep(600);
      expect(await sessionCount(base)).toBe(0);
      expect(closed).toBe(1);
      const stale = await fetch(`${base}/mcp`, { method: 'POST', headers: { ...MCP_HEADERS, 'mcp-session-id': id }, body: JSON.stringify(LIST) });
      expect(stale.status).toBe(404);
    });

    it('does not reap a session while a request is in flight', async () => {
      const { base } = await start({ idleTimeoutMs: 300 });
      const client = new Client({ name: 'held', version: '1.0.0' });
      await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
      // The SDK client holds a GET event stream open while connected.
      await sleep(900);
      expect(await sessionCount(base)).toBe(1);
      expect((await client.listTools()).tools.length).toBeGreaterThan(0);
      await client.close();
    });
  });

  describe('shutdown', () => {
    it('close() stops listening and closes every session runtime', async () => {
      const { base, close } = await start();
      await initialize(base);
      await initialize(base);
      expect(await sessionCount(base)).toBe(2);
      await close();
      expect(closed).toBe(2);
      await expect(fetch(`${base}/healthz`)).rejects.toThrow();
    });

    it('closes on SIGINT, SIGTERM or SIGHUP and exits 0 after the close', async () => {
      for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP'] as const) {
        const target = new EventEmitter();
        let closes = 0;
        const exits: number[] = [];
        const done = transports.closeOnSignals(async () => { closes += 1; }, {
          target, log: () => undefined, timeoutMs: 1000, exit: (code) => { exits.push(code); },
        });
        expect(target.listenerCount(signal)).toBe(1);
        target.emit(signal);
        await done;
        expect(closes).toBe(1);
        expect(exits).toEqual([0]);
      }
    });

    it('a second signal during shutdown forces exit 1 without closing twice', async () => {
      const target = new EventEmitter();
      let closes = 0;
      const exits: number[] = [];
      let finish = (): void => undefined;
      const done = transports.closeOnSignals(() => { closes += 1; return new Promise<void>((resolve) => { finish = resolve; }); }, {
        target, log: () => undefined, timeoutMs: 5000, exit: (code) => { exits.push(code); },
      });
      target.emit('SIGTERM');
      target.emit('SIGINT');
      expect(exits).toEqual([1]);
      finish();
      await done;
      expect(closes).toBe(1);
    });

    it('exits after the timeout when close hangs', async () => {
      const target = new EventEmitter();
      const exits: number[] = [];
      const done = transports.closeOnSignals(() => new Promise<void>(() => undefined), {
        target, log: () => undefined, timeoutMs: 50, exit: (code) => { exits.push(code); },
      });
      target.emit('SIGTERM');
      await done;
      expect(exits).toEqual([1]);
    });
  });
});

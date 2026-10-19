/**
 * Transports. stdio for a local host (Claude Code, Copilot, Codex, Cursor);
 * Streamable HTTP for a shared instance behind a team gateway, one runtime
 * (and so one browser pool) per MCP session.
 */
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildMcpServer } from './server.js';
import type { Runtime } from '../tools/runtime.js';

export const serveStdio = async (runtime: Runtime): Promise<void> => {
  const server = buildMcpServer(runtime);
  const transport = new StdioServerTransport();
  const shutdown = async (): Promise<void> => {
    await runtime.close();
    await server.close();
  };
  transport.onclose = () => {
    void shutdown().finally(() => process.exit(0));
  };
  process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));
  process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
  process.stdin.on('end', () => void shutdown().finally(() => process.exit(0)));
  await server.connect(transport);
};

export interface HttpOptions {
  readonly port: number;
  readonly host: string;
  /** When set, requests must carry `Authorization: Bearer <token>`. */
  readonly token?: string;
  readonly createRuntime: () => Runtime;
  readonly log: (message: string) => void;
}

const tokenMatches = (header: string | undefined, token: string): boolean => {
  if (header === undefined || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const LOCAL_HOSTS = ['127.0.0.1', 'localhost', '[::1]'];

export const serveHttp = async (options: HttpOptions): Promise<http.Server> => {
  const sessions = new Map<string, { transport: StreamableHTTPServerTransport; runtime: Runtime }>();
  const localOnly = LOCAL_HOSTS.includes(options.host);
  // The port actually bound (differs from options.port when it is 0); the Host allowlist needs it.
  let boundPort = options.port;

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (url.pathname === '/healthz') {
        res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, sessions: sessions.size }));
        return;
      }
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end();
        return;
      }
      if (options.token !== undefined && !tokenMatches(req.headers.authorization, options.token)) {
        res.writeHead(401, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'unauthorized' }));
        return;
      }
      const sessionHeader = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
      const existing = sessionId !== undefined ? sessions.get(sessionId) : undefined;
      if (existing !== undefined) {
        await existing.transport.handleRequest(req, res);
        return;
      }
      if (req.method !== 'POST') {
        res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'no session; initialize with POST first' }));
        return;
      }
      const runtime = options.createRuntime();
      const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (id) => {
          sessions.set(id, { transport, runtime });
        },
        ...(localOnly
          ? { enableDnsRebindingProtection: true, allowedHosts: LOCAL_HOSTS.flatMap((h) => [h, `${h}:${boundPort}`]) }
          : {}),
      });
      transport.onclose = () => {
        const id = transport.sessionId;
        if (id !== undefined) sessions.delete(id);
        void runtime.close();
      };
      const mcp = buildMcpServer(runtime);
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      options.log(`http request failed: ${(error as Error).message}`);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'internal error' }));
    }
  });

  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : options.port;
  boundPort = port;
  options.log(`MCP over Streamable HTTP at http://${options.host}:${port}/mcp${options.token !== undefined ? ' (bearer token required)' : ''}`);
  const closeAll = async (): Promise<void> => {
    await Promise.all([...sessions.values()].map(async ({ transport, runtime }) => {
      await transport.close();
      await runtime.close();
    }));
  };
  server.on('close', () => void closeAll());
  return server;
};

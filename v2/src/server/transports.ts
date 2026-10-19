/**
 * Transports. stdio for a local host (Claude Code, Copilot, Codex, Cursor);
 * Streamable HTTP for a shared instance behind a team gateway, one runtime
 * (and so one browser pool) per MCP session.
 *
 * HTTP access: a loopback bind checks the Host header (DNS rebinding); any
 * other bind requires a bearer token, because whoever reaches the port can
 * drive the browser with this server's credentials. Sessions end on DELETE,
 * after an idle timeout, or when the server closes; each end closes the
 * session's runtime (paused runs released, browsers closed). A request for a
 * session that does not exist (expired, deleted, or from before a restart)
 * gets 404, which tells an MCP client to initialize again.
 */
import http from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { ToolError } from '../core/errors.js';
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

/** Sessions with no request in flight for this long are closed. */
export const DEFAULT_IDLE_TIMEOUT_MS = 30 * 60 * 1000;

export interface HttpOptions {
  readonly port: number;
  readonly host: string;
  /** When set, requests must carry `Authorization: Bearer <token>`. Required for a non-loopback host. */
  readonly token?: string;
  readonly createRuntime: () => Runtime;
  readonly log: (message: string) => void;
  /** Close a session (its runtime and browsers) after this long without a request. Default 30 minutes; 0 never reaps. */
  readonly idleTimeoutMs?: number;
}

export interface HttpServerHandle {
  readonly server: http.Server;
  /** The MCP endpoint, with the port actually bound. */
  readonly url: string;
  /** Open sessions. */
  readonly sessionCount: () => number;
  /** Stop accepting requests, close every session (transport and runtime), and wait for the listener to close. Idempotent. */
  readonly close: () => Promise<void>;
}

const tokenMatches = (header: string | undefined, token: string): boolean => {
  if (header === undefined || !header.startsWith('Bearer ')) return false;
  const given = Buffer.from(header.slice('Bearer '.length));
  const expected = Buffer.from(token);
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const LOOPBACK_HOSTS: readonly string[] = ['127.0.0.1', 'localhost', '::1', '[::1]'];

export const isLoopbackHost = (host: string): boolean => LOOPBACK_HOSTS.includes(host.trim().toLowerCase());

/** Host header values a loopback bind accepts: each loopback name, bare and with the port (IPv6 bracketed, as Host carries it). */
export const loopbackAllowedHosts = (port: number): readonly string[] =>
  ['127.0.0.1', 'localhost', '[::1]'].flatMap((host) => [host, `${host}:${port}`]);

/** `listen` takes a bare IPv6 address; a URL needs it bracketed. */
const bareHost = (host: string): string => (host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host);
const urlHost = (host: string): string => (bareHost(host).includes(':') ? `[${bareHost(host)}]` : host);

/** Memoize an async action so concurrent and repeated callers share one run. */
const once = (action: () => Promise<void>): (() => Promise<void>) => {
  let pending: Promise<void> | undefined;
  return () => {
    pending ??= action();
    return pending;
  };
};

const sendJson = (res: http.ServerResponse, status: number, body: unknown): void => {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
};

/** JSON-RPC error body, as the MCP SDK writes its own transport errors. */
const rpcError = (code: number, message: string): unknown => ({ jsonrpc: '2.0', error: { code, message }, id: null });

interface Session {
  readonly transport: StreamableHTTPServerTransport;
  readonly close: () => Promise<void>;
  /** Requests whose response has not finished (a held event stream counts). */
  inFlight: number;
  lastActive: number;
}

export const serveHttp = async (options: HttpOptions): Promise<HttpServerHandle> => {
  const loopback = isLoopbackHost(options.host);
  if (!loopback && options.token === undefined) {
    throw new ToolError(
      'not-configured',
      `refusing to serve MCP over HTTP on ${options.host} without a bearer token: anyone who can reach the port could drive the browser with this server's credentials. ` +
        'Pass --token-env <NAME> naming a variable that holds a token of at least 16 characters, or bind a loopback host (127.0.0.1, localhost, ::1).',
      { host: options.host },
    );
  }
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  const sessions = new Map<string, Session>();
  // The port actually bound (differs from options.port when it is 0); the Host allowlist needs it.
  let boundPort = options.port;
  let closing = false;

  const closeQuietly = (what: string, action: () => Promise<void>) => async (): Promise<void> => {
    try {
      await action();
    } catch (error) {
      options.log(`closing ${what} failed: ${(error as Error).message}`);
    }
  };

  /** Count the request against the session until its response finishes or the connection drops. */
  const track = (session: Session, res: http.ServerResponse): void => {
    session.inFlight += 1;
    session.lastActive = Date.now();
    res.once('close', () => {
      session.inFlight -= 1;
      session.lastActive = Date.now();
    });
  };

  const startSession = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    const runtime = options.createRuntime();
    const closeRuntime = once(closeQuietly('runtime', () => runtime.close()));
    let session: Session | undefined;
    const transport: StreamableHTTPServerTransport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (id) => {
        session = {
          transport,
          close: once(async () => {
            await closeQuietly('transport', () => transport.close())();
            await closeRuntime();
          }),
          inFlight: 0,
          lastActive: Date.now(),
        };
        sessions.set(id, session);
      },
      ...(loopback ? { enableDnsRebindingProtection: true, allowedHosts: [...loopbackAllowedHosts(boundPort)] } : {}),
    });
    transport.onclose = () => {
      const id = transport.sessionId;
      if (id !== undefined && sessions.get(id)?.transport === transport) sessions.delete(id);
      void closeRuntime();
    };
    const discard = async (): Promise<void> => {
      if (session !== undefined) {
        await session.close();
        return;
      }
      await closeQuietly('transport', () => transport.close())();
      await closeRuntime();
    };
    try {
      const mcp = buildMcpServer(runtime);
      await mcp.connect(transport);
      await transport.handleRequest(req, res);
    } catch (error) {
      await discard();
      throw error;
    }
    // Not an initialize request (the transport answered 400), or the server began closing meanwhile: nothing to keep.
    if (session === undefined || closing) {
      await discard();
      return;
    }
    session.lastActive = Date.now();
  };

  const handle = async (req: http.IncomingMessage, res: http.ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (url.pathname === '/healthz') {
        sendJson(res, 200, { ok: true, sessions: sessions.size });
        return;
      }
      if (url.pathname !== '/mcp') {
        res.writeHead(404).end();
        return;
      }
      if (options.token !== undefined && !tokenMatches(req.headers.authorization, options.token)) {
        sendJson(res, 401, { error: 'unauthorized' });
        return;
      }
      if (closing) {
        sendJson(res, 503, rpcError(-32000, 'Server shutting down'));
        return;
      }
      const sessionHeader = req.headers['mcp-session-id'];
      const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;
      if (sessionId !== undefined) {
        const existing = sessions.get(sessionId);
        if (existing === undefined) {
          // Expired, deleted, or from before a restart: 404 tells the client to initialize a new session.
          sendJson(res, 404, rpcError(-32001, 'Session not found'));
          return;
        }
        track(existing, res);
        await existing.transport.handleRequest(req, res);
        return;
      }
      if (req.method !== 'POST') {
        sendJson(res, 400, rpcError(-32000, 'Bad Request: no session; initialize with POST first'));
        return;
      }
      await startSession(req, res);
    } catch (error) {
      options.log(`http request failed: ${(error as Error).message}`);
      if (!res.headersSent) sendJson(res, 500, { error: 'internal error' });
    }
  };
  // Every failure is answered inside handle(); the server callback only starts it.
  const server = http.createServer((req, res) => {
    void handle(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port, bareHost(options.host), () => {
      server.off('error', reject);
      resolve();
    });
  });
  const address = server.address();
  boundPort = typeof address === 'object' && address !== null ? address.port : options.port;
  const endpoint = `http://${urlHost(options.host)}:${boundPort}/mcp`;
  options.log(`MCP over Streamable HTTP at ${endpoint}${options.token !== undefined ? ' (bearer token required)' : ''}`);

  const reaper = idleTimeoutMs > 0
    ? setInterval(() => {
        const now = Date.now();
        for (const [id, session] of sessions) {
          if (session.inFlight === 0 && now - session.lastActive > idleTimeoutMs) {
            options.log(`closing session ${id}: idle for more than ${Math.round(idleTimeoutMs / 1000)} s`);
            sessions.delete(id);
            void session.close();
          }
        }
      }, Math.min(Math.max(Math.floor(idleTimeoutMs / 4), 25), 60_000))
    : undefined;
  reaper?.unref();

  const close = once(async () => {
    closing = true;
    if (reaper !== undefined) clearInterval(reaper);
    const stopped = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeIdleConnections();
    const open = [...sessions.values()];
    sessions.clear();
    await Promise.all(open.map((session) => session.close()));
    server.closeAllConnections();
    await stopped;
  });
  server.on('close', () => {
    void close();
  });
  return { server, url: endpoint, sessionCount: () => sessions.size, close };
};

export interface SignalOptions {
  readonly log: (message: string) => void;
  /** Budget for close(); after it the process exits 1 anyway. Default 20 s. */
  readonly timeoutMs?: number;
  readonly signals?: readonly NodeJS.Signals[];
  /** Where signals arrive (default: process). */
  readonly target?: { on(event: string, listener: () => void): unknown };
  /** How to leave (default: process.exit). */
  readonly exit?: (code: number) => void;
}

export const SHUTDOWN_TIMEOUT_MS = 20_000;

/**
 * On the first SIGINT, SIGTERM, or SIGHUP run close() and exit 0 (1 if it
 * failed or ran past the timeout); a second signal exits 1 at once. The
 * promise settles when the process is about to exit. Playwright installs its
 * own signal handlers once a browser launches (closing browsers only, so the
 * process would otherwise outlive SIGTERM); this one owns the exit.
 */
export const closeOnSignals = (close: () => Promise<void>, options: SignalOptions): Promise<void> =>
  new Promise<void>((resolve) => {
    const target = options.target ?? process;
    const exit = options.exit ?? ((code: number) => process.exit(code));
    const timeoutMs = options.timeoutMs ?? SHUTDOWN_TIMEOUT_MS;
    let stopping = false;
    let finished = false;
    const finish = (code: number): void => {
      if (finished) return;
      finished = true;
      exit(code);
      resolve();
    };
    const onSignal = (signal: NodeJS.Signals): void => {
      if (stopping) {
        options.log(`${signal} during shutdown; exiting now`);
        exit(1);
        return;
      }
      stopping = true;
      options.log(`${signal}: closing sessions, paused runs, and browsers`);
      const timer = setTimeout(() => {
        options.log(`shutdown did not finish within ${timeoutMs} ms; exiting`);
        finish(1);
      }, timeoutMs);
      close().then(
        () => {
          clearTimeout(timer);
          finish(0);
        },
        (error: unknown) => {
          clearTimeout(timer);
          options.log(`shutdown failed: ${error instanceof Error ? error.message : String(error)}`);
          finish(1);
        },
      );
    };
    for (const signal of options.signals ?? (['SIGINT', 'SIGTERM', 'SIGHUP'] as const)) {
      target.on(signal, () => onSignal(signal));
    }
  });

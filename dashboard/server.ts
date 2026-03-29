/**
 * Tesseract Dashboard Server — Effect-native TypeScript with PubSub event bus.
 *
 * Architecture:
 *   Effect.PubSub (event bus) → SharedArrayBuffer ring (zero-copy)
 *                              → WS broadcast (remote access)
 *
 * The server lifecycle is an Effect program:
 *   1. Create PipelineEventBus (PubSub + SharedArrayBuffer + string channel)
 *   2. Start HTTP server (static files + REST + MCP + WS upgrade)
 *   3. Start WS subscriber fiber (PubSub → broadcast)
 *   4. Start buffer writer fiber (PubSub → SharedArrayBuffer)
 *   5. (optional) Start speedrun fiber (pipeline → PubSub via DashboardPort)
 *
 * Effect is the first-class citizen:
 *   - PubSub for event distribution
 *   - Fiber for concurrent WS/buffer/speedrun subscribers
 *   - Scope for resource cleanup
 *   - Layer for service composition (DashboardPort injection)
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Effect, PubSub, Queue, Fiber, Scope } from 'effect';
import type { DashboardEvent } from '../lib/domain/types';
import { dashboardEvent } from '../lib/domain/types/dashboard';
import {
  createPipelineEventBus,
  subscribeWsBroadcaster,
  type PipelineEventBus,
} from '../lib/infrastructure/dashboard/pipeline-event-bus';
import {
  subscribeJournalWriter,
  journalWriterConfig,
} from '../lib/infrastructure/dashboard/journal-writer';
import { createProjectPaths, type ProjectPaths } from '../lib/application/paths';
import { runWithLocalServices, type LocalServiceOptions } from '../lib/composition/local-services';
import { speedrunProgram } from '../lib/application/speedrun';
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/types';

// ─── CLI Flags ───

const argAfter = (flag: string): string | null => {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1]! : null;
};

const PORT = parseInt(argAfter('--port') ?? '3100', 10);
const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = __dirname;
const SPEEDRUN = process.argv.includes('--speedrun');
const JOURNAL = process.argv.includes('--journal') || SPEEDRUN;
const JOURNAL_RUN_ID = argAfter('--run-id') ?? `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

// ─── MIME + File Helpers ───

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.json': 'application/json', '.css': 'text/css', '.yaml': 'text/yaml',
};

const readJsonFile = (filePath: string): unknown | null => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8')); }
  catch { return null; }
};

const readTextFile = (filePath: string): string | null => {
  try { return fs.readFileSync(path.join(ROOT, filePath), 'utf8'); }
  catch { return null; }
};

// ─── WebSocket (minimal, zero-dependency) ───

interface WsClient { readonly socket: import('net').Socket; alive: boolean }
const wsClients = new Set<WsClient>();

const encodeWsFrame = (data: unknown): Buffer => {
  const json = JSON.stringify(data);
  const buf = Buffer.from(json, 'utf8');
  const header = buf.length < 126
    ? Buffer.from([0x81, buf.length])
    : buf.length < 65536
      ? Buffer.from([0x81, 126, (buf.length >> 8) & 0xff, buf.length & 0xff])
      : (() => { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(buf.length), 2); return h; })();
  return Buffer.concat([header, buf]);
};

const broadcast = (msg: unknown): void => {
  const frame = encodeWsFrame(msg);
  for (const ws of wsClients) {
    try { ws.socket.write(frame); } catch { wsClients.delete(ws); }
  }
};

const decodeWsFrame = (buf: Buffer): Record<string, unknown> | null => {
  if (buf.length < 2) return null;
  const opcode = buf[0]! & 0x0f;
  if (opcode === 0x8 || opcode === 0x9) return null;
  const masked = (buf[1]! & 0x80) !== 0;
  let len = buf[1]! & 0x7f;
  let offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  const mask = masked ? buf.subarray(offset, offset + 4) : null;
  if (masked) offset += 4;
  const data = buf.subarray(offset, offset + len);
  if (mask) for (let i = 0; i < data.length; i++) data[i]! ^= mask[i % 4]!;
  try { return JSON.parse(data.toString('utf8')); }
  catch { return null; }
};

// ─── MCP Tools ───

const MCP_TOOLS = [
  { name: 'list_probed_elements', category: 'observe', description: 'List probed elements.' },
  { name: 'get_screen_capture', category: 'observe', description: 'Get latest screenshot.' },
  { name: 'get_knowledge_state', category: 'observe', description: 'Get knowledge graph state.' },
  { name: 'get_queue_items', category: 'observe', description: 'List pending work items.' },
  { name: 'get_fitness_metrics', category: 'observe', description: 'Get fitness scorecard.' },
  { name: 'approve_work_item', category: 'decide', description: 'Approve work item.' },
  { name: 'skip_work_item', category: 'decide', description: 'Skip work item.' },
  { name: 'get_iteration_status', category: 'control', description: 'Get iteration status.' },
] as const;

const handleMcpToolCall = (tool: string, args: Record<string, unknown>): unknown => {
  switch (tool) {
    case 'list_probed_elements': {
      const wb = readJsonFile('.tesseract/workbench/index.json') as { items?: readonly Record<string, unknown>[] } | null;
      if (!wb?.items) return { elements: [], count: 0 };
      const screenFilter = args.screen as string | undefined;
      const items = screenFilter ? wb.items.filter((i) => (i.context as Record<string, unknown>)?.screen === screenFilter) : wb.items;
      return { elements: items.flatMap((i) => [{ id: i.id, screen: (i.context as Record<string, unknown>)?.screen ?? null, confidence: ((i.evidence as Record<string, unknown>)?.confidence as number) ?? 0 }]), count: items.length };
    }
    case 'get_screen_capture': return { error: 'No screenshot available', available: false };
    case 'get_knowledge_state': {
      const graph = readJsonFile('.tesseract/graph/index.json') as { nodes?: readonly unknown[]; edges?: readonly unknown[] } | null;
      return graph ? { nodes: (graph.nodes ?? []).slice(0, 100), totalNodes: (graph.nodes ?? []).length } : { nodes: [], totalNodes: 0 };
    }
    case 'get_queue_items': {
      const wb = readJsonFile('.tesseract/workbench/index.json') as { items?: readonly unknown[]; summary?: unknown } | null;
      return wb ? { items: wb.items ?? [], count: (wb.items ?? []).length, summary: wb.summary } : { items: [], count: 0 };
    }
    case 'get_fitness_metrics': {
      const sc = readJsonFile('.tesseract/benchmarks/scorecard.json') as { highWaterMark?: unknown } | null;
      return sc?.highWaterMark ?? { error: 'No scorecard' };
    }
    case 'get_iteration_status': {
      const text = readTextFile('.tesseract/runs/speedrun-progress.jsonl');
      if (!text) return { phase: 'idle' };
      const lines = text.trim().split('\n');
      try { return JSON.parse(lines[lines.length - 1]!); }
      catch { return { phase: 'unknown' }; }
    }
    default: return { error: `Unknown tool: ${tool}`, isError: true };
  }
};

// ─── HTTP Request Handler ───

const handleRequest = (req: http.IncomingMessage, res: http.ServerResponse): void => {
  const url = new URL(req.url!, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/api/workbench') {
    const data = readJsonFile('.tesseract/workbench/index.json');
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? { error: 'not found' }));
    return;
  }
  if (url.pathname === '/api/fitness') {
    const data = readJsonFile('.tesseract/benchmarks/scorecard.json');
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? { error: 'not found' }));
    return;
  }
  if (url.pathname === '/api/mcp/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: MCP_TOOLS }));
    return;
  }
  if (url.pathname === '/api/mcp/call' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', () => {
      try {
        const { tool, arguments: args } = JSON.parse(body);
        const result = handleMcpToolCall(tool, args ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tool, result, isError: !!(result as Record<string, unknown>)?.isError }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }
  if (url.pathname === '/api/capabilities') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ screenshotStream: true, liveDomPortal: false, mcpServer: true, mcpEndpoint: `http://localhost:${PORT}/api/mcp`, playwrightMcp: false, version: '2.0' }));
    return;
  }

  // ─── Playback API ───

  if (url.pathname === '/api/runs') {
    const runsDir = path.join(ROOT, '.tesseract', 'runs');
    try {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true });
      const runs = entries
        .filter((e) => e.isDirectory())
        .map((e) => {
          const journalPath = path.join(runsDir, e.name, 'dashboard-events.jsonl');
          try {
            fs.statSync(journalPath);
          } catch {
            return null;
          }
          const index = readJsonFile(path.join('.tesseract', 'runs', e.name, 'dashboard-events.index.json')) as { totalEvents?: number; totalDurationMs?: number } | null;
          return {
            runId: e.name,
            journalPath: `/api/runs/${encodeURIComponent(e.name)}/journal`,
            indexPath: `/api/runs/${encodeURIComponent(e.name)}/journal/index`,
            eventCount: index?.totalEvents ?? 0,
            durationMs: index?.totalDurationMs ?? 0,
          };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ runs }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ runs: [] }));
    }
    return;
  }
  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/journal/index')) {
    const segments = url.pathname.split('/');
    const runId = decodeURIComponent(segments[3] ?? '');
    if (!runId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'missing runId' })); return; }
    const rel = path.relative(path.join(ROOT, '.tesseract', 'runs'), path.join(ROOT, '.tesseract', 'runs', runId));
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end(); return; }
    const data = readTextFile(path.join('.tesseract', 'runs', runId, 'dashboard-events.index.json'));
    if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'index not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
    return;
  }
  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/journal')) {
    const segments = url.pathname.split('/');
    const runId = decodeURIComponent(segments[3] ?? '');
    if (!runId) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'missing runId' })); return; }
    const rel = path.relative(path.join(ROOT, '.tesseract', 'runs'), path.join(ROOT, '.tesseract', 'runs', runId));
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); res.end(); return; }
    const data = readTextFile(path.join('.tesseract', 'runs', runId, 'dashboard-events.jsonl'));
    if (!data) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'journal not found' })); return; }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(data);
    return;
  }

  // Static file serving
  let filePath: string;
  if (url.pathname === '/' || url.pathname === '/index.html') filePath = path.join(DASHBOARD_DIR, 'index.html');
  else if (url.pathname === '/dashboard.js') filePath = path.join(DASHBOARD_DIR, 'dashboard.js');
  else if (url.pathname === '/styles.css') filePath = path.join(DASHBOARD_DIR, 'styles.css');
  else filePath = path.join(DASHBOARD_DIR, url.pathname);

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
};

// ─── WebSocket Accept ───

const acceptWebSocket = (req: http.IncomingMessage, socket: import('net').Socket): void => {
  const key = req.headers['sec-websocket-key']!;
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11B65B').digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  const ws: WsClient = { socket, alive: true };
  wsClients.add(ws);
  socket.on('data', (buf: Buffer) => { const msg = decodeWsFrame(buf); if (msg?.type === 'ping') socket.write(encodeWsFrame({ type: 'pong' })); });
  socket.on('close', () => wsClients.delete(ws));
  socket.on('error', () => wsClients.delete(ws));
};

// ─── File Watchers ───

let watchDebounce: ReturnType<typeof setTimeout> | null = null;
const watchArtifacts = (): void => {
  for (const dir of ['.tesseract/workbench', '.tesseract/benchmarks', '.tesseract/runs'].map((d) => path.join(ROOT, d))) {
    try {
      fs.watch(dir, { recursive: true }, () => {
        if (watchDebounce) clearTimeout(watchDebounce);
        watchDebounce = setTimeout(() => {
          const wb = readJsonFile('.tesseract/workbench/index.json');
          if (wb) broadcast({ type: 'workbench-updated', data: wb });
          const sc = readJsonFile('.tesseract/benchmarks/scorecard.json');
          if (sc) broadcast({ type: 'fitness-updated', data: sc });
        }, 500);
      });
    } catch { /* dir may not exist */ }
  }
};

// ─── Main Effect Program ───

const main = Effect.gen(function* () {
  const paths = createProjectPaths(ROOT, path.join(ROOT, 'dogfood'));

  // 1. Create event bus (Effect PubSub + SharedArrayBuffer)
  const bus = yield* createPipelineEventBus({ bufferCapacity: 2048, decisionTimeoutMs: 0 });

  // 2. Start buffer writer fiber
  const bufferFiber = yield* bus.start();

  // 3. Start WS broadcast subscriber fiber
  const wsFiber = yield* subscribeWsBroadcaster(bus.pubsub, broadcast);

  // 3b. Start journal writer fiber (records events for time-lapse replay)
  if (JOURNAL) {
    const journalDir = path.join(ROOT, '.tesseract', 'runs', JOURNAL_RUN_ID);
    const journalPath = path.join(journalDir, 'dashboard-events.jsonl');
    const config = journalWriterConfig({
      journalPath,
      flushIntervalMs: 1000,
      maxFileSizeBytes: 50_000_000, // 50 MB
    });
    const journalFiber = yield* subscribeJournalWriter(bus.pubsub, config);
    console.log(`  Journal:    ${journalPath}`);
  }

  // 4. Start HTTP server
  const server = http.createServer(handleRequest);
  server.on('upgrade', (req, socket) => { if (req.url === '/ws') acceptWebSocket(req, socket as import('net').Socket); else (socket as import('net').Socket).destroy(); });

  yield* Effect.async<void>((resume) => {
    server.listen(PORT, () => {
      console.log(`\n  Tesseract Dashboard v2: http://localhost:${PORT}`);
      console.log(`  Event bus:  Effect.PubSub → SharedArrayBuffer (${2048} slots)`);
      console.log(`  WebSocket:  ws://localhost:${PORT}/ws`);
      console.log(`  MCP Tools:  http://localhost:${PORT}/api/mcp/tools`);
      if (JOURNAL) console.log(`  Journal:    .tesseract/runs/${JOURNAL_RUN_ID}/dashboard-events.jsonl`);
      if (SPEEDRUN) console.log(`  Speedrun:   active`);
      console.log('');
      resume(Effect.void);
    });
  });

  watchArtifacts();

  // 5. (Optional) Start speedrun with event bus dashboard port
  if (SPEEDRUN) {
    const count = parseInt(argAfter('--count') ?? '50', 10);
    const seed = argAfter('--seed') ?? 'speedrun-v1';
    const maxIterations = parseInt(argAfter('--max-iterations') ?? '5', 10);
    const posture = argAfter('--posture') ?? 'warm-start';

    console.log(`  Speedrun: count=${count} seed=${seed} maxIterations=${maxIterations} posture=${posture}\n`);

    const program = speedrunProgram({
      paths,
      config: DEFAULT_PIPELINE_CONFIG,
      count,
      seed,
      maxIterations,
      knowledgePosture: posture as 'warm-start' | 'cold-start' | 'production',
      onProgress: (event) => {
        broadcast({ type: 'progress', timestamp: new Date().toISOString(), data: event });
      },
    });

    yield* Effect.fork(
      Effect.gen(function* () {
        yield* Effect.promise(() => runWithLocalServices(program, ROOT, {
          suiteRoot: paths.suiteRoot,
          dashboard: bus.dashboardPort,
        }));
        console.log('\n  Speedrun complete. Dashboard remains active.\n');
      }),
    );
  }

  // Keep the server alive — await never returns
  yield* Effect.never;
});

// ─── Run ───

Effect.runPromise(Effect.scoped(main)).catch((err) => {
  console.error('Dashboard server error:', err);
  process.exitCode = 1;
});

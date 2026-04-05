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
import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import { Effect, PubSub, Queue, Fiber, Scope } from 'effect';
import type { DashboardEvent } from '../lib/domain/observation/contracts';
import { dashboardEvent } from '../lib/domain/observation/contracts';
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
import { DEFAULT_PIPELINE_CONFIG } from '../lib/domain/attention/pipeline-config';
import { startFixtureServer, type FixtureServer } from '../lib/infrastructure/fixture-server';
import { createPlaywrightBrowserPool } from '../lib/infrastructure/playwright-browser-pool';
import { resolvePlaywrightHeadless } from '../lib/infrastructure/tooling/browser-options';
import { withScreencast } from '../lib/infrastructure/dashboard/cdp-screencast';

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

/** Generate a filesystem-safe run ID from the current timestamp. */
function generateRunId(): string {
  return `run-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;
}
const JOURNAL_RUN_ID = argAfter('--run-id') ?? generateRunId();

// ─── Runtime State (mutable, set by speedrun fiber) ───

/** URL of the fixture server (AUT) when active. Enables LiveDomPortal fallback. */
let activeFixtureUrl: string | null = null;
/** Whether CDP screencast is actively streaming frames. */
let screencastActive = false;

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

// ─── WebSocket (ws library — RFC 6455 compliant) ───

const wsClients = new Set<WsWebSocket>();

let broadcastCount = 0;
const broadcast = (msg: unknown): void => {
  broadcastCount++;
  if (broadcastCount <= 5 || broadcastCount % 100 === 0) {
    console.log(`  [ws-broadcast] #${broadcastCount} clients=${wsClients.size} type=${(msg as { type?: string })?.type ?? '?'}`);
  }
  const json = JSON.stringify(msg);
  for (const ws of wsClients) {
    if (ws.readyState === WsWebSocket.OPEN) {
      ws.send(json, (err) => { if (err) wsClients.delete(ws); });
    }
  }
};

/**
 * Binary frame broadcast — sends raw JPEG bytes with a minimal header.
 * Format: [0x01 (type)] [uint16 width] [uint16 height] [JPEG bytes]
 * This avoids JSON+base64 overhead (~33% savings) and lets the client
 * decode off-thread via createImageBitmap.
 */
let frameCount = 0;
const broadcastFrame = (base64: string, width: number, height: number): void => {
  frameCount++;
  if (frameCount <= 3 || frameCount % 50 === 0) {
    console.log(`  [ws-frame] #${frameCount} ${width}x${height} clients=${wsClients.size}`);
  }
  const jpegBytes = Buffer.from(base64, 'base64');
  const header = Buffer.alloc(5);
  header[0] = 0x01; // message type: screencast frame
  header.writeUInt16BE(width, 1);
  header.writeUInt16BE(height, 3);
  const packet = Buffer.concat([header, jpegBytes]);
  for (const ws of wsClients) {
    if (ws.readyState === WsWebSocket.OPEN) {
      ws.send(packet, (err) => { if (err) wsClients.delete(ws); });
    }
  }
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
    res.end(JSON.stringify({
      screenshotStream: screencastActive,
      liveDomPortal: activeFixtureUrl !== null,
      mcpServer: true,
      mcpEndpoint: `http://localhost:${PORT}/api/mcp`,
      playwrightMcp: false,
      appUrl: activeFixtureUrl,
      version: '2.1',
    }));
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

// ─── WebSocket Server (ws library) ───

let wss: InstanceType<typeof WebSocketServer> | null = null;

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

  // 4. Start HTTP server + WebSocket server (ws library)
  const server = http.createServer(handleRequest);
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log(`  [ws-accept] client connected, total=${wsClients.size}`);
    ws.on('close', () => { wsClients.delete(ws); console.log(`  [ws-close] client disconnected, remaining=${wsClients.size}`); });
    ws.on('error', () => { wsClients.delete(ws); });
    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg?.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
      } catch { /* ignore malformed */ }
    });
  });

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
    const headless = resolvePlaywrightHeadless(process.env);
    const interpreterMode = (argAfter('--mode') ?? 'playwright') as 'dry-run' | 'diagnostic' | 'playwright';
    const needsBrowser = interpreterMode === 'playwright';

    console.log(`  Speedrun: count=${count} seed=${seed} maxIterations=${maxIterations} posture=${posture} headless=${headless}\n`);

    yield* Effect.fork(
      Effect.gen(function* () {
        // Acquire fixture server + browser pool for Playwright mode
        const fixtureServer = needsBrowser
          ? yield* Effect.promise(() => startFixtureServer({ rootDir: ROOT }))
          : null;
        const browserPool = needsBrowser
          ? yield* Effect.promise(() => createPlaywrightBrowserPool({
              headless,
              config: { poolSize: 4, preWarm: true, maxPageAgeMs: 300_000 },
            }))
          : undefined;

        const baseUrl = fixtureServer?.baseUrl;

        // Expose fixture URL for LiveDomPortal fallback (via /api/capabilities)
        if (baseUrl) activeFixtureUrl = baseUrl;

        if (fixtureServer) console.log(`  Fixture server: ${fixtureServer.baseUrl}`);
        if (browserPool) console.log(`  Browser pool: 4 pages (${headless ? 'headless' : 'HEADED'})`);

        // Wrap pool with CDP screencast — frames stream to dashboard via WS broadcast.
        // Falls back gracefully: if CDP is unavailable, the pool works normally and
        // the dashboard uses LiveDomPortal (iframe) instead.
        let screencastFrameCount = 0;
        const poolWithScreencast = browserPool
          ? withScreencast(browserPool, (frame) => {
              if (!screencastActive) {
                screencastActive = true;
                broadcast({ type: 'connected', data: { connected: true } });
                console.log('  CDP screencast: first frame — streaming live.');
              }
              screencastFrameCount++;
              // Binary WS: raw JPEG bytes with 5-byte header — no JSON/base64 overhead
              broadcastFrame(frame.imageBase64, frame.width, frame.height);
            }, { quality: 60, maxWidth: 1280, maxHeight: 720 })
          : undefined;

        if (browserPool) console.log(`  CDP screencast: ${headless ? 'headless (may not produce frames)' : 'HEADED — live frames will stream to dashboard'}`);

        const program = speedrunProgram({
          paths,
          config: DEFAULT_PIPELINE_CONFIG,
          count,
          seed,
          maxIterations,
          interpreterMode,
          knowledgePosture: posture as 'warm-start' | 'cold-start' | 'production',
          baseUrl,
          browserPool: poolWithScreencast,
          onProgress: (event) => {
            broadcast({ type: 'progress', timestamp: new Date().toISOString(), data: event });
          },
        });

        try {
          yield* Effect.promise(() => runWithLocalServices(program, ROOT, {
            suiteRoot: paths.suiteRoot,
            dashboard: bus.dashboardPort,
            browserPool: poolWithScreencast,
          }));
          console.log(`\n  Speedrun complete. Screencast frames: ${screencastFrameCount}. Dashboard remains active.\n`);
        } finally {
          screencastActive = false;
          activeFixtureUrl = null;
          const poolToClose = poolWithScreencast ?? browserPool;
          if (poolToClose) {
            const stats = poolToClose.stats;
            console.log(`  Browser pool stats: acquired=${stats.totalAcquired} released=${stats.totalReleased} overflow=${stats.totalOverflow} resets=${stats.totalResets}`);
            yield* Effect.promise(() => poolToClose.close());
          }
          if (fixtureServer) yield* Effect.promise(() => fixtureServer.stop());
        }
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

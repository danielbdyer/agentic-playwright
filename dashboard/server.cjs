/**
 * Tesseract Dashboard Server — WebSocket + REST + MCP + Effect integration.
 *
 * Architecture:
 *   HTTP :3100 — static files + REST API + MCP tools + WebSocket upgrade
 *   REST  /api/workbench, /api/fitness, /api/workbench/complete
 *   MCP   /api/mcp/tools, /api/mcp/call, /api/capabilities
 *   WS    /ws — bidirectional streaming (progress, updates, decisions)
 *
 * Effect programs are called via runWithLocalServices for mutations.
 * WebSocket broadcasts updates to all connected clients in real-time.
 * MCP tools expose the same observables the spatial canvas renders.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--port') ?? '3100', 10);
const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = __dirname;
const SPEEDRUN = process.argv.includes('--speedrun');

/** Read the value of a CLI flag like --count 50. */
function argAfter(flag) {
  const idx = process.argv.indexOf(flag);
  return idx >= 0 && idx + 1 < process.argv.length ? process.argv[idx + 1] : null;
}

// ─── MIME types ───

const MIME = {
  '.html': 'text/html', '.js': 'application/javascript',
  '.json': 'application/json', '.css': 'text/css', '.yaml': 'text/yaml',
};

// ─── Effect integration (lazy-loaded from dist/) ───

let effectReady = false;
let runWithLocalServices = null;
let createProjectPaths = null;
let paths = null;

function initEffect() {
  if (effectReady) return true;
  try {
    const localServices = require(path.join(ROOT, 'dist', 'lib', 'composition', 'local-services.js'));
    const pathsMod = require(path.join(ROOT, 'dist', 'lib', 'application', 'paths.js'));
    runWithLocalServices = localServices.runWithLocalServices;
    createProjectPaths = pathsMod.createProjectPaths;
    paths = createProjectPaths(ROOT, path.join(ROOT, 'dogfood'));
    effectReady = true;
    return true;
  } catch (err) {
    console.error('Effect runtime not available (run npm run build first):', err.message);
    return false;
  }
}

async function runEffect(programFn) {
  if (!initEffect()) throw new Error('Effect runtime not loaded');
  const program = programFn(paths);
  return runWithLocalServices(program, ROOT, { suiteRoot: paths.suiteRoot });
}

// ─── File reading helpers ───

function readJsonFile(filePath) {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, filePath), 'utf8')); }
  catch { return null; }
}

function readTextFile(filePath) {
  try { return fs.readFileSync(path.join(ROOT, filePath), 'utf8'); }
  catch { return null; }
}

// ─── MCP State (shared with WS adapter for decision routing) ───

/** Pending decisions: workItemId → resolver callback. Shared between WS and MCP. */
const pendingDecisions = new Map();

/** Latest screenshot cache for MCP get_screen_capture tool. */
let lastScreenshot = null;

/** Playwright bridge reference for browser_* MCP tools. Set when headed mode is active. */
let playwrightBridge = null;

/** MCP tool catalog — observation + decision + browser tools. */
const MCP_TOOLS = [
  { name: 'list_probed_elements', category: 'observe', description: 'List all elements currently probed in the resolution pipeline.' },
  { name: 'get_screen_capture', category: 'observe', description: 'Get the latest screenshot of the application under test.' },
  { name: 'get_knowledge_state', category: 'observe', description: 'Get current knowledge graph state.' },
  { name: 'get_queue_items', category: 'observe', description: 'List pending work items in the decision queue.' },
  { name: 'get_fitness_metrics', category: 'observe', description: 'Get current fitness scorecard.' },
  { name: 'approve_work_item', category: 'decide', description: 'Approve a pending work item, resuming the paused Effect fiber.' },
  { name: 'skip_work_item', category: 'decide', description: 'Skip a pending work item.' },
  // Browser tools — progressive enhancement, available in headed mode with Playwright
  { name: 'browser_screenshot', category: 'observe', description: 'Capture page screenshot via Playwright (headed mode).' },
  { name: 'browser_query', category: 'observe', description: 'Get bounding box of element via Playwright (headed mode).' },
  { name: 'browser_aria_snapshot', category: 'observe', description: 'Get ARIA accessibility tree (headed mode).' },
  { name: 'browser_click', category: 'control', description: 'Click element via Playwright (headed mode, fiber pause only).' },
  { name: 'browser_fill', category: 'control', description: 'Fill input via Playwright (headed mode, fiber pause only).' },
  { name: 'browser_navigate', category: 'control', description: 'Navigate to URL via Playwright (headed mode, fiber pause only).' },
  { name: 'get_iteration_status', category: 'control', description: 'Get current iteration number, phase, and convergence metrics.' },
];

/** Route an MCP tool call to the appropriate handler. */
async function handleMcpToolCall(tool, args) {
  switch (tool) {
    case 'list_probed_elements': {
      const wb = readJsonFile('.tesseract/workbench/index.json');
      if (!wb || !wb.items) return { elements: [], count: 0 };
      const screen = args.screen;
      const items = screen ? wb.items.filter(i => i.context?.screen === screen) : wb.items;
      return {
        elements: items.map(i => ({
          id: i.id, element: i.context?.element ?? null, screen: i.context?.screen ?? null,
          confidence: i.evidence?.confidence ?? 0, kind: i.kind, priority: i.priority,
        })),
        count: items.length,
      };
    }
    case 'get_screen_capture':
      return lastScreenshot ?? { error: 'No screenshot available yet', available: false };

    case 'get_knowledge_state': {
      const graph = readJsonFile('.tesseract/graph/index.json');
      if (!graph) return { nodes: [], totalNodes: 0 };
      const nodes = graph.nodes ?? [];
      const filtered = args.screen ? nodes.filter(n => String(n.id ?? '').includes(args.screen)) : nodes;
      return { nodes: filtered.slice(0, 100), totalNodes: filtered.length, totalEdges: (graph.edges ?? []).length };
    }
    case 'get_queue_items': {
      const wb = readJsonFile('.tesseract/workbench/index.json');
      if (!wb || !wb.items) return { items: [], count: 0 };
      return { items: wb.items, count: wb.items.length, summary: wb.summary ?? null };
    }
    case 'get_fitness_metrics': {
      const sc = readJsonFile('.tesseract/benchmarks/scorecard.json');
      return sc?.highWaterMark ?? { error: 'No scorecard available yet' };
    }
    case 'approve_work_item': {
      const resolver = pendingDecisions.get(args.workItemId);
      if (!resolver) return { error: `No pending decision for ${args.workItemId}`, isError: true };
      const decision = { workItemId: args.workItemId, status: 'completed', rationale: args.rationale ?? 'Approved via MCP' };
      pendingDecisions.delete(args.workItemId);
      resolver(decision);
      broadcast({ type: 'item-completed', timestamp: new Date().toISOString(), data: decision });
      return { ok: true, workItemId: args.workItemId, status: 'completed' };
    }
    case 'skip_work_item': {
      const resolver = pendingDecisions.get(args.workItemId);
      if (!resolver) return { error: `No pending decision for ${args.workItemId}`, isError: true };
      const decision = { workItemId: args.workItemId, status: 'skipped', rationale: args.rationale ?? 'Skipped via MCP' };
      pendingDecisions.delete(args.workItemId);
      resolver(decision);
      broadcast({ type: 'item-completed', timestamp: new Date().toISOString(), data: decision });
      return { ok: true, workItemId: args.workItemId, status: 'skipped' };
    }
    case 'get_iteration_status': {
      const text = readTextFile('.tesseract/runs/speedrun-progress.jsonl');
      if (!text) return { phase: 'idle', error: 'No progress data' };
      const lines = text.trim().split('\n');
      try { return JSON.parse(lines[lines.length - 1]); }
      catch { return { phase: 'unknown' }; }
    }
    // ─── Browser tools (Playwright, headed mode only) ───
    case 'browser_screenshot':
    case 'browser_query':
    case 'browser_aria_snapshot':
    case 'browser_click':
    case 'browser_fill':
    case 'browser_navigate':
      return handleBrowserTool(tool, args);
    default:
      return { error: `Unknown tool: ${tool}`, isError: true };
  }
}

/** Route browser_* MCP tools through the Playwright bridge.
 *  Progressive enhancement: returns error when bridge unavailable.
 *  The bridge is an AsyncPlaywrightBridge (plain async, no Effect). */
async function handleBrowserTool(tool, args) {
  if (!playwrightBridge) {
    return { error: 'Playwright bridge not available (start with --headed)', isError: true, available: false };
  }
  const actionMap = {
    'browser_screenshot': { kind: 'screenshot' },
    'browser_query': { kind: 'query', selector: args.selector },
    'browser_aria_snapshot': { kind: 'aria-snapshot' },
    'browser_click': { kind: 'click', selector: args.selector },
    'browser_fill': { kind: 'fill', selector: args.selector, value: args.value },
    'browser_navigate': { kind: 'navigate', url: args.url },
  };
  const action = actionMap[tool];
  if (!action) return { error: `Unknown browser tool: ${tool}`, isError: true };
  return playwrightBridge.execute(action);
}

/** Set the Playwright bridge for browser_* tools. Called when headed mode is activated. */
function setPlaywrightBridge(bridge) {
  playwrightBridge = bridge;
  console.log('  Playwright bridge: connected (browser_* MCP tools available)');
}

// ─── WebSocket (minimal implementation, no deps) ───

const wsClients = new Set();

function acceptWebSocket(req, socket, head) {
  const key = req.headers['sec-websocket-key'];
  const accept = crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-5AB5DC11B65B')
    .digest('base64');

  socket.write([
    'HTTP/1.1 101 Switching Protocols',
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Accept: ${accept}`,
    '', '',
  ].join('\r\n'));

  const ws = { socket, alive: true };
  wsClients.add(ws);

  socket.on('data', (buf) => {
    const msg = decodeWsFrame(buf);
    if (msg) handleWsMessage(ws, msg);
  });

  socket.on('close', () => wsClients.delete(ws));
  socket.on('error', () => wsClients.delete(ws));
}

function decodeWsFrame(buf) {
  if (buf.length < 2) return null;
  const opcode = buf[0] & 0x0f;
  if (opcode === 0x8) return null; // close
  if (opcode === 0x9) return null; // ping
  const masked = (buf[1] & 0x80) !== 0;
  let len = buf[1] & 0x7f;
  let offset = 2;
  if (len === 126) { len = buf.readUInt16BE(2); offset = 4; }
  else if (len === 127) { len = Number(buf.readBigUInt64BE(2)); offset = 10; }
  const mask = masked ? buf.slice(offset, offset + 4) : null;
  if (masked) offset += 4;
  const data = buf.slice(offset, offset + len);
  if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
  try { return JSON.parse(data.toString('utf8')); }
  catch { return null; }
}

function encodeWsFrame(data) {
  const json = JSON.stringify(data);
  const buf = Buffer.from(json, 'utf8');
  const header = buf.length < 126
    ? Buffer.from([0x81, buf.length])
    : buf.length < 65536
      ? Buffer.from([0x81, 126, (buf.length >> 8) & 0xff, buf.length & 0xff])
      : (() => { const h = Buffer.alloc(10); h[0] = 0x81; h[1] = 127; h.writeBigUInt64BE(BigInt(buf.length), 2); return h; })();
  return Buffer.concat([header, buf]);
}

function broadcast(msg) {
  const frame = encodeWsFrame(msg);
  for (const ws of wsClients) {
    try { ws.socket.write(frame); } catch { wsClients.delete(ws); }
  }
}

async function handleWsMessage(ws, msg) {
  try {
    if (msg.type === 'ping') {
      ws.socket.write(encodeWsFrame({ type: 'pong' }));
      return;
    }

    if (msg.type === 'complete-work-item') {
      const { completeWorkItem } = require(path.join(ROOT, 'dist', 'lib', 'application', 'agent-workbench.js'));
      const result = await runEffect((p) => completeWorkItem({
        paths: p,
        completion: {
          workItemId: msg.workItemId,
          status: msg.status,
          completedAt: new Date().toISOString(),
          rationale: msg.rationale || `Dashboard: ${msg.status}`,
          artifactsWritten: msg.artifactsWritten || [],
        },
      }));
      broadcast({ type: 'work-item-completed', data: { workItemId: msg.workItemId, status: msg.status } });
      // Refresh workbench for all clients
      const wb = readJsonFile('.tesseract/workbench/index.json');
      if (wb) broadcast({ type: 'workbench-updated', data: wb });
      return;
    }

    if (msg.type === 'reload-workbench') {
      const wb = readJsonFile('.tesseract/workbench/index.json');
      if (wb) ws.socket.write(encodeWsFrame({ type: 'workbench-updated', data: wb }));
      return;
    }
  } catch (err) {
    ws.socket.write(encodeWsFrame({ type: 'error', message: String(err) }));
  }
}

// ─── File watcher for real-time artifact updates ───

let watchDebounce = null;
function watchArtifacts() {
  const watchPaths = [
    path.join(ROOT, '.tesseract', 'workbench'),
    path.join(ROOT, '.tesseract', 'benchmarks'),
    path.join(ROOT, '.tesseract', 'runs'),
  ];
  for (const dir of watchPaths) {
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
    } catch { /* directory may not exist yet */ }
  }
}

// ─── Progress JSONL watcher ───

let progressWatcher = null;
let lastProgressSize = 0;

function watchProgress() {
  const progressPath = path.join(ROOT, '.tesseract', 'runs', 'speedrun-progress.jsonl');
  try {
    progressWatcher = fs.watchFile(progressPath, { interval: 1000 }, () => {
      try {
        const stat = fs.statSync(progressPath);
        if (stat.size > lastProgressSize) {
          const content = fs.readFileSync(progressPath, 'utf8');
          const lines = content.trim().split('\n');
          const lastLine = lines[lines.length - 1];
          if (lastLine) {
            const event = JSON.parse(lastLine);
            broadcast({ type: 'speedrun-progress', data: event });
          }
          lastProgressSize = stat.size;
        }
      } catch { /* file may be mid-write */ }
    });
  } catch { /* file may not exist yet */ }
}

// ─── HTTP Server ───

function handleRequest(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // REST API
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

  // ─── MCP Tool Endpoints ───

  if (url.pathname === '/api/mcp/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: MCP_TOOLS }));
    return;
  }

  if (url.pathname === '/api/mcp/call' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { tool, arguments: args } = JSON.parse(body);
        const result = await handleMcpToolCall(tool, args ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tool, result, isError: !!result?.isError }));
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
      screenshotStream: true,
      liveDomPortal: !!playwrightBridge,
      mcpServer: true,
      mcpEndpoint: `http://localhost:${PORT}/api/mcp`,
      playwrightMcp: !!playwrightBridge,
      version: '1.0',
    }));
    return;
  }

  if (url.pathname === '/api/lineage') {
    const data = readJsonFile('.tesseract/workbench/lineage.json');
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? { entries: [] }));
    return;
  }

  if (url.pathname === '/api/workbench/complete' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { completion } = JSON.parse(body);
        const { completeWorkItem } = require(path.join(ROOT, 'dist', 'lib', 'application', 'agent-workbench.js'));
        await runEffect((p) => completeWorkItem({ paths: p, completion }));
        broadcast({ type: 'work-item-completed', data: { workItemId: completion.workItemId, status: completion.status } });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  // Static file serving
  let filePath;
  if (url.pathname === '/' || url.pathname === '/index.html') filePath = path.join(DASHBOARD_DIR, 'index.html');
  else if (url.pathname === '/dashboard.js') filePath = path.join(DASHBOARD_DIR, 'dashboard.js');
  else if (url.pathname.startsWith('/.tesseract/') || url.pathname.startsWith('/dogfood/')) filePath = path.join(ROOT, url.pathname);
  else filePath = path.join(DASHBOARD_DIR, url.pathname);

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(handleRequest);
server.on('upgrade', (req, socket, head) => {
  if (req.url === '/ws') acceptWebSocket(req, socket, head);
  else socket.destroy();
});

server.listen(PORT, () => {
  console.log(`\n  Tesseract Dashboard: http://localhost:${PORT}`);
  console.log(`  WebSocket:           ws://localhost:${PORT}/ws`);
  console.log(`  REST API:            http://localhost:${PORT}/api/workbench`);
  console.log(`  MCP Tools:           http://localhost:${PORT}/api/mcp/tools`);
  console.log(`  MCP Invoke:          POST http://localhost:${PORT}/api/mcp/call`);
  console.log(`  Capabilities:        http://localhost:${PORT}/api/capabilities`);
  console.log(`  Artifacts:           ${ROOT}/.tesseract/`);
  if (SPEEDRUN) console.log(`  Speedrun:            active (live pipeline visualization)`);
  console.log('');
  initEffect();
  watchArtifacts();
  watchProgress();

  // ─── Live speedrun mode ───
  // Runs the real dogfood loop in-process with DashboardPort wired to WS broadcast.
  // The dashboard is purely observational — decisions auto-skip instantly.
  if (SPEEDRUN) {
    startLiveSpeedrun().catch((err) => {
      console.error('Speedrun failed:', err?.message ?? err);
      process.exitCode = 1;
    });
  }
});

async function startLiveSpeedrun() {
  if (!initEffect()) {
    console.error('Cannot start speedrun: Effect runtime not loaded. Run npm run build first.');
    return;
  }

  const count = parseInt(argAfter('--count') ?? '50', 10);
  const seed = argAfter('--seed') ?? 'speedrun-v1';
  const maxIterations = parseInt(argAfter('--max-iterations') ?? '5', 10);
  const posture = argAfter('--posture') ?? 'warm-start';

  console.log(`  Speedrun config: count=${count} seed=${seed} maxIterations=${maxIterations} posture=${posture}`);

  // ─── Pipeline Event Bus (Effect PubSub + SharedArrayBuffer) ───
  // The event bus is the canonical event source. The PubSub distributes to:
  //   1. SharedArrayBuffer ring (zero-copy in-process visualization)
  //   2. WS broadcast (remote browser access)
  const { Effect: Eff } = require('effect');
  let dashboardPort;
  let eventBusFiber;

  try {
    const { createPipelineEventBus, subscribeWsBroadcaster } = require(
      path.join(ROOT, 'dist', 'lib', 'infrastructure', 'dashboard', 'pipeline-event-bus.js')
    );

    // Create and start the event bus within an Effect runtime
    const busProgram = Eff.gen(function* () {
      const bus = yield* createPipelineEventBus({ bufferCapacity: 2048, decisionTimeoutMs: 0 });

      // Start buffer writer subscriber
      const bufferFiber = yield* bus.start();

      // Subscribe WS broadcast as second consumer
      const wsFiber = yield* subscribeWsBroadcaster(bus.pubsub, (data) => broadcast(data));

      console.log(`  Event bus: SharedArrayBuffer ring (${2048} slots, ${2048 * 18 * 8} bytes)`);
      console.log(`  Subscribers: buffer-writer + ws-broadcast`);
      console.log('');

      return bus.dashboardPort;
    });

    dashboardPort = await Eff.runPromise(busProgram);
  } catch (err) {
    // Fallback to WS-only adapter if event bus fails
    console.log('  Event bus: unavailable, falling back to WS adapter');
    console.log(`  Reason: ${err?.message ?? err}`);
    console.log('');

    const { createWsDashboardAdapter } = require(
      path.join(ROOT, 'dist', 'lib', 'infrastructure', 'dashboard', 'ws-dashboard-adapter.js')
    );
    const wsBroadcaster = {
      broadcast: (data) => broadcast(data),
      onMessage: (_handler) => {},
    };
    dashboardPort = createWsDashboardAdapter(wsBroadcaster, { decisionTimeoutMs: 0 });
  }

  // Run the speedrun Effect program with the event bus dashboard port.
  const { speedrunProgram } = require(path.join(ROOT, 'dist', 'lib', 'application', 'speedrun.js'));
  const { DEFAULT_PIPELINE_CONFIG } = require(path.join(ROOT, 'dist', 'lib', 'domain', 'types', 'pipeline-config.js'));

  const program = speedrunProgram({
    paths,
    config: DEFAULT_PIPELINE_CONFIG,
    count,
    seed,
    maxIterations,
    knowledgePosture: posture,
    onProgress: (event) => {
      broadcast({ type: 'progress', timestamp: new Date().toISOString(), data: event });
    },
  });

  await runWithLocalServices(program, ROOT, {
    suiteRoot: paths.suiteRoot,
    dashboard: dashboardPort,
  });

  console.log('\n  Speedrun complete. Dashboard remains active for inspection.\n');
}

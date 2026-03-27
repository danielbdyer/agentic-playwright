/**
 * Tesseract Dashboard Server — WebSocket + REST + Effect integration.
 *
 * Architecture:
 *   HTTP :3100 — static files + REST API + WebSocket upgrade
 *   REST  /api/workbench, /api/fitness, /api/workbench/complete
 *   WS    /ws — bidirectional streaming (progress, updates, decisions)
 *
 * Effect programs are called via runWithLocalServices for mutations.
 * WebSocket broadcasts updates to all connected clients in real-time.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--port') ?? '3100', 10);
const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = __dirname;

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
  console.log(`  Artifacts:           ${ROOT}/.tesseract/`);
  console.log('');
  initEffect();
  watchArtifacts();
  watchProgress();
});

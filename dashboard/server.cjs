/**
 * Tesseract Dashboard Dev Server
 *
 * Serves the dashboard HTML + bundled JS from dashboard/,
 * and proxies .tesseract/ artifact reads from the repo root.
 *
 * Usage: node dashboard/server.cjs [--port 3100]
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = parseInt(process.argv.find((_, i, arr) => arr[i - 1] === '--port') ?? '3100', 10);
const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.yaml': 'text/yaml',
};

function serve(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  let filePath;

  if (url.pathname === '/' || url.pathname === '/index.html') {
    filePath = path.join(DASHBOARD_DIR, 'index.html');
  } else if (url.pathname === '/dashboard.js') {
    filePath = path.join(DASHBOARD_DIR, 'dashboard.js');
  } else if (url.pathname.startsWith('/.tesseract/') || url.pathname.startsWith('/dogfood/')) {
    // Proxy artifact reads from repo root
    filePath = path.join(ROOT, url.pathname);
  } else {
    filePath = path.join(DASHBOARD_DIR, url.pathname);
  }

  // Security: prevent directory traversal
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer(serve);
server.listen(PORT, () => {
  console.log(`Tesseract Dashboard: http://localhost:${PORT}`);
  console.log(`Serving artifacts from: ${ROOT}`);
  console.log('Auto-refreshes every 5 seconds.');
});

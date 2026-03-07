const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname);

function readPort() {
  const argIndex = process.argv.indexOf('--port');
  if (argIndex >= 0 && process.argv[argIndex + 1]) {
    return Number(process.argv[argIndex + 1]);
  }
  return Number(process.env.PORT || 3100);
}

const port = readPort();

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function resolveFilePath(urlPath) {
  const normalized = urlPath === '/' ? '/policy-search.html' : urlPath;
  const cleanPath = normalized.split('?')[0];
  return path.join(root, cleanPath);
}

const server = http.createServer((req, res) => {
  const filePath = resolveFilePath(req.url || '/');

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': contentTypes[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(content);
  });
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`demo-harness listening on http://127.0.0.1:${port}\n`);
});

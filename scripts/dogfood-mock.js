#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

function writeFile(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents, 'utf8');
}

function createMockApp(rootDir) {
  const webRoot = path.join(rootDir, 'mock-app');
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Tesseract Mock Policy Search</title>
</head>
<body>
  <main>
    <h1>Policy Search</h1>
    <form aria-label="Policy Search">
      <label for="policyNumber">Policy Number</label>
      <input id="policyNumber" name="policyNumber" />
      <button type="button">Search</button>
    </form>
    <section aria-label="Search Results">
      <table>
        <thead>
          <tr><th>Policy</th><th>Status</th></tr>
        </thead>
        <tbody>
          <tr><td>POL-001</td><td>Active</td></tr>
        </tbody>
      </table>
    </section>
  </main>
</body>
</html>`;

  writeFile(path.join(webRoot, 'policy-search', 'index.html'), html);
  return webRoot;
}

function copyDemoFixture(repoRoot, tempRoot) {
  const source = path.join(repoRoot, 'fixtures', 'ado', '10001.json');
  const target = path.join(tempRoot, 'fixtures', 'ado', '10001.json');
  writeFile(target, fs.readFileSync(source, 'utf8'));
}

function serveDirectory(rootDir) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const requestPath = req.url === '/' ? '/policy-search/' : req.url;
      const normalized = path.normalize(decodeURIComponent(requestPath || '/')).replace(/^([.][.][/\\])+/, '');
      let filePath = path.join(rootDir, normalized);

      if (normalized.endsWith('/')) {
        filePath = path.join(filePath, 'index.html');
      }

      if (!filePath.startsWith(rootDir) || !fs.existsSync(filePath)) {
        res.statusCode = 404;
        res.end('not found');
        return;
      }

      const body = fs.readFileSync(filePath);
      res.statusCode = 200;
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.end(body);
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('Unable to determine mock server address');
      }
      resolve({ server, port: address.port });
    });
  });
}

async function main() {
  const repoRoot = process.cwd();
  const distCli = path.join(repoRoot, 'dist', 'bin', 'tesseract.js');

  if (!fs.existsSync(distCli)) {
    throw new Error('dist/bin/tesseract.js was not found. Run `npm run build` first.');
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tesseract-dogfood-'));
  copyDemoFixture(repoRoot, tempRoot);
  const webRoot = createMockApp(tempRoot);

  const { server, port } = await serveDirectory(webRoot);
  const baseUrl = `http://127.0.0.1:${port}/policy-search`;

  try {
    const run = spawnSync(
      process.execPath,
      [
        distCli,
        'bootstrap',
        '--base-url',
        baseUrl,
        '--suite',
        '10001',
        '--auth-strategy',
        'none',
        '--crawl-depth',
        '2',
        '--crawl-allow-hosts',
        '127.0.0.1',
        '--crawl-timeout-ms',
        '20000',
        '--crawl-page-budget',
        '25',
      ],
      { cwd: tempRoot, stdio: 'inherit' },
    );

    if (run.status !== 0) {
      process.exitCode = run.status || 1;
      return;
    }

    process.stdout.write(`\n[dogfood] bootstrap artifacts emitted under ${tempRoot}\n`);
  } finally {
    server.close();
  }
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});

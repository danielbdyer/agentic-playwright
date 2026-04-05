import fs from 'fs';
import http from 'http';
import path from 'path';
import type { FileAccess } from './infrastructure/file-access';
import type { McpToolsRegistry } from './mcp-tools';
import type { RuntimeState } from './runtime-state';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.css': 'text/css',
  '.yaml': 'text/yaml',
};

export interface HttpRouterOptions {
  readonly port: number;
  readonly rootDir: string;
  readonly dashboardDir: string;
  readonly files: FileAccess;
  readonly mcpTools: McpToolsRegistry;
  readonly runtimeState: RuntimeState;
}

const decodeRunId = (pathname: string): string => decodeURIComponent(pathname.split('/')[3] ?? '');

const validateRunIdPath = (rootDir: string, runId: string): boolean => {
  const runsRoot = path.join(rootDir, '.tesseract', 'runs');
  const rel = path.relative(runsRoot, path.join(runsRoot, runId));
  return !rel.startsWith('..') && !path.isAbsolute(rel);
};

export const createHttpRouter = (options: HttpRouterOptions): http.RequestListener => (req, res): void => {
  const url = new URL(req.url ?? '/', `http://localhost:${options.port}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (url.pathname === '/api/workbench') {
    const data = options.files.readJsonFile('.tesseract/workbench/index.json');
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? { error: 'not found' }));
    return;
  }

  if (url.pathname === '/api/fitness') {
    const data = options.files.readJsonFile('.tesseract/benchmarks/scorecard.json');
    res.writeHead(data ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data ?? { error: 'not found' }));
    return;
  }

  if (url.pathname === '/api/mcp/tools') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tools: options.mcpTools.tools }));
    return;
  }

  if (url.pathname === '/api/mcp/call' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body) as { tool?: string; arguments?: Record<string, unknown> };
        const tool = parsed.tool ?? '';
        const result = options.mcpTools.callTool(tool, parsed.arguments ?? {});
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ tool, result, isError: Boolean((result as { isError?: unknown }).isError) }));
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(err) }));
      }
    });
    return;
  }

  if (url.pathname === '/api/capabilities') {
    const runtime = options.runtimeState.getSnapshot();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      screenshotStream: runtime.screencastActive,
      liveDomPortal: runtime.fixtureUrl !== null,
      mcpServer: true,
      mcpEndpoint: `http://localhost:${options.port}/api/mcp`,
      playwrightMcp: false,
      appUrl: runtime.fixtureUrl,
      version: '2.1',
    }));
    return;
  }

  if (url.pathname === '/api/runs') {
    const runsDir = path.join(options.rootDir, '.tesseract', 'runs');
    try {
      const entries = fs.readdirSync(runsDir, { withFileTypes: true });
      const runs = entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => {
          const journalPath = path.join(runsDir, entry.name, 'dashboard-events.jsonl');
          try {
            fs.statSync(journalPath);
          } catch {
            return null;
          }
          const index = options.files.readJsonFile(path.join('.tesseract', 'runs', entry.name, 'dashboard-events.index.json')) as {
            totalEvents?: number;
            totalDurationMs?: number;
          } | null;
          return {
            runId: entry.name,
            journalPath: `/api/runs/${encodeURIComponent(entry.name)}/journal`,
            indexPath: `/api/runs/${encodeURIComponent(entry.name)}/journal/index`,
            eventCount: index?.totalEvents ?? 0,
            durationMs: index?.totalDurationMs ?? 0,
          };
        })
        .filter((run): run is NonNullable<typeof run> => run !== null);

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ runs }));
    } catch {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ runs: [] }));
    }
    return;
  }

  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/journal/index')) {
    const runId = decodeRunId(url.pathname);
    if (!runId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing runId' }));
      return;
    }
    if (!validateRunIdPath(options.rootDir, runId)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = options.files.readTextFile(path.join('.tesseract', 'runs', runId, 'dashboard-events.index.json'));
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'index not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(data);
    return;
  }

  if (url.pathname.startsWith('/api/runs/') && url.pathname.endsWith('/journal')) {
    const runId = decodeRunId(url.pathname);
    if (!runId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'missing runId' }));
      return;
    }
    if (!validateRunIdPath(options.rootDir, runId)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const data = options.files.readTextFile(path.join('.tesseract', 'runs', runId, 'dashboard-events.jsonl'));
    if (!data) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'journal not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
    res.end(data);
    return;
  }

  const filePath = url.pathname === '/' || url.pathname === '/index.html'
    ? path.join(options.dashboardDir, 'index.html')
    : url.pathname === '/dashboard.js'
      ? path.join(options.dashboardDir, 'dashboard.js')
      : url.pathname === '/styles.css'
        ? path.join(options.dashboardDir, 'styles.css')
        : path.join(options.dashboardDir, url.pathname);

  if (!filePath.startsWith(options.rootDir)) {
    res.writeHead(403);
    res.end();
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(data);
  });
};

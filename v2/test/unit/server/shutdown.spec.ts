/**
 * `serve --http` as a process: after a session has launched Chromium,
 * SIGTERM (docker stop, systemctl stop) must close the session, its browser,
 * and the listener, and the process must exit. Playwright's own SIGTERM
 * handler only closes browsers, so without the server's handler the process
 * outlives the signal.
 */
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';

const V2_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const VITE_NODE = [path.join(V2_ROOT, 'node_modules', '.bin', 'vite-node'), path.join(V2_ROOT, '..', 'node_modules', '.bin', 'vite-node')]
  .find((candidate) => existsSync(candidate));

/** Every live (non-zombie) descendant of pid. */
const descendants = (pid: number): readonly number[] => {
  const rows = spawnSync('ps', ['-eo', 'pid=,ppid='], { encoding: 'utf8' }).stdout
    .split('\n')
    .map((line) => line.trim().split(/\s+/).map(Number))
    .filter((row): row is [number, number] => row.length === 2 && Number.isFinite(row[0]) && Number.isFinite(row[1]));
  const walk = (parent: number): readonly number[] =>
    rows.filter(([, ppid]) => ppid === parent).flatMap(([child]) => [child, ...walk(child)]);
  return walk(pid);
};

const alive = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
  } catch {
    return false;
  }
  try {
    // A zombie still answers kill(0); its state field is Z.
    return !/^\d+ \(.*\) Z/.test(readFileSync(`/proc/${pid}/stat`, 'utf8'));
  } catch {
    return false;
  }
};

const exitOf = (child: ChildProcess, timeoutMs: number): Promise<{ code: number | null; signal: string | null } | 'still running'> =>
  new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timer = setTimeout(() => resolve('still running'), timeoutMs);
    child.once('exit', (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });

describe.skipIf(VITE_NODE === undefined)('serve --http shutdown', () => {
  let app: FixtureApp;
  let root: string;
  let server: ChildProcess | undefined;
  let stderr = '';

  beforeAll(async () => {
    app = await startFixtureApp();
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-shutdown-'));
    await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
    await writeFile(path.join(root, '.tesseract', 'profiles', 'qa.json'), JSON.stringify({ name: 'qa', baseURL: app.baseURL }));
  });

  afterAll(async () => {
    if (server !== undefined && server.exitCode === null && server.signalCode === null) server.kill('SIGKILL');
    await app?.close();
    await rm(root, { recursive: true, force: true });
  });

  /** Start the server, open a page (launching Chromium) through MCP, send the signal; return how it ended. */
  const serveOpenAndSignal = async (signal: NodeJS.Signals) => {
    stderr = '';
    server = spawn(VITE_NODE!, [path.join(V2_ROOT, 'bin', 'tesseract-qa.ts'), 'serve', '--http', '0', '--root', root], {
      cwd: V2_ROOT,
      env: { ...process.env, TESSERACT_ROOT: root },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const child = server;
    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`server did not start: ${stderr}`)), 45_000);
      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
        const match = /at (http:\/\/127\.0\.0\.1:\d+\/mcp)/.exec(stderr);
        if (match !== null) {
          clearTimeout(timer);
          resolve(match[1]!);
        }
      });
      child.once('exit', (code) => reject(new Error(`server exited (${code}): ${stderr}`)));
    });

    const client = new Client({ name: 'shutdown-test', version: '1.0.0' });
    await client.connect(new StreamableHTTPClientTransport(new URL(url)));
    const opened = await client.callTool({ name: 'app_open', arguments: { url: 'Login', profile: 'qa' } });
    expect(opened.isError, JSON.stringify(opened.content)).toBeFalsy();
    const browsers = descendants(child.pid!);
    expect(browsers.length).toBeGreaterThan(0);

    child.kill(signal);
    const exited = await exitOf(child, 20_000);
    // Give the kernel a moment to reap the browser's helpers after their parent went away.
    const deadline = Date.now() + 5000;
    while (browsers.some(alive) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 100));
    await client.close().catch(() => undefined);
    return { exited, survivors: browsers.filter(alive) };
  };

  it('exits 0 on SIGTERM after a session launched Chromium, closing the browser', async () => {
    const { exited, survivors } = await serveOpenAndSignal('SIGTERM');
    expect(exited, stderr).toEqual({ code: 0, signal: null });
    expect(stderr).toMatch(/SIGTERM: closing sessions/);
    expect(survivors).toEqual([]);
  }, 90_000);

  it('exits on SIGINT (Ctrl+C) with the browser closed', async () => {
    const { exited, survivors } = await serveOpenAndSignal('SIGINT');
    // Playwright's own SIGINT handler may win the race and exit 130 once browsers are closed.
    expect(exited, stderr).not.toBe('still running');
    expect([0, 130]).toContain((exited as { code: number | null }).code);
    expect(stderr).toMatch(/SIGINT: closing sessions/);
    expect(survivors).toEqual([]);
  }, 90_000);
});

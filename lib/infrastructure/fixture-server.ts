/**
 * Fixture Server — manages the demo-harness HTTP server lifecycle.
 *
 * Spawns `dogfood/fixtures/demo-harness/server.cjs` as a child process,
 * waits for it to be ready, and provides a clean shutdown.
 *
 * Used by the speedrun escalation path to give the headless browser
 * a real SUT (system under test) to inspect.
 */

import { type ChildProcess, spawn } from 'child_process';
import * as http from 'http';
import * as path from 'path';

export interface FixtureServer {
  /** Base URL of the running fixture server (e.g., http://127.0.0.1:3200). */
  readonly baseUrl: string;
  /** Port the server is listening on. */
  readonly port: number;
  /** Gracefully shut down the server process. */
  readonly stop: () => Promise<void>;
}

export interface FixtureServerOptions {
  /** Repository root directory. Default: process.cwd(). */
  readonly rootDir?: string;
  /** Port to listen on. Default: 3200 (avoids collision with test ports 3100-3102). */
  readonly port?: number;
  /** Readiness timeout in ms. Default: 10000. */
  readonly readinessTimeoutMs?: number;
}

/**
 * Probe a URL with a HEAD request. Resolves true if 2xx, false otherwise.
 */
function probe(url: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      res.resume();
      resolve((res.statusCode ?? 500) < 400);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

/**
 * Start the demo-harness fixture server and wait until it's ready.
 *
 * The server process is killed on `stop()` or when the parent process exits.
 */
export async function startFixtureServer(
  options: FixtureServerOptions = {},
): Promise<FixtureServer> {
  const rootDir = options.rootDir ?? process.cwd();
  const port = options.port ?? 3200;
  const readinessTimeoutMs = options.readinessTimeoutMs ?? 10_000;
  const baseUrl = `http://127.0.0.1:${port}`;

  const serverScript = path.join(rootDir, 'dogfood', 'fixtures', 'demo-harness', 'server.cjs');

  const child: ChildProcess = spawn(
    process.execPath,
    [serverScript, '--port', String(port)],
    { stdio: 'pipe', detached: false },
  );

  // Forward stderr for diagnostics but don't block
  child.stderr?.on('data', (chunk: Buffer) => {
    process.stderr.write(`[fixture-server] ${chunk.toString()}`);
  });

  // Wait for readiness via HTTP probe
  const healthUrl = `${baseUrl}/policy-search.html`;
  const deadline = Date.now() + readinessTimeoutMs;
  let ready = false;

  while (Date.now() < deadline) {
    ready = await probe(healthUrl, 2000);
    if (ready) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  if (!ready) {
    child.kill();
    throw new Error(`Fixture server failed to become ready at ${healthUrl} within ${readinessTimeoutMs}ms`);
  }

  const stop = async (): Promise<void> => {
    if (!child.killed) {
      child.kill('SIGTERM');
      // Give the process a moment to exit cleanly
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 3000);
        child.on('exit', () => { clearTimeout(timer); resolve(); });
      });
    }
  };

  // Ensure cleanup if parent exits unexpectedly
  const exitHandler = () => { child.kill(); };
  process.on('exit', exitHandler);
  const originalStop = stop;
  const wrappedStop = async () => {
    process.removeListener('exit', exitHandler);
    await originalStop();
  };

  return { baseUrl, port, stop: wrappedStop };
}

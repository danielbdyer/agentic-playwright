/**
 * Synthetic substrate server — in-process Node http serving the
 * built substrate bundle + index shell.
 *
 * Unlike `product/instruments/tooling/fixture-server.ts` (which
 * spawns the demo-harness as a child process), this server runs
 * in the same process as the harness that owns it. The PlaywrightLive
 * adapter (Slice 6.3) starts a server on a random port, navigates
 * Chromium to it, runs probes, then tears the server down.
 *
 * ## Why in-process
 *
 * - One less process for CI to manage; no stdio plumbing or
 *   readiness polling races.
 * - Deterministic lifecycle — caller `await start()` ↔ `await stop()`.
 * - Trivially parallelizable: multiple harnesses can spin up
 *   independent servers on independent random ports.
 *
 * ## What it serves
 *
 * Exactly two files:
 *   - `/` or `/index.html` → workshop/synthetic-app/index.html
 *   - `/synthetic-app.js`  → the esbuild output bundle
 *
 * Every other path returns 404. The synthetic app is not a
 * website; it has no assets besides the bundle. Paths carrying
 * `?world=...` fall into the `/` branch (query string ignored
 * for routing; parsed client-side by bootstrap.tsx).
 */

import { createServer, type Server } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SubstrateServer {
  /** Base URL with the listening port filled in (e.g., `http://127.0.0.1:54321`). */
  readonly baseUrl: string;
  /** The listening port. Useful for logging. */
  readonly port: number;
  /** Resolve when the server is fully closed. */
  readonly stop: () => Promise<void>;
}

export interface StartSubstrateServerOptions {
  /** Repository root. Default: process.cwd(). */
  readonly rootDir?: string;
  /** Port to listen on. Default: 0 (OS picks a free port — recommended). */
  readonly port?: number;
  /** Host to bind to. Default: 127.0.0.1. */
  readonly host?: string;
}

const DEFAULT_HOST = '127.0.0.1';

/** Start the in-process substrate server. Resolves once the server
 *  is listening; returns a handle the caller uses to learn the URL
 *  and to stop the server. */
export async function startSubstrateServer(
  options: StartSubstrateServerOptions = {},
): Promise<SubstrateServer> {
  const rootDir = options.rootDir ?? process.cwd();
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? 0;
  const appDir = path.resolve(rootDir, 'workshop', 'synthetic-app');

  const indexPath = path.join(appDir, 'index.html');
  const bundlePath = path.join(appDir, 'synthetic-app.js');

  const server = createServer(async (req, res) => {
    try {
      const url = req.url ?? '/';
      const pathOnly = url.split('?')[0] ?? '/';
      if (pathOnly === '/' || pathOnly === '/index.html') {
        const content = await readFile(indexPath);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(content);
        return;
      }
      if (pathOnly === '/synthetic-app.js') {
        const content = await readFile(bundlePath);
        res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
        res.end(content);
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not found. The synthetic substrate serves only / and /synthetic-app.js.');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`Substrate server error: ${err instanceof Error ? err.message : String(err)}`);
    }
  });

  const boundPort = await listen(server, host, port);
  const baseUrl = `http://${host}:${boundPort}`;

  return {
    baseUrl,
    port: boundPort,
    stop: () => closeServer(server),
  };
}

function listen(server: Server, host: string, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('Substrate server failed to bind: address unavailable.'));
        return;
      }
      resolve(address.port);
    });
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

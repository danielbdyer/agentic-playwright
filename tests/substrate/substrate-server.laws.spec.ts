/**
 * Substrate server — structural laws.
 *
 * Pins:
 *   S1. start resolves with a listening server and a baseUrl that
 *       fetches the index shell.
 *   S2. GET /synthetic-app.js returns the JS bundle.
 *   S3. GET / with a ?world= query param is served (query parsed
 *       client-side; server treats it as `/`).
 *   S4. Unknown paths return 404.
 *   S5. start({ port: 0 }) picks a free port; concurrent starts get
 *       distinct ports.
 *   S6. stop() closes cleanly; after stop, the port is free.
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { startSubstrateServer, type SubstrateServer } from '../../workshop/synthetic-app/server';

const REPO_ROOT = path.resolve(__dirname, '../..');

async function fetchText(url: string): Promise<{ status: number; body: string }> {
  const res = await fetch(url);
  return { status: res.status, body: await res.text() };
}

describe('Substrate server laws', () => {
  let server: SubstrateServer;

  beforeAll(async () => {
    server = await startSubstrateServer({ rootDir: REPO_ROOT });
  });

  afterAll(async () => {
    await server.stop();
  });

  test('S1: baseUrl fetches the index shell', async () => {
    const { status, body } = await fetchText(server.baseUrl + '/');
    expect(status).toBe(200);
    expect(body).toContain('<div id="root"></div>');
    expect(body).toContain('./synthetic-app.js');
  });

  test('S2: /synthetic-app.js returns the JS bundle', async () => {
    const { status, body } = await fetchText(`${server.baseUrl}/synthetic-app.js`);
    expect(status).toBe(200);
    expect(body.length).toBeGreaterThan(1000);
  });

  test('S3: query param is served (parsed client-side)', async () => {
    const { status } = await fetchText(`${server.baseUrl}/?world=%7B%22facets%22%3A%5B%5D%7D`);
    expect(status).toBe(200);
  });

  test('S4: unknown path returns 404', async () => {
    const { status } = await fetchText(`${server.baseUrl}/nope`);
    expect(status).toBe(404);
  });

  test('S5: concurrent starts get distinct ports', async () => {
    const [a, b] = await Promise.all([
      startSubstrateServer({ rootDir: REPO_ROOT }),
      startSubstrateServer({ rootDir: REPO_ROOT }),
    ]);
    try {
      expect(a.port).not.toBe(b.port);
      expect(a.port).not.toBe(server.port);
      expect(b.port).not.toBe(server.port);
    } finally {
      await Promise.all([a.stop(), b.stop()]);
    }
  });

  test('S6: stop closes cleanly', async () => {
    const transient = await startSubstrateServer({ rootDir: REPO_ROOT });
    await transient.stop();
    // Attempting to fetch after stop should fail.
    await expect(fetchText(transient.baseUrl + '/')).rejects.toThrow();
  });
});

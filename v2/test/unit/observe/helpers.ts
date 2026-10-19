/**
 * Shared fixtures for the observe tests: the OutSystems-Reactive-shaped
 * fixture page, a headless Chromium, and a tiny HTTP server on port 0 for
 * tests that need real navigation and network timing.
 */
import { readFileSync } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from '@playwright/test';

const here = path.dirname(fileURLToPath(import.meta.url));

export const fixtureHtml = (name: string): string => readFileSync(path.join(here, 'fixtures', name), 'utf8');

export const POLICY_SEARCH = (): string => fixtureHtml('policy-search.html');

export const launch = (): Promise<Browser> => chromium.launch({ headless: true });

export const openFixture = async (browser: Browser, html: string = POLICY_SEARCH()): Promise<Page> => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.setContent(html, { waitUntil: 'load' });
  return page;
};

export type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

export interface TestServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export const html = (body: string): Handler => (_req, res) => {
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end(body);
};

/** Serve `routes` (path → handler, query string ignored) on 127.0.0.1 and an ephemeral port. */
export const startServer = async (routes: Readonly<Record<string, Handler>>): Promise<TestServer> => {
  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    const handler = routes[pathname];
    if (handler === undefined) {
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('not found');
      return;
    }
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        // Long-poll handlers never answer; drop their sockets so close() returns.
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

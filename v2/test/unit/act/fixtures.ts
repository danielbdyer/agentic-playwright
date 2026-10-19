/**
 * Test fixtures for the browser and action layers: a tiny HTTP server on
 * port 0 and a free-port finder for CDP. No network beyond 127.0.0.1.
 */
import http from 'node:http';
import net from 'node:net';
import type { AddressInfo } from 'node:net';

export type Route = (request: http.IncomingMessage, response: http.ServerResponse) => void;

export interface FixtureServer {
  readonly url: string;
  readonly close: () => Promise<void>;
}

export const html = (body: string, title = 'Fixture'): string =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body>${body}</body></html>`;

/** Serve fixed routes: a string is served as HTML, a function handles the request itself. */
export const startServer = async (routes: Readonly<Record<string, Route | string>>): Promise<FixtureServer> => {
  const server = http.createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://fixture.local').pathname;
    const route = routes[pathname];
    if (route === undefined) {
      response.statusCode = 404;
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(html('<h1>Not found</h1>', 'Not found'));
      return;
    }
    if (typeof route === 'string') {
      response.setHeader('content-type', 'text/html; charset=utf-8');
      response.end(route);
      return;
    }
    route(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
};

/** A port nothing is listening on (the OS picked it, then we let it go). */
export const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo;
      probe.close(() => resolve(port));
    });
  });

/** A route that never answers: for navigations and clicks that hang. */
export const hang: Route = () => undefined;

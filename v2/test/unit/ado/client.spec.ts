import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import {
  adoClientFromWorkspace,
  adoSettings,
  createAdoClient,
  parseRetryAfter,
  requireAdoClient,
  type AdoClientOptions,
  type FetchLike,
} from '../../../src/ado/client.js';
import { startMockAdo, type MockAdo } from '../../support/mock-ado.js';

interface Call {
  readonly url: string;
  readonly init: RequestInit;
}

/** A scripted fetch: each call takes the next response (or throws the next error). */
const scripted = (steps: readonly (Response | Error | (() => Response))[]): { fetchImpl: FetchLike; calls: Call[] } => {
  const calls: Call[] = [];
  let i = 0;
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init: init ?? {} });
    const step = steps[Math.min(i, steps.length - 1)]!;
    i += 1;
    if (step instanceof Error) throw step;
    return typeof step === 'function' ? step() : step.clone();
  };
  return { fetchImpl, calls };
};

const jsonResponse = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });

const textResponse = (status: number, text: string, contentType: string, headers: Record<string, string> = {}): Response =>
  new Response(text, { status, headers: { 'content-type': contentType, ...headers } });

const make = (fetchImpl: FetchLike, overrides: Partial<AdoClientOptions> = {}) => {
  const waits: number[] = [];
  const logs: string[] = [];
  const client = createAdoClient({
    orgUrl: 'https://dev.azure.com/acme/',
    project: 'Demo Project',
    pat: 'secret-pat',
    fetchImpl,
    sleep: async (ms) => {
      waits.push(ms);
    },
    random: () => 0.5,
    log: (message) => logs.push(message),
    ...overrides,
  });
  return { client, waits, logs };
};

const caught = async (promise: Promise<unknown>): Promise<ToolError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error('expected a ToolError');
};

const headersOf = (call: Call): Record<string, string> => call.init.headers as Record<string, string>;

describe('request shape', () => {
  it('builds project URLs with api-version, authenticates with ":"+PAT, and sends Content-Type only with a body', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(200, { ok: 1 })]);
    const { client } = make(fetchImpl);
    expect(client.url('_apis/wit/wiql', { $top: 5, skip: undefined })).toBe('https://dev.azure.com/acme/Demo%20Project/_apis/wit/wiql?$top=5&api-version=7.1');
    expect(client.workItemUrl(10001)).toBe('https://dev.azure.com/acme/Demo%20Project/_workitems/edit/10001');

    const response = await client.request({ method: 'GET', path: '/_apis/test/runs/1' });
    expect(response.body).toEqual({ ok: 1 });
    expect(calls[0]!.url).toBe('https://dev.azure.com/acme/Demo%20Project/_apis/test/runs/1?api-version=7.1');
    expect(headersOf(calls[0]!)).toEqual({ Authorization: `Basic ${Buffer.from(':secret-pat').toString('base64')}`, Accept: 'application/json' });
    expect(calls[0]!.init.body).toBeUndefined();
  });

  it('sends application/json for JSON bodies and application/json-patch+json for work item patches', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(200, {})]);
    const { client } = make(fetchImpl);
    await client.request({ method: 'POST', path: '_apis/wit/wiql', body: { query: 'SELECT' }, idempotent: true });
    await client.request({ method: 'PATCH', path: '_apis/wit/workitems/1', body: [{ op: 'add' }], contentType: 'application/json-patch+json' });
    expect(headersOf(calls[0]!)['Content-Type']).toBe('application/json');
    expect(calls[0]!.init.body).toBe('{"query":"SELECT"}');
    expect(headersOf(calls[1]!)['Content-Type']).toBe('application/json-patch+json');
  });

  it('returns null for an empty body and honours a per-request api-version', async () => {
    const { fetchImpl, calls } = scripted([new Response(null, { status: 204 })]);
    const { client } = make(fetchImpl, { apiVersion: '7.0' });
    expect((await client.request({ method: 'DELETE', path: 'x', apiVersion: '7.1-preview.4' })).body).toBeNull();
    expect(calls[0]!.url).toMatch(/api-version=7\.1-preview\.4$/);
  });
});

describe('failure classification and retries', () => {
  it('retries 429 after Retry-After, even for a POST', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(429, { message: 'throttled' }, { 'retry-after': '2' }), jsonResponse(200, { id: 1 })]);
    const { client, waits, logs } = make(fetchImpl);
    const response = await client.request({ method: 'POST', path: '_apis/test/runs', body: {} });
    expect(response.body).toEqual({ id: 1 });
    expect(calls).toHaveLength(2);
    expect(waits).toEqual([2000]);
    expect(logs[0]).toMatch(/HTTP 429.*retry 1\/4 in 2000 ms/);
  });

  it('fails fast as rate-limited when Retry-After exceeds the cap, carrying the wait', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(429, {}, { 'retry-after': '120' })]);
    const { client, waits } = make(fetchImpl);
    const error = await caught(client.request({ method: 'GET', path: 'x' }));
    expect(error.family).toBe('rate-limited');
    expect(error.detail).toMatchObject({ status: 429, retryAfterMs: 120_000 });
    expect(calls).toHaveLength(1);
    expect(waits).toEqual([]);
  });

  it('retries 5xx for idempotent requests with jittered exponential backoff', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(503, { message: 'down' }), jsonResponse(502, {}), jsonResponse(200, { fine: true })]);
    const { client, waits } = make(fetchImpl);
    expect((await client.request({ method: 'GET', path: 'x' })).body).toEqual({ fine: true });
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([150, 300]);
  });

  it('gives up after maxRetries with the attempt count', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(500, { message: 'boom' })]);
    const { client } = make(fetchImpl, { maxRetries: 2 });
    const error = await caught(client.request({ method: 'GET', path: 'x', what: 'read things' }));
    expect(error.family).toBe('unavailable');
    expect(error.message).toBe('Azure DevOps failed read things (HTTP 500): boom (after 3 attempts)');
    expect(error.detail).toMatchObject({ attempts: 3 });
    expect(calls).toHaveLength(3);
  });

  it('never resends a non-idempotent POST after an ambiguous failure', async () => {
    const { fetchImpl, calls } = scripted([jsonResponse(500, {}), jsonResponse(200, {})]);
    const { client } = make(fetchImpl);
    expect((await caught(client.request({ method: 'POST', path: '_apis/test/runs', body: {} }))).family).toBe('unavailable');
    expect(calls).toHaveLength(1);

    const dropped = scripted([new TypeError('fetch failed'), jsonResponse(200, {})]);
    const second = make(dropped.fetchImpl);
    const error = await caught(second.client.request({ method: 'POST', path: '_apis/test/runs', body: {} }));
    expect(error.family).toBe('unavailable');
    expect(error.message).toMatch(/could not reach Azure DevOps/);
    expect(dropped.calls).toHaveLength(1);
  });

  it('retries network failures for idempotent requests, and a refused connection even for a POST', async () => {
    const { fetchImpl, calls } = scripted([new TypeError('fetch failed'), jsonResponse(200, { ok: true })]);
    const { client } = make(fetchImpl);
    expect((await client.request({ method: 'GET', path: 'x' })).body).toEqual({ ok: true });
    expect(calls).toHaveLength(2);

    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const post = scripted([refused, jsonResponse(200, { id: 2 })]);
    expect((await make(post.fetchImpl).client.request({ method: 'POST', path: 'y', body: {} })).body).toEqual({ id: 2 });
    expect(post.calls).toHaveLength(2);
  });

  it('classifies authentication failures as not-configured and names the PAT variable', async () => {
    const cases: readonly Response[] = [
      new Response('', { status: 401 }),
      textResponse(203, '<html><body>Sign in</body></html>', 'text/html'),
      textResponse(200, '<!DOCTYPE html><html>Sign in</html>', 'text/html; charset=utf-8'),
      new Response('', { status: 302, headers: { location: 'https://login.example/signin' } }),
    ];
    for (const response of cases) {
      const { fetchImpl } = scripted([response]);
      const error = await caught(make(fetchImpl, { patEnv: 'MY_ADO_PAT' }).client.request({ method: 'GET', path: 'x' }));
      expect(error.family).toBe('not-configured');
      expect(error.message).toMatch(/MY_ADO_PAT/);
      expect(error.message).not.toMatch(/secret-pat/);
    }
    const forbidden = scripted([jsonResponse(403, { message: 'no' })]);
    const error = await caught(make(forbidden.fetchImpl).client.request({ method: 'GET', path: 'x' }));
    expect(error.family).toBe('not-configured');
    expect(error.message).toMatch(/lacks a scope/);
  });

  it('maps 404, 400, 409 and other statuses, quoting the ADO message', async () => {
    const expectations: readonly [Response, string, RegExp][] = [
      [jsonResponse(404, { message: 'TF401232: Work item 5 does not exist' }), 'not-found', /TF401232/],
      [jsonResponse(400, { message: 'TF51005: bad field' }), 'invalid-input', /TF51005/],
      [jsonResponse(409, { message: 'conflict' }), 'conflict', /conflict/],
      [jsonResponse(418, { message: 'teapot' }), 'unclassified', /HTTP 418: teapot/],
    ];
    for (const [response, family, message] of expectations) {
      const { fetchImpl } = scripted([response]);
      const error = await caught(make(fetchImpl).client.request({ method: 'GET', path: 'x' }));
      expect(error.family).toBe(family);
      expect(error.message).toMatch(message);
    }
  });

  it('reports a non-JSON success body as malformed-response', async () => {
    const { fetchImpl } = scripted([textResponse(200, 'not json at all', 'application/json')]);
    expect((await caught(make(fetchImpl).client.request({ method: 'GET', path: 'x' }))).family).toBe('malformed-response');
  });

  it('times out a request with AbortSignal.timeout and classifies it as unavailable', async () => {
    const mock = await startMockAdo({ failures: [{ path: '/_apis/test/runs/1', mode: 'delay', delayMs: 2000 }] });
    try {
      const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'p', timeoutMs: 100, maxRetries: 0 });
      const error = await caught(client.request({ method: 'GET', path: '_apis/test/runs/1' }));
      expect(error.family).toBe('unavailable');
      expect(error.message).toMatch(/did not answer .* within 100 ms/);
    } finally {
      await mock.close();
    }
  });

  it('parses Retry-After as seconds or an HTTP date', () => {
    const now = Date.parse('2026-10-19T10:00:00Z');
    expect(parseRetryAfter('3', now)).toBe(3000);
    expect(parseRetryAfter('0.5', now)).toBe(500);
    expect(parseRetryAfter('Mon, 19 Oct 2026 10:00:05 GMT', now)).toBe(5000);
    expect(parseRetryAfter('soon', now)).toBeUndefined();
    expect(parseRetryAfter(null, now)).toBeUndefined();
  });
});

describe('against the mock over HTTP', () => {
  let mock: MockAdo;
  beforeAll(async () => {
    mock = await startMockAdo({ pat: 'right-pat', failures: [{ method: 'GET', path: '/_apis/test/runs/77', status: 429, retryAfter: 0 }] });
  });
  afterAll(async () => mock.close());

  it('rejects a wrong PAT with a not-configured error naming the variable', async () => {
    const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'wrong-pat' });
    const error = await caught(client.request({ method: 'GET', path: '_apis/test/runs/1' }));
    expect(error.family).toBe('not-configured');
    expect(error.message).toMatch(/AZURE_DEVOPS_PAT/);
  });

  it('retries a 429 with Retry-After 0 and then reports the 404 that follows', async () => {
    const waits: number[] = [];
    const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'right-pat', sleep: async (ms) => void waits.push(ms) });
    const error = await caught(client.request({ method: 'GET', path: '_apis/test/runs/77' }));
    expect(waits).toEqual([0]);
    expect(error.family).toBe('not-found');
    expect(error.message).toMatch(/Test run 77 does not exist/);
  });
});

describe('configuration from the workspace and environment', () => {
  let root: string;
  beforeAll(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-ado-config-'));
  });
  afterAll(async () => rm(root, { recursive: true, force: true }));

  it('returns null and lists what is missing when nothing is configured', async () => {
    const workspace = await loadWorkspace(root, {});
    expect(adoClientFromWorkspace(workspace, {})).toBeNull();
    expect(adoSettings(workspace, {}).missing).toHaveLength(3);
    const error = await caught(Promise.resolve().then(() => requireAdoClient(workspace, {})));
    expect(error.family).toBe('not-configured');
    expect(error.message).toMatch(/AZURE_DEVOPS_ORG_URL.*AZURE_DEVOPS_PROJECT.*AZURE_DEVOPS_PAT/);
  });

  it('reads AZURE_DEVOPS_* and the v1 TESSERACT_ADO_* names', async () => {
    const env = { AZURE_DEVOPS_ORG_URL: 'https://dev.azure.com/acme', AZURE_DEVOPS_PROJECT: 'demo', AZURE_DEVOPS_PAT: 'p1' };
    const client = adoClientFromWorkspace(await loadWorkspace(root, env), env);
    expect(client?.url('x')).toBe('https://dev.azure.com/acme/demo/x?api-version=7.1');

    const v1 = { TESSERACT_ADO_ORG_URL: 'https://dev.azure.com/old', TESSERACT_ADO_PROJECT: 'legacy', TESSERACT_ADO_PAT: 'p2', TESSERACT_ADO_API_VERSION: '6.0' };
    const legacy = adoClientFromWorkspace(await loadWorkspace(root, v1), v1);
    expect(legacy?.url('x')).toBe('https://dev.azure.com/old/legacy/x?api-version=6.0');
  });

  it('prefers the workspace config and reads the PAT from the configured variable', async () => {
    await mkdir(path.join(root, '.tesseract'), { recursive: true });
    await writeFile(
      path.join(root, '.tesseract', 'config.json'),
      JSON.stringify({ ado: { orgUrl: 'https://ado.example/tfs/Collection', project: 'Team', patEnv: 'TEAM_PAT' } }),
    );
    const env = { TEAM_PAT: 'team-secret', TESSERACT_ADO_ORG_URL: 'https://ignored.example' };
    const workspace = await loadWorkspace(root, env);
    const client = adoClientFromWorkspace(workspace, env);
    expect(client?.orgUrl).toBe('https://ado.example/tfs/Collection');
    expect(client?.patEnv).toBe('TEAM_PAT');
    expect(adoSettings(workspace, {}).missing).toEqual([expect.stringMatching(/^TEAM_PAT/)]);
  });
});

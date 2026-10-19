/**
 * The Azure DevOps REST client: one `request` function that builds the URL,
 * authenticates, times out, classifies every failure onto an error family,
 * and retries only what is safe to retry.
 *
 * What v1 got wrong and this fixes (reader §7.7): Node's fetch fails with
 * `TypeError('fetch failed')`, which v1's transient check never matched; 429
 * and 5xx became plain errors and were never retried; Retry-After was ignored;
 * there was no request timeout; JSON content-type was sent on GETs and would
 * have broken the json-patch work item PATCH; an HTML sign-in page surfaced as
 * a SyntaxError.
 *
 * Retry policy. Rate-limited (429) responses were rejected before any work was
 * done, so they are retried for every method, after Retry-After. Ambiguous
 * failures (timeouts, dropped connections, 5xx) may have been processed, so
 * they are retried only for idempotent requests: GET/PUT/PATCH/DELETE and
 * read-only POSTs that say so (`idempotent: true`, e.g. WIQL and
 * workitemsbatch). Creating a run is never blindly retried: ADO has no
 * idempotency key, and publish.ts recovers through its ledger instead.
 */
import { ToolError, type ErrorFamily } from '../core/errors.js';
import type { Workspace } from '../workspace/workspace.js';

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export type QueryValue = string | number | boolean | undefined;

export interface AdoRequest {
  readonly method: HttpMethod;
  /** Path under the project, without a leading slash, e.g. "_apis/wit/workitemsbatch". */
  readonly path: string;
  /** Query parameters; undefined values are dropped; api-version is appended. Keys are sent verbatim (e.g. "$top"). */
  readonly query?: Readonly<Record<string, QueryValue>>;
  /** JSON body. Content-Type is sent only when a body is present. */
  readonly body?: unknown;
  /** Defaults to application/json; work item PATCH needs application/json-patch+json. */
  readonly contentType?: 'application/json' | 'application/json-patch+json';
  /** Overrides the client's api-version (e.g. "7.1-preview.4" for work item comments). */
  readonly apiVersion?: string;
  /** Safe to resend after an ambiguous failure. Defaults to true for every method but POST. */
  readonly idempotent?: boolean;
  /** Short description for messages, e.g. "fetch work items". */
  readonly what?: string;
}

export interface AdoResponse<T = unknown> {
  readonly status: number;
  /** Parsed JSON; null for an empty body. */
  readonly body: T;
  readonly headers: Headers;
}

export interface AdoClient {
  readonly orgUrl: string;
  readonly project: string;
  readonly apiVersion: string;
  /** Name of the environment variable the PAT came from, for messages. */
  readonly patEnv: string;
  /** Absolute URL for a project-scoped path, with api-version appended. */
  url(path: string, query?: Readonly<Record<string, QueryValue>>, apiVersion?: string): string;
  /** The work item's page in the ADO web UI. */
  workItemUrl(id: number | string): string;
  request<T = unknown>(request: AdoRequest): Promise<AdoResponse<T>>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface AdoClientOptions {
  /** e.g. "https://dev.azure.com/acme" or an Azure DevOps Server collection URL. */
  readonly orgUrl: string;
  readonly project: string;
  readonly pat: string;
  /** Default "7.1". Azure DevOps Server 2022 tops out at 7.0 and Server 2020 at 6.0. */
  readonly apiVersion?: string;
  readonly fetchImpl?: FetchLike;
  /** Per-attempt timeout. Default 30 000 ms. */
  readonly timeoutMs?: number;
  /** Retries after the first attempt. Default 4. */
  readonly maxRetries?: number;
  readonly log?: (message: string) => void;
  /** Environment variable the PAT came from, named in authentication errors. Default AZURE_DEVOPS_PAT. */
  readonly patEnv?: string;
  /** Base of the jittered exponential backoff. Default 200 ms. */
  readonly retryBaseMs?: number;
  /** Ceiling of one backoff wait. Default 8 000 ms. */
  readonly maxBackoffMs?: number;
  /** Longest Retry-After honored; a longer one fails fast as rate-limited with detail.retryAfterMs. Default 30 000 ms. */
  readonly maxRetryAfterMs?: number;
  /** Injectable for tests. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly random?: () => number;
}

export const DEFAULT_API_VERSION = '7.1';
export const DEFAULT_PAT_ENV = 'AZURE_DEVOPS_PAT';

const trimSlashes = (text: string): string => text.replace(/\/+$/, '');

export const encodeBasicAuth = (pat: string): string => Buffer.from(`:${pat}`, 'utf8').toString('base64');

export const buildQuery = (query: Readonly<Record<string, QueryValue>> | undefined, apiVersion: string): string =>
  [
    ...Object.entries(query ?? {})
      .filter((entry): entry is [string, string | number | boolean] => entry[1] !== undefined)
      .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`),
    `api-version=${encodeURIComponent(apiVersion)}`,
  ].join('&');

/** Retry-After is either delta-seconds or an HTTP date. */
export const parseRetryAfter = (header: string | null, now: number = Date.now()): number | undefined => {
  if (header === null || header.trim().length === 0) return undefined;
  const value = header.trim();
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value) * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
};

const looksLikeHtml = (text: string, contentType: string | null): boolean =>
  (contentType ?? '').toLowerCase().includes('text/html') || /^\s*<(!doctype|html|head|body|\?xml)/i.test(text);

/** ADO error bodies are JSON with a `message`; anything else is summarized without echoing HTML. */
const adoMessage = (text: string): string | undefined => {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (parsed !== null && typeof parsed === 'object') {
      const message = (parsed as { message?: unknown }).message;
      if (typeof message === 'string' && message.length > 0) return message;
    }
  } catch {
    // not JSON
  }
  const plain = text.trim();
  return plain.length > 0 && !/^\s*</.test(plain) ? plain.slice(0, 300) : undefined;
};

type RetryClass = 'always' | 'if-idempotent' | 'never';

interface Failure {
  readonly ok: false;
  readonly error: ToolError;
  readonly retry: RetryClass;
  readonly retryAfterMs?: number;
}

type Attempt<T> = { readonly ok: true; readonly response: AdoResponse<T> } | Failure;

const fail = (family: ErrorFamily, message: string, retry: RetryClass, detail: Record<string, unknown>, retryAfterMs?: number): Failure => ({
  ok: false,
  error: new ToolError(family, message, detail),
  retry,
  ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
});

const errorCode = (cause: unknown): string | undefined => {
  const inner = (cause as { cause?: { code?: unknown } } | undefined)?.cause;
  const code = inner?.code ?? (cause as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' ? code : undefined;
};

export const createAdoClient = (options: AdoClientOptions): AdoClient => {
  const orgUrl = trimSlashes(options.orgUrl.trim());
  const project = options.project.trim();
  const apiVersion = options.apiVersion ?? DEFAULT_API_VERSION;
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const timeoutMs = options.timeoutMs ?? 30_000;
  const maxRetries = Math.max(0, options.maxRetries ?? 4);
  const patEnv = options.patEnv ?? DEFAULT_PAT_ENV;
  const retryBaseMs = options.retryBaseMs ?? 200;
  const maxBackoffMs = options.maxBackoffMs ?? 8_000;
  const maxRetryAfterMs = options.maxRetryAfterMs ?? 30_000;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  const log = options.log ?? (() => undefined);
  const authorization = `Basic ${encodeBasicAuth(options.pat)}`;
  const projectBase = `${orgUrl}/${encodeURIComponent(project)}`;

  const url = (path: string, query?: Readonly<Record<string, QueryValue>>, version?: string): string =>
    `${projectBase}/${path.replace(/^\/+/, '')}?${buildQuery(query, version ?? apiVersion)}`;

  const workItemUrl = (id: number | string): string => `${projectBase}/_workitems/edit/${encodeURIComponent(String(id))}`;

  const authMessage = (status: number, what: string): string =>
    status === 403
      ? `Azure DevOps refused ${what} (HTTP 403): the personal access token in ${patEnv} lacks a scope this needs ` +
        '(Work Items: Read for fetching; Test Management: Read & write for publishing; Work Items: Read & write for automation association and comments).'
      : `Azure DevOps did not accept the credentials for ${what} (HTTP ${status}): check that ${patEnv} holds a valid, unexpired personal access token ` +
        `for ${orgUrl}, and that AZURE_DEVOPS_ORG_URL / AZURE_DEVOPS_PROJECT point at the right organization and project.`;

  const attempt = async <T>(target: string, request: AdoRequest, what: string): Promise<Attempt<T>> => {
    const detail = { method: request.method, url: target };
    const hasBody = request.body !== undefined;
    let response: Response;
    let text: string;
    try {
      response = await fetchImpl(target, {
        method: request.method,
        headers: {
          Authorization: authorization,
          Accept: 'application/json',
          ...(hasBody ? { 'Content-Type': request.contentType ?? 'application/json' } : {}),
        },
        ...(hasBody ? { body: JSON.stringify(request.body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });
      text = await response.text();
    } catch (cause) {
      const name = (cause as { name?: unknown } | undefined)?.name;
      if (name === 'TimeoutError' || name === 'AbortError') {
        return fail('unavailable', `Azure DevOps did not answer ${what} within ${timeoutMs} ms`, 'if-idempotent', { ...detail, timeoutMs });
      }
      const code = errorCode(cause);
      const reason = cause instanceof Error ? cause.message : String(cause);
      // A refused connection never reached the server, so even a POST is safe to resend.
      return fail(
        'unavailable',
        `could not reach Azure DevOps for ${what}: ${reason}${code !== undefined ? ` (${code})` : ''}`,
        code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'always' : 'if-idempotent',
        { ...detail, ...(code !== undefined ? { code } : {}) },
      );
    }

    const status = response.status;
    const contentType = response.headers.get('content-type');
    const withStatus = { ...detail, status };
    if (status === 429) {
      const retryAfterMs = parseRetryAfter(response.headers.get('retry-after'));
      return fail(
        'rate-limited',
        `Azure DevOps is throttling requests (HTTP 429) for ${what}${retryAfterMs !== undefined ? `; retry after ${Math.ceil(retryAfterMs / 1000)} s` : ''}`,
        'always',
        { ...withStatus, ...(retryAfterMs !== undefined ? { retryAfterMs } : {}) },
        retryAfterMs,
      );
    }
    // 203 is how ADO answers an unauthenticated request with its sign-in page; 3xx is a redirect to it.
    if (status === 401 || status === 403 || status === 203) {
      return fail('not-configured', authMessage(status, what), 'never', { ...withStatus, patEnv });
    }
    if (status >= 300 && status < 400) {
      const location = response.headers.get('location');
      return fail(
        'not-configured',
        `${authMessage(status, what)} (Azure DevOps redirected to ${location ?? 'another page'}, usually its sign-in page; if it is not, the organization URL is outdated)`,
        'never',
        { ...withStatus, patEnv, ...(location !== null ? { location } : {}) },
      );
    }
    if (status === 404) {
      return fail('not-found', `Azure DevOps found nothing for ${what} (HTTP 404)${adoMessage(text) !== undefined ? `: ${adoMessage(text)}` : ''}`, 'never', withStatus);
    }
    if (status >= 500) {
      return fail('unavailable', `Azure DevOps failed ${what} (HTTP ${status})${adoMessage(text) !== undefined ? `: ${adoMessage(text)}` : ''}`, 'if-idempotent', withStatus);
    }
    if (status === 400 || status === 415 || status === 422) {
      return fail('invalid-input', `Azure DevOps rejected ${what} (HTTP ${status})${adoMessage(text) !== undefined ? `: ${adoMessage(text)}` : ''}`, 'never', withStatus);
    }
    if (status === 409 || status === 412) {
      return fail('conflict', `Azure DevOps reported a conflict for ${what} (HTTP ${status})${adoMessage(text) !== undefined ? `: ${adoMessage(text)}` : ''}`, 'never', withStatus);
    }
    if (status < 200 || status >= 300) {
      return fail('unclassified', `Azure DevOps answered ${what} with HTTP ${status}${adoMessage(text) !== undefined ? `: ${adoMessage(text)}` : ''}`, 'never', withStatus);
    }
    if (text.trim().length === 0) return { ok: true, response: { status, body: null as T, headers: response.headers } };
    if (looksLikeHtml(text, contentType)) {
      return fail('not-configured', `${authMessage(401, what)} (Azure DevOps returned an HTML page instead of JSON, which is its sign-in page)`, 'never', {
        ...withStatus,
        patEnv,
      });
    }
    try {
      return { ok: true, response: { status, body: JSON.parse(text) as T, headers: response.headers } };
    } catch {
      return fail('malformed-response', `Azure DevOps returned a body that is not JSON for ${what}`, 'never', { ...withStatus, contentType });
    }
  };

  const backoff = (retryNumber: number): number => {
    const ceiling = Math.min(maxBackoffMs, retryBaseMs * 2 ** retryNumber);
    return Math.round(ceiling / 2 + random() * (ceiling / 2));
  };

  const request = async <T>(req: AdoRequest): Promise<AdoResponse<T>> => {
    const target = url(req.path, req.query, req.apiVersion);
    const what = req.what ?? `${req.method} ${req.path}`;
    const idempotent = req.idempotent ?? req.method !== 'POST';
    for (let retryNumber = 0; ; retryNumber += 1) {
      const result = await attempt<T>(target, req, what);
      if (result.ok) return result.response;
      const retryable = result.retry === 'always' || (result.retry === 'if-idempotent' && idempotent);
      if (!retryable || retryNumber >= maxRetries) {
        throw retryNumber === 0 ? result.error : new ToolError(result.error.family, `${result.error.message} (after ${retryNumber + 1} attempts)`, {
          ...(result.error.detail ?? {}),
          attempts: retryNumber + 1,
        });
      }
      if (result.retryAfterMs !== undefined && result.retryAfterMs > maxRetryAfterMs) throw result.error;
      const waitMs = result.retryAfterMs ?? backoff(retryNumber);
      log(`${result.error.message}; retry ${retryNumber + 1}/${maxRetries} in ${waitMs} ms`);
      await sleep(waitMs);
    }
  };

  return { orgUrl, project, apiVersion, patEnv, url, workItemUrl, request };
};

// ─── Configuration from the workspace and environment ──────────────────────

export interface AdoSettings {
  readonly orgUrl: string | null;
  readonly project: string | null;
  /** The PAT itself is never returned; only whether it is present. */
  readonly hasPat: boolean;
  /** The environment variable the PAT is read from (workspace config `ado.patEnv`, default AZURE_DEVOPS_PAT). */
  readonly patEnv: string;
  readonly apiVersion: string | undefined;
  /** What is missing, phrased as what to set. Empty when configured. */
  readonly missing: readonly string[];
}

const firstSet = (...values: readonly (string | null | undefined)[]): string | null => {
  const found = values.find((value) => typeof value === 'string' && value.trim().length > 0);
  return found === undefined || found === null ? null : found.trim();
};

const patOf = (workspace: Workspace, env: NodeJS.ProcessEnv): string | null =>
  firstSet(env[workspace.config.ado.patEnv], env[DEFAULT_PAT_ENV], env.TESSERACT_ADO_PAT);

/**
 * Where the settings come from, first set wins:
 *   org URL — workspace config ado.orgUrl (which loadWorkspace already overrides
 *             with AZURE_DEVOPS_ORG_URL), env AZURE_DEVOPS_ORG_URL, env TESSERACT_ADO_ORG_URL (v1);
 *   project — ado.project, AZURE_DEVOPS_PROJECT, TESSERACT_ADO_PROJECT (v1);
 *   PAT     — env[ado.patEnv], AZURE_DEVOPS_PAT, TESSERACT_ADO_PAT (v1);
 *   api-version — AZURE_DEVOPS_API_VERSION, TESSERACT_ADO_API_VERSION (v1), else 7.1.
 */
export const adoSettings = (workspace: Workspace, env: NodeJS.ProcessEnv = process.env): AdoSettings => {
  const orgUrl = firstSet(workspace.config.ado.orgUrl, env.AZURE_DEVOPS_ORG_URL, env.TESSERACT_ADO_ORG_URL);
  const project = firstSet(workspace.config.ado.project, env.AZURE_DEVOPS_PROJECT, env.TESSERACT_ADO_PROJECT);
  const hasPat = patOf(workspace, env) !== null;
  const patEnv = workspace.config.ado.patEnv;
  const apiVersion = firstSet(env.AZURE_DEVOPS_API_VERSION, env.TESSERACT_ADO_API_VERSION) ?? undefined;
  const missing = [
    ...(orgUrl === null ? ['AZURE_DEVOPS_ORG_URL (or ado.orgUrl in .tesseract/config.json), e.g. https://dev.azure.com/acme'] : []),
    ...(project === null ? ['AZURE_DEVOPS_PROJECT (or ado.project in .tesseract/config.json)'] : []),
    ...(hasPat ? [] : [`${patEnv} (a personal access token with Work Items: Read and Test Management: Read & write)`]),
  ];
  return { orgUrl, project, hasPat, patEnv, apiVersion, missing };
};

/** A client for the workspace's Azure DevOps project, or null when it is not configured. */
export const adoClientFromWorkspace = (
  workspace: Workspace,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Omit<AdoClientOptions, 'orgUrl' | 'project' | 'pat'>> = {},
): AdoClient | null => {
  const settings = adoSettings(workspace, env);
  const pat = patOf(workspace, env);
  if (settings.orgUrl === null || settings.project === null || pat === null) return null;
  return createAdoClient({
    orgUrl: settings.orgUrl,
    project: settings.project,
    pat,
    patEnv: settings.patEnv,
    ...(settings.apiVersion !== undefined ? { apiVersion: settings.apiVersion } : {}),
    ...overrides,
  });
};

/** Like adoClientFromWorkspace, but throws not-configured naming exactly what to set. */
export const requireAdoClient = (
  workspace: Workspace,
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<Omit<AdoClientOptions, 'orgUrl' | 'project' | 'pat'>> = {},
): AdoClient => {
  const client = adoClientFromWorkspace(workspace, env, overrides);
  if (client !== null) return client;
  const { missing } = adoSettings(workspace, env);
  throw new ToolError('not-configured', `Azure DevOps is not configured: set ${missing.join('; ')}.`, { missing });
};

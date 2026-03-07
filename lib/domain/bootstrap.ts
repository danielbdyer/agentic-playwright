import { Brand, brandString } from './brand';
import { SchemaError } from './errors';

export type BaseUrl = Brand<string, 'BaseUrl'>;
export type AdoSuiteId = Brand<string, 'AdoSuiteId'>;
export type Hostname = Brand<string, 'Hostname'>;

export type AuthSessionStrategy = 'none' | 'cookie-session' | 'storage-state' | 'bearer-token';

export interface CrawlBounds {
  depth: number;
  hostAllowlist: Hostname[];
  timeoutMs: number;
  pageBudget: number;
}

export interface BootstrapInput {
  baseUrl: BaseUrl;
  suiteIds: AdoSuiteId[];
  authStrategy: AuthSessionStrategy;
  crawlBounds: CrawlBounds;
}

export function createBaseUrl(value: string): BaseUrl {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SchemaError('expected a valid absolute URL', 'baseUrl');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new SchemaError('expected http or https URL', 'baseUrl');
  }

  parsed.hash = '';
  const normalized = parsed.toString().replace(/\/$/, '');
  return brandString<'BaseUrl'>(normalized);
}

export function createAdoSuiteId(value: string): AdoSuiteId {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new SchemaError('expected alphanumeric suite id', 'suiteIds');
  }
  return brandString<'AdoSuiteId'>(trimmed);
}

export function createHostname(value: string): Hostname {
  const trimmed = value.trim().toLowerCase();
  if (!/^[a-z0-9.-]+$/.test(trimmed) || trimmed.startsWith('.') || trimmed.endsWith('.')) {
    throw new SchemaError('expected hostname', 'crawlBounds.hostAllowlist');
  }
  return brandString<'Hostname'>(trimmed);
}

export function createAuthSessionStrategy(value: string): AuthSessionStrategy {
  const supported: AuthSessionStrategy[] = ['none', 'cookie-session', 'storage-state', 'bearer-token'];
  if (!supported.includes(value as AuthSessionStrategy)) {
    throw new SchemaError(`expected one of ${supported.join(', ')}`, 'authStrategy');
  }
  return value as AuthSessionStrategy;
}

function createPositiveInteger(value: number, path: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new SchemaError('expected positive integer', path);
  }
  return value;
}

export function createCrawlBounds(value: {
  depth: number;
  hostAllowlist: string[];
  timeoutMs: number;
  pageBudget: number;
}): CrawlBounds {
  const allowlist = [...new Set(value.hostAllowlist.map((entry) => createHostname(entry)))].sort((left, right) =>
    left.localeCompare(right),
  );

  if (allowlist.length === 0) {
    throw new SchemaError('expected at least one hostname', 'crawlBounds.hostAllowlist');
  }

  return {
    depth: createPositiveInteger(value.depth, 'crawlBounds.depth'),
    hostAllowlist: allowlist,
    timeoutMs: createPositiveInteger(value.timeoutMs, 'crawlBounds.timeoutMs'),
    pageBudget: createPositiveInteger(value.pageBudget, 'crawlBounds.pageBudget'),
  };
}

export function createBootstrapInput(value: {
  baseUrl: string;
  suiteIds: string[];
  authStrategy: string;
  crawlBounds: {
    depth: number;
    hostAllowlist: string[];
    timeoutMs: number;
    pageBudget: number;
  };
}): BootstrapInput {
  const suiteIds = [...new Set(value.suiteIds.map((entry) => createAdoSuiteId(entry)))].sort((left, right) =>
    left.localeCompare(right),
  );

  if (suiteIds.length === 0) {
    throw new SchemaError('expected at least one suite id', 'suiteIds');
  }

  return {
    baseUrl: createBaseUrl(value.baseUrl),
    suiteIds,
    authStrategy: createAuthSessionStrategy(value.authStrategy),
    crawlBounds: createCrawlBounds(value.crawlBounds),
  };
}

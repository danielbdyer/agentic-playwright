/**
 * The authoring receipt: one JSON line per tool call, appended to
 * .tesseract/receipts/authoring.jsonl. It is v1's ReasoningReceipt moved to
 * where decisions actually happen — the host's model id, prompt fingerprint,
 * and token counts are recorded when the host reports them in `decision`.
 */
import { appendJsonl } from '../core/fsio.js';
import { redact, redactUrlLike, redactUrlsIn, type PiiMode } from '../core/pii.js';
import type { ErrorFamily } from '../core/errors.js';
import type { Decision } from '../contract/schemas.js';

export interface AuthoringReceipt {
  readonly at: string;
  readonly session: string;
  readonly tool: string;
  readonly testCase?: string;
  readonly step?: number;
  readonly input: unknown;
  readonly output?: unknown;
  readonly outcome: 'succeeded' | 'failed';
  readonly errorFamily?: ErrorFamily;
  readonly message?: string;
  readonly durationMs: number;
  readonly decision?: Omit<Decision, 'host' | 'testCase' | 'step'>;
  readonly host?: Decision['host'];
}

const MAX_STRING = 400;
const MAX_ARRAY = 12;
const MAX_DEPTH = 5;

/** Keep receipts small: long strings truncated, long arrays sampled, deep objects elided. */
export const summarize = (value: unknown, depth = 0): unknown => {
  if (typeof value === 'string') return value.length > MAX_STRING ? `${value.slice(0, MAX_STRING)}…(${value.length} chars)` : value;
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[${value.length} items]`;
    const head = value.slice(0, MAX_ARRAY).map((item) => summarize(item, depth + 1));
    return value.length > MAX_ARRAY ? [...head, `…(${value.length - MAX_ARRAY} more)`] : head;
  }
  if (value !== null && typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '{…}';
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, summarize(v, depth + 1)]));
  }
  return value;
};

/** Fields whose values are secrets and must never be written, whatever the PII mode. */
const SECRET_KEYS = /^(password|passwd|secret|token|pat|authorization|cookie|params)$/i;

export const scrubSecrets = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(scrubSecrets);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '<secret>' : scrubSecrets(v)]),
    );
  }
  return value;
};

/** Fields that hold a URL (absolute, or relative to the profile base URL). */
const URL_FIELDS = /^(url|finalUrl|startUrl|navigatesTo|href)$/;

const isUrlField = (key: string | undefined, parent: Readonly<Record<string, unknown>> | undefined): boolean =>
  key !== undefined && (URL_FIELDS.test(key) || (key === 'value' && parent?.action === 'navigate'));

/** URL query values first (the whole value for a URL field, embedded http(s) URLs otherwise), then the PII rules. */
const redactString = (text: string, pii: PiiMode, urlField: boolean): string =>
  urlField ? redactUrlLike(text, pii) : redact(redactUrlsIn(text, pii), pii);

const truncate = (text: string): string => (text.length > MAX_STRING ? `${text.slice(0, MAX_STRING)}…(${text.length} chars)` : text);

/**
 * One walk over a receipt field: secret-named fields replaced, every string
 * redacted and only then truncated (a cut through a PII value would leave a
 * fragment no rule matches), long arrays sampled, deep objects elided.
 */
const gate = (value: unknown, pii: PiiMode, depth: number, key?: string, parent?: Readonly<Record<string, unknown>>): unknown => {
  if (typeof value === 'string') return truncate(redactString(value, pii, isUrlField(key, parent)));
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) return `[${value.length} items]`;
    const head = value.slice(0, MAX_ARRAY).map((item) => gate(item, pii, depth + 1, key, parent));
    return value.length > MAX_ARRAY ? [...head, `…(${value.length - MAX_ARRAY} more)`] : head;
  }
  if (value !== null && typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '{…}';
    const record = value as Readonly<Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(record).map(([k, v]) => [k, SECRET_KEYS.test(k) ? '<secret>' : gate(v, pii, depth + 1, k, record)]),
    );
  }
  return value;
};

/** Redact every string (URLs included) without summarizing; for the decision, which the host wrote for the record. */
const redactAll = (value: unknown, pii: PiiMode): unknown => {
  if (typeof value === 'string') return redactString(value, pii, false);
  if (Array.isArray(value)) return value.map((item) => redactAll(item, pii));
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactAll(v, pii)]));
  }
  return value;
};

export const buildReceipt = (fields: AuthoringReceipt, pii: PiiMode): AuthoringReceipt => {
  const { decision, message, ...rest } = fields;
  return {
    ...rest,
    input: gate(fields.input, pii, 0),
    output: fields.output === undefined ? undefined : gate(fields.output, pii, 0),
    // Error messages quote URLs and page text (Playwright's call log); they get the same gate, whole.
    ...(message !== undefined ? { message: redactString(message, pii, false) } : {}),
    ...(decision !== undefined ? { decision: redactAll(decision, pii) as AuthoringReceipt['decision'] } : {}),
  };
};

export const appendAuthoringReceipt = async (file: string, receipt: AuthoringReceipt, pii: PiiMode): Promise<void> => {
  await appendJsonl(file, buildReceipt(receipt, pii));
};

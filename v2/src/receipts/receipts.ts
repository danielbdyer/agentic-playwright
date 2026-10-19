/**
 * The authoring receipt: one JSON line per tool call, appended to
 * .tesseract/receipts/authoring.jsonl. It is v1's ReasoningReceipt moved to
 * where decisions actually happen — the host's model id, prompt fingerprint,
 * and token counts are recorded when the host reports them in `decision`.
 */
import { appendJsonl } from '../core/fsio.js';
import { redactDeep, type PiiMode } from '../core/pii.js';
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

export const buildReceipt = (fields: AuthoringReceipt, pii: PiiMode): AuthoringReceipt => {
  const { decision, ...rest } = fields;
  return {
    ...rest,
    input: redactDeep(summarize(scrubSecrets(fields.input)), pii),
    output: fields.output === undefined ? undefined : redactDeep(summarize(scrubSecrets(fields.output)), pii),
    ...(decision !== undefined ? { decision: redactDeep(decision, pii) } : {}),
  };
};

export const appendAuthoringReceipt = async (file: string, receipt: AuthoringReceipt, pii: PiiMode): Promise<void> => {
  await appendJsonl(file, buildReceipt(receipt, pii));
};

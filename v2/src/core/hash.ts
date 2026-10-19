import { createHash, randomBytes } from 'node:crypto';

/** Deterministic JSON: object keys sorted recursively, undefined dropped. */
export const stableStringify = (value: unknown): string => {
  if (value !== null && typeof value === 'object' && typeof (value as { toJSON?: unknown }).toJSON === 'function') {
    return stableStringify((value as { toJSON: () => unknown }).toJSON());
  }
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') return 'null';
    return JSON.stringify(value) ?? 'null';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => (item === undefined ? 'null' : stableStringify(item))).join(',')}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined && typeof v !== 'function' && typeof v !== 'symbol')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
};

export const sha256Hex = (input: string | Buffer): string =>
  createHash('sha256').update(input).digest('hex');

/** `sha256:<hex>` over the stable serialization of a value. */
export const fingerprintOf = (value: unknown): string => `sha256:${sha256Hex(stableStringify(value))}`;

/** Short, sortable, collision-resistant id: `<prefix>-<yyyymmddhhmmss>-<8 hex>`. */
export const newId = (prefix: string, now: Date = new Date()): string => {
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `${prefix}-${stamp}-${randomBytes(4).toString('hex')}`;
};

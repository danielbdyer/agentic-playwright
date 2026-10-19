/**
 * PII gate. Applied at every boundary where page text leaves the browser:
 * snapshot candidates, ARIA text, titles, URLs, receipts. Redaction replaces
 * the matching substring with a typed placeholder, never the whole field, so
 * "Customer <email>" still tells a reviewer what kind of thing was there.
 *
 * standard: emails, SSNs, card numbers, phone numbers, digit runs of 8+.
 * strict:   standard plus digit runs of 4+.
 * off:      nothing (for teams whose QA data is synthetic and who need exact text).
 */
export type PiiMode = 'standard' | 'strict' | 'off';

interface Rule {
  readonly label: string;
  readonly re: RegExp;
}

const STANDARD_RULES: readonly Rule[] = [
  { label: 'email', re: /[\w.+-]+@[\w-]+\.[\w.-]{2,}/g },
  { label: 'ssn', re: /\b\d{3}-\d{2}-\d{4}\b/g },
  { label: 'card', re: /\b(?:\d[ -]?){13,19}\b/g },
  { label: 'phone', re: /(?:\+\d{1,3}[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/g },
  { label: 'number', re: /\b\d{8,}\b/g },
];

const STRICT_RULES: readonly Rule[] = [...STANDARD_RULES, { label: 'number', re: /\b\d{4,}\b/g }];

const rulesFor = (mode: PiiMode): readonly Rule[] => (mode === 'off' ? [] : mode === 'strict' ? STRICT_RULES : STANDARD_RULES);

export interface Redaction {
  readonly text: string;
  readonly redacted: readonly string[];
}

export const redactText = (text: string, mode: PiiMode): Redaction => {
  const redacted: string[] = [];
  const out = rulesFor(mode).reduce((acc, rule) => {
    return acc.replace(rule.re, () => {
      redacted.push(rule.label);
      return `<${rule.label}>`;
    });
  }, text);
  return { text: out, redacted };
};

export const redact = (text: string, mode: PiiMode): string => redactText(text, mode).text;

export const containsPii = (text: string, mode: PiiMode = 'standard'): boolean => redactText(text, mode).redacted.length > 0;

/** Redact every string inside a JSON-like value (for receipts). Keys are kept. */
export const redactDeep = <T>(value: T, mode: PiiMode): T => {
  if (typeof value === 'string') return redact(value, mode) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => redactDeep(item, mode)) as unknown as T;
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, redactDeep(v, mode)])) as T;
  }
  return value;
};

/** Drop query string and fragment values from a URL (keys kept) before it is written anywhere. */
export const redactUrl = (url: string, mode: PiiMode): string => {
  if (mode === 'off') return url;
  try {
    const parsed = new URL(url);
    const keys = [...parsed.searchParams.keys()];
    parsed.search = keys.length > 0 ? `?${keys.map((k) => `${encodeURIComponent(k)}=<redacted>`).join('&')}` : '';
    parsed.hash = parsed.hash.length > 0 ? '#<redacted>' : '';
    return redact(parsed.toString().replace(/%3Credacted%3E/gi, '<redacted>'), mode);
  } catch {
    return redact(url, mode);
  }
};

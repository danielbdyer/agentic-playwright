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

/**
 * Tesseract's own ids (newId: `<prefix>-<yyyymmddhhmmss>-<8 hex>`) carry a
 * fourteen-digit timestamp that the card and number rules would otherwise
 * eat, leaving receipts unable to cite the snapshot or event they mean.
 */
const OWN_ID = /\b[a-z]{1,12}-\d{14}-[0-9a-f]{8}\b/g;

export const redactText = (text: string, mode: PiiMode): Redaction => {
  const redacted: string[] = [];
  const kept: string[] = [];
  const shielded = mode === 'off' ? text : text.replace(OWN_ID, (id) => {
    kept.push(id);
    return `\u0000${kept.length - 1}\u0000`;
  });
  const out = rulesFor(mode).reduce((acc, rule) => {
    return acc.replace(rule.re, () => {
      redacted.push(rule.label);
      return `<${rule.label}>`;
    });
  }, shielded);
  const restored = kept.length === 0 ? out : out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)] ?? '');
  return { text: restored, redacted };
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

const ABSOLUTE_URL = /^[a-z][a-z0-9+.-]*:\/\//i;

/**
 * redactUrl for a value that may also be a path relative to a base URL
 * ("Detail?id=7#top" → "Detail?id=<redacted>#<redacted>"): query values and
 * the fragment dropped, keys kept, then the PII rules.
 */
export const redactUrlLike = (value: string, mode: PiiMode): string => {
  if (mode === 'off' || ABSOLUTE_URL.test(value)) return redactUrl(value, mode);
  const hashAt = value.indexOf('#');
  const beforeHash = hashAt >= 0 ? value.slice(0, hashAt) : value;
  const queryAt = beforeHash.indexOf('?');
  if (queryAt < 0 && hashAt < 0) return redact(value, mode);
  const pathPart = queryAt >= 0 ? beforeHash.slice(0, queryAt) : beforeHash;
  const keys = queryAt >= 0
    ? beforeHash.slice(queryAt + 1).split('&').filter((pair) => pair.length > 0).map((pair) => pair.split('=')[0] ?? '')
    : [];
  const query = queryAt >= 0 ? `?${keys.map((k) => `${k}=<redacted>`).join('&')}` : '';
  return redact(`${pathPart}${query}${hashAt >= 0 ? '#<redacted>' : ''}`, mode);
};

/** An http(s) URL inside free text, up to whitespace, a quote, or an angle bracket (an earlier <redacted> is kept inside). */
const EMBEDDED_URL = /\bhttps?:\/\/(?:<redacted>|[^\s"'<>`])+/gi;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/;

/**
 * Run every http(s) URL inside a text (an error message, a log line) through
 * redactUrl, so query values such as session tokens never reach a receipt.
 * Sentence punctuation after a URL stays outside it. The rest of the text is
 * left for redact().
 */
export const redactUrlsIn = (text: string, mode: PiiMode): string =>
  mode === 'off'
    ? text
    : text.replace(EMBEDDED_URL, (match) => {
        const tail = TRAILING_PUNCTUATION.exec(match)?.[0] ?? '';
        return `${redactUrl(match.slice(0, match.length - tail.length), mode)}${tail}`;
      });

/**
 * Text normalization shared by step classification, candidate ranking, and
 * memory queries. One tokenizer everywhere, so a phrase scores the same way
 * whether it is matched against a live candidate or a stored facet.
 */

const STOPWORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'into', 'onto',
  'is', 'are', 'be', 'been', 'it', 'its', 'this', 'that', 'these', 'those', 'as', 'then', 'should', 'user',
  'page', 'screen', 'appears', 'appear', 'displayed', 'shown', 'verify', 'check', 'ensure', 'confirm',
]);

/** Strip HTML tags and decode the handful of entities ADO step text carries. */
export const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|div|li)>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();

export const normalizeText = (text: string): string =>
  text.normalize('NFKC').replace(/\s+/g, ' ').trim();

const stem = (token: string): string => {
  if (token.length > 4 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 3 && token.endsWith('ed') && !token.endsWith('eed')) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('es') && /(ches|shes|xes|sses)$/.test(token)) return token.slice(0, -2);
  if (token.length > 3 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
};

/** Lowercase word tokens, stopwords removed, light stemming. Keeps digits. */
export const tokenize = (text: string, options: { readonly keepStopwords?: boolean } = {}): readonly string[] =>
  normalizeText(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0)
    .filter((token) => options.keepStopwords === true || !STOPWORDS.has(token))
    .map(stem);

/** Split camelCase / PascalCase identifiers into words before tokenizing. */
export const tokenizeIdentifier = (identifier: string): readonly string[] =>
  tokenize(identifier.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' '));

/** |a ∩ b| / |a ∪ b| over token sets. */
export const jaccard = (a: readonly string[], b: readonly string[]): number => {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 0;
  const intersection = [...setA].filter((token) => setB.has(token)).length;
  return intersection / (setA.size + setB.size - intersection);
};

/** Fraction of `query` tokens present in `target`. */
export const containment = (query: readonly string[], target: readonly string[]): number => {
  const setQ = new Set(query);
  if (setQ.size === 0) return 0;
  const setT = new Set(target);
  return [...setQ].filter((token) => setT.has(token)).length / setQ.size;
};

/**
 * Phrase similarity used everywhere a phrase is matched against a name:
 * mostly "how much of what the step said does the name cover", tempered by
 * Jaccard so a one-word name does not match every long phrase.
 */
export const phraseSimilarity = (phrase: string, name: string): number => {
  const q = tokenize(phrase);
  const t = tokenize(name);
  if (q.length === 0 || t.length === 0) return 0;
  const exact = normalizeText(phrase).toLowerCase() === normalizeText(name).toLowerCase() ? 1 : 0;
  return Math.min(1, 0.55 * containment(q, t) + 0.25 * containment(t, q) + 0.2 * jaccard(q, t) + 0.2 * exact);
};

/** kebab-case slug: "Policy number search field" → "policy-number-search-field". */
export const slugify = (text: string, maxLength = 60): string => {
  const slug = normalizeText(text)
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const trimmed = slug.length > maxLength ? slug.slice(0, maxLength).replace(/-+[^-]*$/, '') || slug.slice(0, maxLength) : slug;
  return trimmed.length > 0 ? trimmed : 'item';
};

/** "policy-number-input" → "policyNumberInput"; guarantees a valid identifier. */
export const camelCase = (text: string): string => {
  const words = normalizeText(text)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter((word) => word.length > 0)
    .map((word) => word.toLowerCase());
  const joined = words.map((word, index) => (index === 0 ? word : word[0]!.toUpperCase() + word.slice(1))).join('');
  const safe = joined.length === 0 ? 'item' : joined;
  return /^[0-9]/.test(safe) ? `_${safe}` : safe;
};

export const pascalCase = (text: string): string => {
  const camel = camelCase(text).replace(/^_/, '');
  return camel[0]!.toUpperCase() + camel.slice(1);
};

export const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A JS single-quoted string literal with escapes. */
export const quote = (text: string): string =>
  `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\r/g, '\\r').replace(/\n/g, '\\n').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')}'`;

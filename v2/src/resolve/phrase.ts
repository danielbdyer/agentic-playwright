/**
 * Text plumbing for step understanding: ADO step HTML to plain text,
 * quoted names protected while a sentence is cut into parts, and one way
 * of comparing a phrase with an accessible name used by every module in
 * resolve/.
 */
import { jaccard, containment, normalizeText, phraseSimilarity, stripHtml, tokenize } from '../core/text.js';

const NUMERIC_ENTITY = /&#(\d+);|&#x([0-9a-f]+);/gi;

/** Markup that survived a pass: a tag or an entity. */
const RESIDUAL_MARKUP = /<\/?[a-z][a-z0-9]*(?:\s[^<>]*)?\/?>|&(?:amp|lt|gt|quot|apos|nbsp|#\d+|#x[0-9a-f]+);/i;

const decodeNumeric = (text: string): string =>
  text.replace(NUMERIC_ENTITY, (whole: string, dec: string | undefined, hex: string | undefined) => {
    const code = dec !== undefined ? Number(dec) : parseInt(hex ?? '', 16);
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  });

/**
 * ADO step text as one line of plain text. Steps are HTML stored inside
 * XML; a parser that decodes the XML once still leaves `&lt;P&gt;…`, so
 * decoding repeats (at most three passes) while markup remains. Typographic
 * quotes and dashes are folded so quoted names are recognized.
 */
export const plainText = (raw: string): string => {
  let text = stripHtml(decodeNumeric(raw));
  for (let pass = 0; pass < 2 && RESIDUAL_MARKUP.test(text); pass += 1) {
    text = stripHtml(decodeNumeric(text));
  }
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u2033]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

// ─── Quote masking ─────────────────────────────────────────────────────────

/** A sentence with each quoted segment replaced by a placeholder token. */
export interface Masked {
  readonly text: string;
  readonly quotes: readonly string[];
}

const OPEN = '\uE000';
const CLOSE = '\uE001';
const MASK_ANY = /\uE000(\d+)\uE001/g;
const MASK_WHOLE = /^\uE000(\d+)\uE001$/;

/**
 * Double quotes always quote; single quotes quote only when they are not
 * an apostrophe (not inside a word), so "user's" survives.
 */
const QUOTED = /"([^"]*)"|(?<![\p{L}\p{N}])'([^']+)'(?![\p{L}\p{N}])/gu;

export const maskQuotes = (text: string): Masked => {
  const quotes: string[] = [];
  const masked = text.replace(QUOTED, (_whole: string, dq: string | undefined, sq: string | undefined) => {
    quotes.push((dq ?? sq ?? '').trim());
    return `${OPEN}${quotes.length - 1}${CLOSE}`;
  });
  return { text: masked, quotes };
};

/** Put the quoted text back, without the quote marks. */
export const unmask = (text: string, quotes: readonly string[]): string =>
  text.replace(MASK_ANY, (_whole: string, index: string) => quotes[Number(index)] ?? '');

/** Put the quoted text back with double quote marks, so a later reader still sees it was quoted. */
export const requote = (text: string, quotes: readonly string[]): string =>
  text.replace(MASK_ANY, (_whole: string, index: string) => `"${quotes[Number(index)] ?? ''}"`);

/** The quoted text when the whole string is one mask token, else null. */
export const wholeQuote = (text: string, quotes: readonly string[]): string | null => {
  const match = MASK_WHOLE.exec(text.trim());
  return match === null ? null : quotes[Number(match[1])] ?? null;
};

export const hasMask = (text: string): boolean => /\uE000\d+\uE001/.test(text);

/** The first quoted segment inside a masked string. */
export const firstQuote = (text: string, quotes: readonly string[]): string | null => {
  const match = /\uE000(\d+)\uE001/.exec(text);
  return match === null ? null : quotes[Number(match[1])] ?? null;
};

// ─── Trimming ──────────────────────────────────────────────────────────────

const LEADING_DETERMINER = /^(?:the|a|an|this|that|these|those|its|their|your|my|our|his|her|any|some)\s+/i;
/** Prepositions are dropped only in lower case: "On Hold" is a name, "on Save" is not. */
const LEADING_PREPOSITION = /^(?:on|onto|upon|at|over|in|into|to|for|from|of|with)\s+/;

/** Drop leading articles and lower-case prepositions, repeatedly ("on the Save" → "Save"). */
export const stripLeadingFiller = (text: string): string => {
  let current = text.trim();
  for (;;) {
    const next = current.replace(LEADING_DETERMINER, '').replace(LEADING_PREPOSITION, '').trim();
    if (next === current) return current;
    current = next;
  }
};

/** Trailing punctuation an ADO sentence ends with. */
export const stripTrailingPunctuation = (text: string): string => text.replace(/[\s.,;:!?]+$/u, '').trim();

/** Collapse whitespace and trim; null for an empty result. */
export const tidy = (text: string | null | undefined): string | null => {
  if (text === null || text === undefined) return null;
  const cleaned = stripTrailingPunctuation(text.replace(/\s+/g, ' ').trim()).replace(/^[\s,;:-]+/, '').trim();
  return cleaned.length === 0 ? null : cleaned;
};

const PURE_FILLER = new Set(['the', 'a', 'an', 'it', 'this', 'that', 'them', 'they', 'one', 'on', 'in', 'to', 'of']);

/** True for captures that are only an article or pronoun: never a name. */
export const isPureFiller = (text: string): boolean => PURE_FILLER.has(text.trim().toLowerCase());

// ─── Comparison ────────────────────────────────────────────────────────────

export const lowerNorm = (text: string): string => normalizeText(text).toLowerCase();

/** Case-insensitive, whitespace-normalized equality; never true for empty strings. */
export const namesEqual = (a: string, b: string): boolean => {
  const left = lowerNorm(a);
  return left.length > 0 && left === lowerNorm(b);
};

/**
 * Phrase-to-name similarity, 0..1. The shared tokenizer drops stopwords,
 * and some real control names are nothing but stopwords ("Confirm",
 * "Check"): those fall back to comparing all tokens, so a button named
 * "Confirm" is still found by the step that names it.
 */
export const nameSimilarity = (phrase: string, name: string): number => {
  if (phrase.trim().length === 0 || name.trim().length === 0) return 0;
  if (namesEqual(phrase, name)) return 1;
  const shared = phraseSimilarity(phrase, name);
  if (shared > 0) return shared;
  const q = tokenize(phrase, { keepStopwords: true });
  const t = tokenize(name, { keepStopwords: true });
  if (q.length === 0 || t.length === 0) return 0;
  return Math.min(1, 0.55 * containment(q, t) + 0.25 * containment(t, q) + 0.2 * jaccard(q, t));
};

const escapeForRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Case-insensitive containment with word-ish boundaries, so "POL-001" is
 * found in "POL-001 John Smith" but not in "POL-0010".
 */
export const containsBounded = (haystack: string, needle: string): boolean => {
  const n = normalizeText(needle);
  if (n.length === 0) return false;
  const re = new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeForRegExp(n)}(?![\\p{L}\\p{N}_-])`, 'iu');
  return re.test(normalizeText(haystack));
};

export const containsLoose = (haystack: string, needle: string): boolean => {
  const n = lowerNorm(needle);
  return n.length > 0 && lowerNorm(haystack).includes(n);
};

/** Words of an identifier ("Input_PolicyNumber" → "Input Policy Number"). */
export const identifierWords = (identifier: string): string =>
  identifier
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[_\-.:]+/g, ' ')
    .trim();

/**
 * Values and parameters. v1 never populated a step's value: its runner
 * filled every input with the first value of the first data row, whatever
 * the step said. Here a step's value is read from its words: a quoted
 * literal, an ADO parameter by "@name", a parameter named by its bare
 * words ("Enter policy number" with parameter policyNumber), or an
 * unquoted literal ("Enter Alice in the Name field"). A description ("a
 * valid policy number") is never typed literally.
 */
import { tokenize, tokenizeIdentifier } from '../core/text.js';
import { isPureFiller, maskQuotes, tidy, wholeQuote } from './phrase.js';

export interface ValueContext {
  readonly parameters: readonly string[];
  readonly dataRow?: Readonly<Record<string, string>>;
}

export type ValueSource = 'param' | 'literal' | 'description' | 'none';

export interface ValueReading {
  readonly value: string | null;
  readonly source: ValueSource;
  readonly note: string | null;
}

const PARAM_WHOLE = /^(?:@([A-Za-z_]\w*)|\{([A-Za-z_]\w*)\})$/;
const PARAM_INSIDE = /(?:^|[^\w@])@([A-Za-z_]\w*)\b/g;

export const paramRef = (name: string): string => `@${name}`;

export const isParamRef = (value: string | null): boolean => value !== null && /^@[A-Za-z_]\w*$/.test(value);

/** The declared spelling of a parameter, matched case-insensitively. */
export const canonicalParameter = (name: string, parameters: readonly string[]): string | null =>
  parameters.find((p) => p.toLowerCase() === name.toLowerCase()) ?? null;

const squash = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

const DETERMINERS = /^(?:(?:the|a|an|some|any|valid|invalid|correct|sample|test|new|existing|required|desired|matching|expected|entered|same|your|his|her|their|its|this|that)\s+)+/i;

const stripDeterminers = (text: string): string => text.trim().replace(DETERMINERS, '').trim();

const bestUnique = (scored: readonly { readonly param: string; readonly score: number }[]): string | null => {
  if (scored.length === 0) return null;
  const top = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === top);
  return winners.length === 1 ? winners[0]!.param : null;
};

/**
 * A phrase that names a parameter by its words: "policy number", "the
 * Policy Number", "a valid policy number" → policyNumber. Every word of the
 * parameter must appear, with at most two extra words. Null on a tie.
 */
export const matchParameter = (phrase: string, parameters: readonly string[]): string | null => {
  if (parameters.length === 0) return null;
  const words = stripDeterminers(phrase);
  if (words.length === 0) return null;
  const direct = parameters.filter((p) => squash(p) === squash(words));
  if (direct.length === 1) return direct[0]!;
  const tokens = new Set(tokenize(words));
  const scored = parameters
    .map((param) => ({ param, tokens: tokenizeIdentifier(param) }))
    .filter(({ tokens: pt }) => pt.length > 0 && pt.every((t) => tokens.has(t)) && tokens.size <= pt.length + 2)
    .map(({ param, tokens: pt }) => ({ param, score: pt.length }));
  return bestUnique(scored);
};

/** Looser: the phrase carries at least half of a parameter's words ("the todo description" ↔ todoText). */
export const fuzzyParameter = (phrase: string, parameters: readonly string[]): string | null => {
  const tokens = new Set(tokenize(phrase));
  if (tokens.size === 0) return null;
  const scored = parameters
    .map((param) => {
      const pt = tokenizeIdentifier(param);
      const overlap = pt.length === 0 ? 0 : pt.filter((t) => tokens.has(t)).length / pt.length;
      return { param, score: overlap };
    })
    .filter((s) => s.score >= 0.5);
  return bestUnique(scored);
};

const DESCRIPTION_LEAD =
  /^(?:the|a|an|some|any|valid|invalid|correct|incorrect|sample|test|dummy|random|new|existing|appropriate|required|desired|matching|expected|relevant|proper|unique|another|different|same|his|her|their|your|my|our|its|this|that)\b/i;

const DESCRIPTION_NOUNS = new Set([
  'text', 'value', 'values', 'data', 'name', 'number', 'details', 'description', 'password', 'email', 'username', 'date', 'amount',
  'address', 'credentials', 'information', 'info', 'query', 'keyword', 'keywords', 'term', 'terms', 'code', 'id', 'phone', 'title',
  'comment', 'comments', 'note', 'notes', 'message', 'criteria', 'something', 'anything',
]);

/**
 * A description of a value rather than the value: starts with an article
 * or an adjective like "valid", is a generic noun ("password"), or is
 * several lower-case words ("policy number"). Digits, quotes, and capitals
 * mean a literal ("POL-001", "Alice", "John Smith").
 */
export const isDescription = (phrase: string): boolean => {
  const text = phrase.trim();
  if (text.length === 0) return true;
  if (DESCRIPTION_LEAD.test(text)) return true;
  if (/\p{N}|["@{]/u.test(text)) return false;
  const words = text.split(/\s+/);
  if (words.length === 1) return DESCRIPTION_NOUNS.has(text.toLowerCase());
  return words.every((word) => word === word.toLowerCase());
};

const dataRowKey = (literal: string, dataRow: Readonly<Record<string, string>> | undefined): string | null => {
  if (dataRow === undefined) return null;
  const keys = Object.keys(dataRow).filter((key) => dataRow[key] === literal);
  return keys.length === 1 ? keys[0]! : null;
};

const asParam = (name: string, ctx: ValueContext): ValueReading => {
  const declared = canonicalParameter(name, ctx.parameters);
  return {
    value: paramRef(declared ?? name),
    source: 'param',
    note: declared === null ? `parameter @${name} is not declared on the test case` : null,
  };
};

const literal = (text: string, ctx: ValueContext): ValueReading => {
  const key = dataRowKey(text, ctx.dataRow);
  return key !== null ? { value: paramRef(key), source: 'param', note: `"${text}" is the data row's ${key}` } : { value: text, source: 'literal', note: null };
};

/** Every "@name" in a text, in order, deduplicated. */
export const paramsIn = (text: string): readonly string[] =>
  [...new Set([...text.matchAll(PARAM_INSIDE)].map((m) => m[1]!).filter((name) => name.length > 0))];

/**
 * The value a fill/select step names. `raw` is the value part of the step
 * ("@policyNumber", "'Ohio'", "Alice", "a valid policy number").
 */
export const readValue = (raw: string, ctx: ValueContext): ValueReading => {
  const text = tidy(raw);
  if (text === null) return { value: null, source: 'none', note: null };
  const masked = maskQuotes(text);
  const quoted = wholeQuote(masked.text, masked.quotes);
  if (quoted !== null) {
    const param = PARAM_WHOLE.exec(quoted);
    return param !== null ? asParam(param[1] ?? param[2] ?? '', ctx) : literal(quoted, ctx);
  }
  // "the value 5", "the text Hello": the noun introduces a literal.
  const introduced = /^(?:the\s+)?(?:value|text|string|word|number)\s+(\S.*)$/i.exec(text);
  const body = introduced !== null && !isDescription(introduced[1] ?? '') ? (introduced[1] ?? text) : text;
  const whole = PARAM_WHOLE.exec(body);
  if (whole !== null) return asParam(whole[1] ?? whole[2] ?? '', ctx);
  const inside = paramsIn(body);
  if (inside.length === 1) return asParam(inside[0]!, ctx);
  if (inside.length > 1) {
    const first = asParam(inside[0]!, ctx);
    return { ...first, note: `the step names several parameters (${inside.map(paramRef).join(', ')}); only ${first.value} is used here` };
  }
  const byName = matchParameter(body, ctx.parameters);
  if (byName !== null) return { value: paramRef(byName), source: 'param', note: null };
  if (!isDescription(body)) return literal(body, ctx);
  const fuzzy = fuzzyParameter(body, ctx.parameters);
  if (fuzzy !== null) {
    return { value: paramRef(fuzzy), source: 'param', note: `"${body}" read as parameter @${fuzzy}` };
  }
  if (ctx.parameters.length === 1) {
    const only = ctx.parameters[0]!;
    return { value: paramRef(only), source: 'param', note: `"${body}" assumed to be the test case's only parameter @${only}` };
  }
  return { value: null, source: 'description', note: `the value is described ("${body}"), not given: supply it as test data` };
};

// ─── References in expected results ────────────────────────────────────────

export interface RefContext extends ValueContext {
  /** The value this step itself used. */
  readonly stepValue: string | null;
  /** Values earlier steps used, oldest first. */
  readonly priorValues: readonly string[];
}

const REFERRING =
  /^(?:the|this|that|its|their|it|matching|entered|searched|selected|new|newly|created|added|updated|same|corresponding|expected|correct|relevant|typed|input|given|specified|chosen|saved|resulting)\b/i;

const valueTokens = (value: string): readonly string[] =>
  isParamRef(value) ? tokenizeIdentifier(value.slice(1)) : tokenize(value);

/**
 * What a phrase in an expected result stands for: an explicit value
 * (quoted, "@param", or a code like POL-001), a parameter named by its
 * words, or, when allowPrior, the value this or an earlier step used
 * ("Matching policy", "the entered name", "the todo"). Null when it is
 * none of these.
 */
export const referent = (phrase: string, ctx: RefContext, allowPrior: boolean): string | null => {
  const text = tidy(phrase);
  if (text === null) return null;
  const masked = maskQuotes(text);
  const quoted = wholeQuote(masked.text, masked.quotes);
  if (quoted !== null) {
    const param = PARAM_WHOLE.exec(quoted);
    return param !== null ? asParam(param[1] ?? param[2] ?? '', ctx).value : literal(quoted, ctx).value;
  }
  const inside = paramsIn(text);
  if (inside.length === 1) return asParam(inside[0]!, ctx).value;
  const coded = /(?<![\p{L}\p{N}_-])[\p{L}\p{N}_-]*\p{N}[\p{L}\p{N}_-]*/u.exec(text);
  if (coded !== null && coded[0].length >= 2) return literal(coded[0], ctx).value;
  const rowKey = dataRowKey(text, ctx.dataRow);
  if (rowKey !== null) return paramRef(rowKey);
  const pool = [ctx.stepValue, ...[...ctx.priorValues].reverse()].filter((v): v is string => v !== null && v.length > 0);
  const priorLiteral = pool.find((v) => !isParamRef(v) && v.toLowerCase() === text.toLowerCase());
  if (priorLiteral !== undefined) return priorLiteral;
  const byName = matchParameter(text, ctx.parameters);
  if (byName !== null) return paramRef(byName);
  if (!allowPrior || pool.length === 0) return null;
  const tokens = new Set(tokenize(text));
  const related = pool.find((v) => valueTokens(v).some((t) => tokens.has(t)));
  if (related !== undefined) return related;
  return REFERRING.test(text) || isPureFiller(text) ? pool[0]! : null;
};

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  no: 0, zero: 0, none: 0, one: 1, single: 1, 'a single': 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12,
};

/** "3", "three", "no", "a single" → a count; null otherwise. */
export const countOf = (word: string): number | null => {
  const text = word.trim().toLowerCase();
  if (/^\d+$/.test(text)) return Number(text);
  return NUMBER_WORDS[text] ?? null;
};

export const COUNT_WORD = '\\d+|no|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a\\s+single|single';

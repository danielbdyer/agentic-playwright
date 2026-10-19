/**
 * A tiny line-oriented lexer for the TypeScript that emission writes, and for
 * the customer code that ends up inside kept regions. It knows quoted strings,
 * single-line template literals, line comments and block comments. That is
 * enough for two jobs:
 *
 * - counting brackets, so a unit (a test.step, a page-object member, a flow
 *   step) can be delimited without a TypeScript parser;
 * - building a canonical form that a formatter does not change (prettier,
 *   eslint --fix): whitespace outside strings is dropped, string literals are
 *   re-encoded independently of their quote style, semicolons and trailing
 *   commas are removed. Two files with the same canonical form are the same
 *   program for every purpose emission cares about.
 *
 * Regex literals are not recognised; a quote inside one is read as a string
 * start for the rest of that line only. Generated code never contains regex
 * literals with quotes, and unit extents are additionally bounded by
 * indentation, so a miscount cannot run away.
 */

export interface LexState {
  readonly inBlockComment: boolean;
}

export const INITIAL_LEX_STATE: LexState = { inBlockComment: false };

export interface LexedLine {
  /** Opening minus closing brackets ( [ { outside strings and comments. */
  readonly depthDelta: number;
  /** Format-insensitive form of the line (see the module comment). */
  readonly canonical: string;
  readonly state: LexState;
}

/** Encode text so no structural character survives: letters and digits stay, everything else becomes \u{hex}. */
const encode = (text: string): string =>
  [...text].map((ch) => (/[A-Za-z0-9]/.test(ch) ? ch : `\\u{${ch.codePointAt(0)!.toString(16)}}`)).join('');

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v', '0': '\0' };

/** Read a quoted string starting at `start` (the quote). Returns the decoded value and the index after the closing quote. */
export const readQuoted = (line: string, start: number): { readonly value: string; readonly end: number } => {
  const quoteChar = line[start];
  let value = '';
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === quoteChar) return { value, end: i + 1 };
    if (ch === '\\' && i + 1 < line.length) {
      const next = line[i + 1]!;
      if (next === 'u' && line[i + 2] === '{') {
        const close = line.indexOf('}', i + 3);
        const code = close === -1 ? Number.NaN : Number.parseInt(line.slice(i + 3, close), 16);
        if (!Number.isNaN(code)) {
          value += String.fromCodePoint(code);
          i = close + 1;
          continue;
        }
      }
      if (next === 'u' && /^[0-9a-fA-F]{4}$/.test(line.slice(i + 2, i + 6))) {
        value += String.fromCharCode(Number.parseInt(line.slice(i + 2, i + 6), 16));
        i += 6;
        continue;
      }
      if (next === 'x' && /^[0-9a-fA-F]{2}$/.test(line.slice(i + 2, i + 4))) {
        value += String.fromCharCode(Number.parseInt(line.slice(i + 2, i + 4), 16));
        i += 4;
        continue;
      }
      value += SIMPLE_ESCAPES[next] ?? next;
      i += 2;
      continue;
    }
    value += ch;
    i += 1;
  }
  return { value, end: line.length };
};

/** Read a template literal on one line; returns its raw body (escapes and ${} kept verbatim). */
const readTemplate = (line: string, start: number): { readonly raw: string; readonly end: number } => {
  let i = start + 1;
  while (i < line.length) {
    const ch = line[i]!;
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') return { raw: line.slice(start + 1, i), end: i + 1 };
    i += 1;
  }
  return { raw: line.slice(start + 1), end: line.length };
};

const OPENERS = '([{';
const CLOSERS = ')]}';

/** Lex one line given the state left by the previous one. */
export const lexLine = (line: string, state: LexState): LexedLine => {
  let depth = 0;
  let out = '';
  let inBlock = state.inBlockComment;
  let i = 0;
  while (i < line.length) {
    if (inBlock) {
      const close = line.indexOf('*/', i);
      const body = close === -1 ? line.slice(i) : line.slice(i, close);
      out += encode(body.replace(/\s+/g, ''));
      if (close === -1) {
        i = line.length;
      } else {
        out += '*/';
        i = close + 2;
        inBlock = false;
      }
      continue;
    }
    const ch = line[i]!;
    if (ch === '/' && line[i + 1] === '/') {
      out += `//${encode(line.slice(i + 2).replace(/\s+/g, ''))}\n`;
      break;
    }
    if (ch === '/' && line[i + 1] === '*') {
      out += '/*';
      i += 2;
      inBlock = true;
      continue;
    }
    if (ch === "'" || ch === '"') {
      const { value, end } = readQuoted(line, i);
      out += `"${encode(value)}"`;
      i = end;
      continue;
    }
    if (ch === '`') {
      const { raw, end } = readTemplate(line, i);
      out += `\`${encode(raw)}\``;
      i = end;
      continue;
    }
    if (/\s/.test(ch) || ch === ';') {
      i += 1;
      continue;
    }
    if (OPENERS.includes(ch)) depth += 1;
    else if (CLOSERS.includes(ch)) depth -= 1;
    out += ch;
    i += 1;
  }
  return { depthDelta: depth, canonical: out, state: { inBlockComment: inBlock } };
};

/** Canonical form of consecutive lines (block-comment state carried across them). */
export const canonicalLines = (lines: readonly string[]): string =>
  lines.reduce<{ readonly out: string; readonly state: LexState }>(
    (acc, line) => {
      const lexed = lexLine(line, acc.state);
      return { out: acc.out + lexed.canonical, state: lexed.state };
    },
    { out: '', state: INITIAL_LEX_STATE },
  ).out;

/** Final pass over joined canonical text: trailing commas before a closer are formatting, not code. */
export const finishCanonical = (joined: string): string => joined.replace(/,(?=[)\]}])/g, '');

/** Canonical form of a whole text. */
export const canonicalText = (text: string): string => finishCanonical(canonicalLines(text.split('\n')));

/** Leading whitespace width (tabs count as two spaces). */
export const indentOf = (line: string): number => {
  const match = /^[ \t]*/.exec(line);
  return [...(match?.[0] ?? '')].reduce((width, ch) => width + (ch === '\t' ? 2 : 1), 0);
};

export const isBlank = (line: string): boolean => line.trim().length === 0;

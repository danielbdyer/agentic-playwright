/**
 * The browser's own accessibility view of the scope: Playwright's
 * `locator.ariaSnapshot()` text, PII-gated line by line and capped on a
 * line boundary, plus a parser for that text so the walker's computed
 * names can be checked against the browser's.
 *
 * The parser replaces workshop/substrate-study/domain/aria-snapshot.ts,
 * whose entry regex silently dropped every line Playwright single-quotes
 * (any name containing ": ", " #", braces or a backtick), never un-doubled
 * '' inside such keys, and turned JSON escapes like \n into bare letters.
 */
import type { Locator, Page } from '@playwright/test';
import { normalizeText } from '../core/text.js';
import { redact, type PiiMode } from '../core/pii.js';
import type { Candidate, LandmarkRole } from '../contract/schemas.js';

/** Where observation looks: the whole page, one landmark role, or one OutSystems block. */
export type ObserveScope =
  | { readonly kind: 'page' }
  | { readonly kind: 'landmark'; readonly role: LandmarkRole; readonly name?: string }
  | { readonly kind: 'block'; readonly name: string };

export interface AriaCapture {
  readonly text: string;
  readonly truncated: boolean;
  /** UTF-8 size of `text`. */
  readonly bytes: number;
}

const MAX_SCOPE_MATCHES = 5;

/** Roles whose inline text in the snapshot is the control's current value, i.e. data someone typed. */
const VALUE_ROLES = new Set(['textbox', 'searchbox', 'combobox', 'spinbutton', 'slider']);

// ─── Line structure ────────────────────────────────────────────────────────

interface AriaLine {
  readonly indent: string;
  /** The key exactly as written (possibly single-quoted). */
  readonly rawKey: string;
  /** The key unquoted: `role "name" [attr]`. */
  readonly key: string;
  /** What follows the key: "", ":" or ": <text>". */
  readonly after: string;
}

/** Unquote a single-quoted YAML key: strip the quotes, '' → '. Returns the key and its raw length. */
const unquoteSingle = (rest: string): { readonly key: string; readonly length: number } | null => {
  let key = '';
  for (let i = 1; i < rest.length; i += 1) {
    const ch = rest[i];
    if (ch === "'") {
      if (rest[i + 1] === "'") {
        key += "'";
        i += 1;
        continue;
      }
      return { key, length: i + 1 };
    }
    key += ch;
  }
  return null;
};

/** JSON-style double-quoted string at the start of `text`; returns its value and raw length, or null. */
const readJsonString = (text: string): { readonly value: string; readonly length: number } | null => {
  if (!text.startsWith('"')) return null;
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '"') {
      const literal = text.slice(0, i + 1);
      try {
        // YAML's \xNN is not JSON; rewrite it to \u00NN before parsing.
        return { value: JSON.parse(literal.replace(/\\x([0-9a-fA-F]{2})/g, '\\u00$1')) as string, length: i + 1 };
      } catch {
        return { value: literal.slice(1, -1).replace(/\\(.)/g, '$1'), length: i + 1 };
      }
    }
  }
  return null;
};

const readRegex = (text: string): { readonly value: string; readonly length: number } | null => {
  if (!text.startsWith('/')) return null;
  for (let i = 1; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '/') return { value: text.slice(1, i), length: i + 1 };
  }
  return null;
};

/**
 * Split one snapshot line into indent, key and what follows. An unquoted
 * key is `role`, an optional quoted (or /regex/) name, then `[attr]`
 * groups; Playwright quotes the whole key whenever the name holds a
 * character that would make that ambiguous.
 */
const splitLine = (line: string): AriaLine | null => {
  const match = /^(\s*)- (.*)$/.exec(line);
  if (match === null) return null;
  const indent = match[1] ?? '';
  const rest = match[2] ?? '';
  if (rest.startsWith("'")) {
    const quoted = unquoteSingle(rest);
    if (quoted === null) return null;
    return { indent, rawKey: rest.slice(0, quoted.length), key: quoted.key, after: rest.slice(quoted.length) };
  }
  const role = /^[a-z][a-z-]*/.exec(rest)?.[0];
  if (role === undefined) return null;
  let consumed = role.length;
  const tail = rest.slice(consumed);
  const name = tail.startsWith(' "') ? readJsonString(tail.slice(1)) : tail.startsWith(' /') ? readRegex(tail.slice(1)) : null;
  if (name !== null) consumed += 1 + name.length;
  consumed += /^(?:\s*\[[^\]]*\])*/.exec(rest.slice(consumed))?.[0].length ?? 0;
  const rawKey = rest.slice(0, consumed);
  return { indent, rawKey, key: rawKey, after: rest.slice(consumed) };
};

const roleOfKey = (key: string): string | null => /^([a-z][a-z-]*)/.exec(key)?.[1] ?? null;

// ─── Capture ───────────────────────────────────────────────────────────────

const scopeLocator = (page: Page, scope: ObserveScope): Locator => {
  switch (scope.kind) {
    case 'page':
      return page.locator('body');
    case 'landmark':
      return scope.name !== undefined ? page.getByRole(scope.role, { name: scope.name, exact: true }) : page.getByRole(scope.role);
    case 'block':
      return page.locator(`[data-block=${JSON.stringify(scope.name)}]`);
    default: {
      const never: never = scope;
      return never;
    }
  }
};

/**
 * PII-gate snapshot text line by line, so a match never spans two entries.
 * Outside "off" mode the current value of text fields is masked as
 * "<value>": what a user typed is data, not a label.
 */
export const redactAriaText = (text: string, pii: PiiMode): string => {
  if (pii === 'off') return text;
  return text
    .split('\n')
    .map((line) => {
      const parts = splitLine(line);
      const role = parts === null ? null : roleOfKey(parts.key);
      const masked =
        parts !== null && role !== null && VALUE_ROLES.has(role) && parts.after.startsWith(': ')
          ? `${parts.indent}- ${parts.rawKey}: <value>`
          : line;
      return redact(masked, pii);
    })
    .join('\n');
};

const utf8Bytes = (text: string): number => Buffer.byteLength(text, 'utf8');

/**
 * Cap at `maxBytes` (marker included), cutting on a line boundary and
 * appending a comment line that says how much was dropped. The marker is a
 * YAML comment, so the result still parses as an ARIA snapshot.
 */
export const capAriaText = (text: string, maxBytes: number): AriaCapture => {
  const total = utf8Bytes(text);
  if (total <= maxBytes) return { text, truncated: false, bytes: total };
  const lines = text.split('\n');
  const marker = (dropped: number): string => `# truncated: ${dropped} more lines (cap ${maxBytes} bytes)`;
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const cost = utf8Bytes(line) + 1;
    if (used + cost + utf8Bytes(marker(lines.length - kept.length)) > maxBytes) break;
    kept.push(line);
    used += cost;
  }
  const capped = [...kept, marker(lines.length - kept.length)].join('\n');
  // A cap smaller than the marker itself still returns the marker: the reader must learn it was cut.
  return { text: capped, truncated: true, bytes: utf8Bytes(capped) };
};

export interface CaptureAriaOptions {
  readonly maxBytes: number;
  readonly pii: PiiMode;
  readonly timeoutMs?: number;
}

/**
 * ARIA snapshot of the scope. Several containers can match a landmark role
 * or a block name (two navigation landmarks, a block used twice); each is
 * captured, up to five, and joined. Never throws: a scope that vanished
 * yields an empty capture.
 */
export const captureAria = async (page: Page, scope: ObserveScope, options: CaptureAriaOptions): Promise<AriaCapture> => {
  const locator = scopeLocator(page, scope);
  const count = await locator.count().catch(() => 0);
  const parts: string[] = [];
  for (let i = 0; i < Math.min(count, MAX_SCOPE_MATCHES); i += 1) {
    const text = await locator.nth(i).ariaSnapshot({ timeout: options.timeoutMs ?? 5_000 }).catch(() => '');
    if (text.length > 0) parts.push(text);
  }
  return capAriaText(redactAriaText(parts.join('\n'), options.pii), options.maxBytes);
};

// ─── Parsing ───────────────────────────────────────────────────────────────

export interface AriaEntry {
  readonly role: string;
  readonly name: string | null;
  /** True when Playwright rendered the name as a /regex/ (snapshot templates). */
  readonly nameIsRegex: boolean;
  /** Indentation depth (two spaces per level). */
  readonly depth: number;
  readonly attributes: Readonly<Record<string, string | true>>;
  /** Inline text after "key: ", when the node has a single text child or a value. */
  readonly text?: string;
}

const parseAttributes = (text: string): Record<string, string | true> => {
  const attributes: Record<string, string | true> = {};
  for (const match of text.matchAll(/\[([a-z-]+)(?:=([^\]]*))?\]/g)) {
    const name = match[1];
    if (name !== undefined) attributes[name] = match[2] ?? true;
  }
  return attributes;
};

const parseScalar = (value: string): string => {
  const trimmed = value.trim();
  const json = readJsonString(trimmed);
  return json !== null && json.length === trimmed.length ? json.value : trimmed;
};

/**
 * Parse Playwright ARIA snapshot text into flat entries. Text lines
 * (`- text: …`), property lines (`- /url: …`) and comments are skipped.
 */
export const parseAriaSnapshot = (snapshot: string): readonly AriaEntry[] =>
  snapshot.split('\n').flatMap((line): AriaEntry[] => {
    const parts = splitLine(line);
    if (parts === null) return [];
    const role = roleOfKey(parts.key);
    if (role === null || role === 'text') return [];
    let remainder = parts.key.slice(role.length);
    let name: string | null = null;
    let nameIsRegex = false;
    if (remainder.startsWith(' "')) {
      const parsed = readJsonString(remainder.slice(1));
      if (parsed !== null) {
        name = parsed.value;
        remainder = remainder.slice(1 + parsed.length);
      }
    } else if (remainder.startsWith(' /')) {
      const parsed = readRegex(remainder.slice(1));
      if (parsed !== null) {
        name = parsed.value;
        nameIsRegex = true;
        remainder = remainder.slice(1 + parsed.length);
      }
    }
    const text = parts.after.startsWith(': ') ? parseScalar(parts.after.slice(2)) : undefined;
    return [{
      role,
      name,
      nameIsRegex,
      depth: Math.floor(parts.indent.length / 2),
      attributes: parseAttributes(remainder),
      ...(text !== undefined && text.length > 0 ? { text } : {}),
    }];
  });

export interface NameAgreement {
  /** Named, role-bearing, visible interactive candidates compared (hidden ones are absent from the tree). */
  readonly compared: number;
  /** Of those, how many the browser's tree names identically under the same role. */
  readonly agreed: number;
  /** Refs whose walker name the browser's tree does not contain. */
  readonly disagreements: readonly string[];
}

/**
 * Walker-vs-browser name agreement over visible interactive candidates
 * with a real role and a name. Both sides are PII-gated with the same
 * rules, so a redacted name still compares equal to its redacted
 * counterpart.
 */
export const nameAgreement = (entries: readonly AriaEntry[], candidates: readonly Candidate[]): NameAgreement => {
  const browser = new Set(
    entries.filter((e) => e.name !== null && !e.nameIsRegex).map((e) => `${e.role}\u0000${normalizeText(e.name ?? '')}`),
  );
  const compared = candidates.filter((c) => c.interactive && c.visible && c.role !== 'generic' && c.name.length > 0);
  const disagreements = compared.filter((c) => !browser.has(`${c.role}\u0000${normalizeText(c.name)}`)).map((c) => c.ref);
  return { compared: compared.length, agreed: compared.length - disagreements.length, disagreements };
};

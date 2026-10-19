/**
 * Template-based code writing. Emission builds files as arrays of lines and
 * renders every piece of customer-supplied text through one of the escapers
 * below, so ADO wording (smart quotes, dashes, non-Latin scripts) appears
 * verbatim in the output and can never break out of a string or a comment.
 *
 * Output conventions: two-space indent, single quotes, semicolons, LF.
 */
import { quote } from '../core/text.js';

export { quote };

/** A JS template literal body with `\`, backticks, `${` and line terminators escaped. */
export const templateText = (text: string): string =>
  text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');

/** Text that is safe on a `//` line: line terminators become spaces. */
export const commentText = (text: string): string => text.replace(/\r\n|[\r\n\u2028\u2029]/g, ' ').replace(/\s+$/u, '');

/** Text that is safe inside a `/** … *\/` comment: also defuses a premature `*\/`. */
export const docText = (text: string): string => commentText(text).replace(/\*\//g, '*\\/');

/** `// text` (no indentation). */
export const lineComment = (text: string): string => `// ${commentText(text)}`;

/** Indent every non-empty line by `levels` × two spaces. */
export const indent = (levels: number, lines: readonly string[]): readonly string[] =>
  lines.map((line) => (line.length === 0 ? line : `${'  '.repeat(levels)}${line}`));

/** Join groups of lines with one blank line between non-empty groups. */
export const separated = (groups: readonly (readonly string[])[]): readonly string[] =>
  groups
    .filter((group) => group.length > 0)
    .flatMap((group, index) => (index === 0 ? [...group] : ['', ...group]));

/** Render lines as a file: LF line endings and exactly one trailing newline. */
export const toFileText = (lines: readonly string[]): string => `${lines.join('\n').replace(/\n+$/, '')}\n`;

/** A regex literal matching `text` literally, or `new RegExp('…')` when a literal would be awkward to read or lex. */
export const literalRegex = (text: string): string => {
  const escaped = text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return /['"`\r\n\u2028\u2029]/.test(text) || escaped.length === 0 ? `new RegExp(${quote(escaped)})` : `/${escaped.replace(/\//g, '\\/')}/`;
};

/** Normalize line endings to LF and drop a byte-order mark. */
export const normalizeNewlines = (text: string): string => text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');

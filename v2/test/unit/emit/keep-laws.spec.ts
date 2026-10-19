/**
 * Laws of keep-preserving regeneration, over random edits: insert keep
 * regions and shorthand markers at arbitrary line boundaries of an emitted
 * spec, page object or flow, then regenerate from newer inputs.
 *   1. Only kept lines were added, so it is never a hand edit.
 *   2. Every kept line survives (in place, or commented in an orphan block).
 *   3. No generated line is lost: every line of the new generation is present.
 *   4. Merging again with the same generation changes nothing.
 * Every third case also runs a formatter-like rewrite (double quotes in code,
 * wider indentation; comments untouched, as prettier leaves them) over the
 * edited file first.
 */
import { describe, expect, it } from 'vitest';
import type { ResolvedStep, TestCase } from '../../../src/contract/schemas.js';
import { mergeTexts, renderFlow, renderPageObject, renderSpec } from '../../../src/emit/index.js';
import { facet, loginCatalog, loginRecording, policySearchCatalog, policySearchFacets, steps10001, testCase10001 } from './fixtures.js';

const rev2: TestCase = {
  ...testCase10001,
  revision: 2,
  steps: testCase10001.steps.map((s) => (s.index === 3 ? { ...s, action: 'Click the Search button', expected: 'The search runs' } : s)),
};
const rev2Steps: readonly ResolvedStep[] = steps10001.map((s) => (s.index === 3 ? { ...s, actionText: 'Click the Search button' } : s));
const multi: TestCase = { ...testCase10001, dataRows: [{ policyNumber: 'POL-001' }, { policyNumber: 'POL-002' }] };
const added = facet({ id: 'policy-search:clear-button', role: 'button', locators: [{ strategy: 'role-name', role: 'button', name: 'Clear' }] });
const loginById = new Map(loginCatalog.facets.map((f) => [f.id, f]));

const corpus: readonly { readonly name: string; readonly before: string; readonly after: string }[] = [
  {
    name: 'spec',
    before: renderSpec({ testCase: testCase10001, steps: steps10001, catalogs: [policySearchCatalog] }).text,
    after: renderSpec({ testCase: rev2, steps: rev2Steps, catalogs: [policySearchCatalog] }).text,
  },
  {
    name: 'multi-row spec with a flow',
    before: renderSpec({ testCase: multi, steps: steps10001, catalogs: [policySearchCatalog], flows: [{ recording: loginRecording }] }).text,
    after: renderSpec({ testCase: { ...multi, ...rev2, dataRows: multi.dataRows }, steps: rev2Steps, catalogs: [policySearchCatalog], flows: [{ recording: loginRecording }] }).text,
  },
  {
    name: 'page object',
    before: renderPageObject('policy-search', policySearchCatalog.route, policySearchFacets, null).text,
    after: renderPageObject('policy-search', policySearchCatalog.route, [...policySearchFacets, added], null).text,
  },
  {
    name: 'flow',
    before: renderFlow(loginRecording, loginById, { login: loginCatalog.route }).text,
    after: renderFlow(loginRecording, loginById, { login: loginCatalog.route }).text,
  },
];

const random = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const linesOf = (text: string): readonly string[] => text.replace(/\n$/, '').split('\n');

describe('keep laws (random edits)', () => {
  for (const file of corpus) {
    it(`${file.name}: kept lines survive, nothing generated is lost, no false hand edit, idempotent`, () => {
      const original = linesOf(file.before);
      for (let seed = 1; seed <= 120; seed += 1) {
        const next = random(seed * 7919);
        const count = 1 + Math.floor(next() * 3);
        // Insertion points after the hash line, distinct, applied bottom-up so indexes stay valid.
        const points = [...new Set(Array.from({ length: count }, () => 3 + Math.floor(next() * (original.length - 2))))].sort((a, b) => b - a);
        const kept: string[] = [];
        const edited = points.reduce<readonly string[]>((lines, point, j) => {
          const indentWidth = /^ */.exec(lines[point] ?? lines[point - 1] ?? '')![0].length;
          const pad = ' '.repeat(indentWidth);
          if (next() < 0.25) return [...lines.slice(0, point), `${pad}// tesseract:keep`, ...lines.slice(point)];
          const note = `${pad}// kept note ${seed}-${j}`;
          const code = `${pad}await Promise.resolve(${seed * 10 + j});`;
          kept.push(note.trim(), code.trim());
          return [...lines.slice(0, point), `${pad}// tesseract:keep-start`, note, code, `${pad}// tesseract:keep-end`, ...lines.slice(point)];
        }, original);
        const formatted = seed % 3 === 0;
        const editedText = formatted
          ? `${edited
              .map((line) => (/^\s*(\/\/|\/\*|\*)/.test(line) ? line : line.replace(/'([^'"\\]*)'/g, '"$1"')))
              .map((line) => line.replace(/^( +)/, (spaces) => spaces + spaces))
              .join('\n')}\n`
          : `${edited.join('\n')}\n`;
        const context = `${file.name} seed ${seed}${formatted ? ' (formatted)' : ''} at ${points.join(',')}`;

        const merged = mergeTexts(file.after, editedText);
        expect(merged.handEdited, context).toBe(false);
        const mergedLines = linesOf(merged.text);
        // A kept line is present as written, or (orphaned) as a commented copy.
        const trimmed = new Set(mergedLines.flatMap((line) => [line.trim(), line.replace(/^\/\/ ?/, '').trim()]));
        for (const line of kept) expect(trimmed.has(line), `${context}: kept "${line}"`).toBe(true);
        // Generated lines are present; a kept unit written by the formatter keeps the formatter's quotes and indentation.
        const normal = (line: string): string => line.trim().replace(/"/g, "'");
        const present = new Set(mergedLines.map(normal));
        for (const line of linesOf(file.after)) {
          if (line.startsWith('// tesseract:generated')) continue;
          expect(present.has(normal(line)), `${context}: generated "${line}"`).toBe(true);
        }
        expect(mergeTexts(file.after, merged.text).text, context).toBe(merged.text);
      }
    });
  }
});

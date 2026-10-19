import { describe, expect, it } from 'vitest';
import { unifiedDiff } from '../../../src/emit/index.js';

/** Apply a unified diff produced by unifiedDiff (no fuzz): the inverse used by the laws below. */
const apply = (before: string, diff: string): string => {
  const old = before === '' ? [] : before.replace(/\n$/, '').split('\n');
  const out: string[] = [];
  let at = 0;
  for (const line of diff.split('\n').slice(2, -1)) {
    const header = /^@@ -(\d+),(\d+) \+\d+,\d+ @@$/.exec(line);
    if (header !== null) {
      const start = Number(header[2]) === 0 ? Number(header[1]) : Number(header[1]) - 1;
      out.push(...old.slice(at, start));
      at = start;
    } else if (line.startsWith('-')) at += 1;
    else if (line.startsWith('+')) out.push(line.slice(1));
    else if (line.startsWith(' ')) {
      out.push(old[at]!);
      at += 1;
    }
  }
  out.push(...old.slice(at));
  return out.length === 0 ? '' : `${out.join('\n')}\n`;
};

const lines = (n: number, change?: (i: number) => string | null): string =>
  `${Array.from({ length: n }, (_, i) => (change === undefined ? `line ${i + 1}` : change(i + 1)))
    .filter((line): line is string => line !== null)
    .join('\n')}\n`;

describe('unifiedDiff', () => {
  it('is empty for equal texts, including CRLF vs LF', () => {
    expect(unifiedDiff('a\nb\n', 'a\nb\n', 'x.ts')).toBe('');
    expect(unifiedDiff('a\r\nb\r\n', 'a\nb\n', 'x.ts')).toBe('');
  });

  it('shows a new file against /dev/null', () => {
    expect(unifiedDiff(null, 'a\nb\n', 'pages/x.page.ts')).toBe('--- /dev/null\n+++ b/pages/x.page.ts\n@@ -0,0 +1,2 @@\n+a\n+b\n');
  });

  it('shows one change with three lines of context', () => {
    const before = lines(10);
    const after = lines(10, (i) => (i === 5 ? 'line five' : `line ${i}`));
    expect(unifiedDiff(before, after, 'f.ts')).toBe(
      ['--- a/f.ts', '+++ b/f.ts', '@@ -2,7 +2,7 @@', ' line 2', ' line 3', ' line 4', '-line 5', '+line five', ' line 6', ' line 7', ' line 8', ''].join('\n'),
    );
  });

  it('splits distant changes into hunks and merges close ones', () => {
    const before = lines(30);
    const after = lines(30, (i) => (i === 3 ? 'three' : i === 25 ? null : `line ${i}`));
    const diff = unifiedDiff(before, after, 'f.ts');
    expect(diff.match(/^@@/gm)).toHaveLength(2);
    expect(diff).toContain('@@ -1,6 +1,6 @@');
    expect(diff).toContain('@@ -22,7 +22,6 @@');
    const close = unifiedDiff(before, lines(30, (i) => (i === 3 || i === 8 ? `L${i}` : `line ${i}`)), 'f.ts');
    expect(close.match(/^@@/gm)).toHaveLength(1);
  });

  it('marks a missing final newline', () => {
    expect(unifiedDiff('a\nb', 'a\nb\n', 'f.ts')).toBe('--- a/f.ts\n+++ b/f.ts\n@@ -1,2 +1,2 @@\n a\n-b\n\\ No newline at end of file\n+b\n');
  });

  it('stays small for a small change in a large file', () => {
    const before = lines(3000);
    const after = before.replace('line 1500\n', 'line 1500\nadded\n').replace('line 2\n', 'line two\n');
    const diff = unifiedDiff(before, after, 'big.ts');
    expect(diff.split('\n').length).toBeLessThan(30);
    expect(apply(before, diff)).toBe(after);
  });

  it('applies (law): replaying the hunks on the old text yields the new text, for random edits', () => {
    const random = (seed: number): (() => number) => {
      let state = seed;
      return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
      };
    };
    for (let seed = 1; seed <= 200; seed += 1) {
      const next = random(seed);
      const count = Math.floor(next() * 40);
      const before = Array.from({ length: count }, () => `l${Math.floor(next() * 6)}`);
      const after = before.flatMap((line) => {
        const roll = next();
        return roll < 0.15 ? [] : roll < 0.3 ? [`x${Math.floor(next() * 4)}`] : roll < 0.4 ? [line, `n${Math.floor(next() * 3)}`] : [line];
      });
      const a = before.length === 0 ? '' : `${before.join('\n')}\n`;
      const b = after.length === 0 ? '' : `${after.join('\n')}\n`;
      const diff = unifiedDiff(a, b, 'r.ts');
      expect(diff === '').toBe(a === b);
      if (diff !== '') expect(apply(a, diff)).toBe(b);
    }
  });

  it('applies: replaying the hunks on the old text yields the new text', () => {
    const before = lines(40);
    const after = lines(40, (i) => (i % 7 === 0 ? `changed ${i}` : i % 11 === 0 ? null : `line ${i}`)).replace('line 20\n', 'line 20\ninserted\n');
    expect(apply(before, unifiedDiff(before, after, 'f.ts'))).toBe(after);
  });
});

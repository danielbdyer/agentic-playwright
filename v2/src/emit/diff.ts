/**
 * A small unified diff (Myers over lines, three lines of context), enough for a
 * reviewer or an agent to read what regeneration changes. No dependency.
 */
import { normalizeNewlines } from './writer.js';

interface Op {
  readonly type: ' ' | '-' | '+';
  readonly line: string;
  /** 0-based line index in the old text (for ' ' and '-'). */
  readonly a: number;
  /** 0-based line index in the new text (for ' ' and '+'). */
  readonly b: number;
}

const splitForDiff = (text: string): { readonly lines: readonly string[]; readonly finalNewline: boolean } => {
  const normalized = normalizeNewlines(text);
  if (normalized.length === 0) return { lines: [], finalNewline: true };
  const finalNewline = normalized.endsWith('\n');
  const lines = (finalNewline ? normalized.slice(0, -1) : normalized).split('\n');
  return { lines, finalNewline };
};

/** A shortest edit script from a to b (Myers), with a cap on edits past which the middle is replaced whole. */
const diffOps = (a: readonly string[], b: readonly string[]): readonly Op[] => {
  const prefix = (() => {
    const limit = Math.min(a.length, b.length);
    const mismatch = Array.from({ length: limit }, (_, i) => i).find((i) => a[i] !== b[i]);
    return mismatch ?? limit;
  })();
  const suffix = (() => {
    const limit = Math.min(a.length, b.length) - prefix;
    const mismatch = Array.from({ length: limit }, (_, i) => i).find((i) => a[a.length - 1 - i] !== b[b.length - 1 - i]);
    return mismatch ?? limit;
  })();
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);
  const head: readonly Op[] = a.slice(0, prefix).map((line, i) => ({ type: ' ', line, a: i, b: i }));
  const tail: readonly Op[] = a
    .slice(a.length - suffix)
    .map((line, i) => ({ type: ' ', line, a: a.length - suffix + i, b: b.length - suffix + i }));

  const n = midA.length;
  const m = midB.length;
  const replaceWhole = (): readonly Op[] => [
    ...midA.map((line, i): Op => ({ type: '-', line, a: prefix + i, b: prefix })),
    ...midB.map((line, j): Op => ({ type: '+', line, a: prefix + n, b: prefix + j })),
  ];
  if (n === 0 || m === 0) return [...head, ...replaceWhole(), ...tail];

  // Myers' O((N+M)·D) shortest edit script. trace[d][k + d] = furthest x on diagonal k after d edits.
  const maxEdits = Math.min(n + m, 2000);
  const trace: Int32Array[] = [];
  const at = (v: Int32Array, d: number, k: number): number => v[k + d] ?? -1;
  let found = -1;
  for (let d = 0; d <= maxEdits && found === -1; d += 1) {
    const v = new Int32Array(2 * d + 1);
    const prev = trace[d - 1];
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (prev === undefined) x = 0;
      else if (k === -d || (k !== d && at(prev, d - 1, k - 1) < at(prev, d - 1, k + 1))) x = at(prev, d - 1, k + 1);
      else x = at(prev, d - 1, k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && midA[x] === midB[y]) {
        x += 1;
        y += 1;
      }
      v[k + d] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
    trace.push(v);
  }
  if (found === -1) return [...head, ...replaceWhole(), ...tail];

  const reversed: Op[] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d -= 1) {
    const prev = trace[d - 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(prev, d - 1, k - 1) < at(prev, d - 1, k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prev, d - 1, prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      reversed.push({ type: ' ', line: midA[x - 1]!, a: prefix + x - 1, b: prefix + y - 1 });
      x -= 1;
      y -= 1;
    }
    if (down) {
      reversed.push({ type: '+', line: midB[y - 1]!, a: prefix + x, b: prefix + y - 1 });
      y -= 1;
    } else {
      reversed.push({ type: '-', line: midA[x - 1]!, a: prefix + x - 1, b: prefix + y });
      x -= 1;
    }
  }
  while (x > 0 && y > 0) {
    reversed.push({ type: ' ', line: midA[x - 1]!, a: prefix + x - 1, b: prefix + y - 1 });
    x -= 1;
    y -= 1;
  }
  const middle = reversed.reverse();
  return [...head, ...middle, ...tail];
};

/**
 * Unified diff from `before` (null for a new file) to `after`, labelled with
 * `fileName` (a/… and b/…). Empty string when the texts are equal.
 */
export const unifiedDiff = (before: string | null, after: string, fileName: string, context = 3): string => {
  const oldText = splitForDiff(before ?? '');
  const newText = splitForDiff(after);
  if (before !== null && oldText.finalNewline === newText.finalNewline && oldText.lines.length === newText.lines.length && oldText.lines.every((line, i) => line === newText.lines[i])) {
    return '';
  }
  const ops = diffOps(oldText.lines, newText.lines);
  const changed = ops.flatMap((op, index) => (op.type === ' ' ? [] : [index]));
  const finalNewlineChanged = before !== null && oldText.finalNewline !== newText.finalNewline;
  const lastIndex = ops.length - 1;
  const changeIndexes = changed.length === 0 && finalNewlineChanged && lastIndex >= 0 ? [lastIndex] : changed;
  if (changeIndexes.length === 0) return '';

  // Group changes whose context windows touch.
  const groups = changeIndexes.reduce<readonly (readonly [number, number])[]>((acc, index) => {
    const last = acc[acc.length - 1];
    if (last !== undefined && index - last[1] <= context * 2) return [...acc.slice(0, -1), [last[0], index] as const];
    return [...acc, [index, index] as const];
  }, []);

  const noNewline = '\\ No newline at end of file';
  const hunkText = ([first, last]: readonly [number, number]): readonly string[] => {
    const start = Math.max(0, first - context);
    const end = Math.min(ops.length - 1, last + context);
    const slice = ops.slice(start, end + 1);
    const aLines = slice.filter((op) => op.type !== '+');
    const bLines = slice.filter((op) => op.type !== '-');
    const aStart = aLines.length > 0 ? aLines[0]!.a + 1 : (slice[0]?.a ?? 0);
    const bStart = bLines.length > 0 ? bLines[0]!.b + 1 : (slice[0]?.b ?? 0);
    const body = slice.flatMap((op) => {
      const line = `${op.type}${op.line}`;
      const lastOld = op.type !== '+' && op.a === oldText.lines.length - 1 && !oldText.finalNewline && before !== null;
      const lastNew = op.type !== '-' && op.b === newText.lines.length - 1 && !newText.finalNewline;
      if (op.type === ' ' && lastOld !== lastNew) {
        // Same line, different final newline: show it as a change.
        return [`-${op.line}`, ...(lastOld ? [noNewline] : []), `+${op.line}`, ...(lastNew ? [noNewline] : [])];
      }
      return [line, ...(lastOld || lastNew ? [noNewline] : [])];
    });
    const aCount = body.filter((line) => line.startsWith('-') || line.startsWith(' ')).length;
    const bCount = body.filter((line) => line.startsWith('+') || line.startsWith(' ')).length;
    return [`@@ -${aStart},${aCount} +${bStart},${bCount} @@`, ...body];
  };

  const header = before === null ? ['--- /dev/null', `+++ b/${fileName}`] : [`--- a/${fileName}`, `+++ b/${fileName}`];
  return `${[...header, ...groups.flatMap(hunkText)].join('\n')}\n`;
};

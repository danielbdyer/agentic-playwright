/**
 * Regeneration that never discards a human's work.
 *
 * A generated file is a sequence of frame lines and units. Units are the
 * pieces a human can take ownership of:
 *   - spec: each top-level `await test.step(…)` block, keyed `step-<ADO stepIdentifier>`
 *     (mapped through the `ado-steps` annotation);
 *   - page object: each member, keyed by the facet id in its `/** facet <id>` doc
 *     comment (`route` for goto(), `select <id>` for a select helper);
 *   - flow: each `// step <n> — <action> <target>` comment plus its statement, keyed
 *     `step <action> <target>` (a repeat of the same action on the same target gets
 *     ` #2`, ` #3`, …), so re-recording a flow with steps inserted or removed does
 *     not move kept code onto another action; a comment without a description
 *     falls back to `step-<n>`.
 *
 * Keep grammar (line-based):
 *   // tesseract:keep-start [label]
 *   …
 *   // tesseract:keep-end
 * and the shorthand `// tesseract:keep` directly above a unit.
 *
 * Rules on regeneration:
 *   - A unit containing a keep region, or marked with the shorthand, is kept:
 *     its body is preserved as written. For a test.step the opener and the
 *     `// Expected:` line still come from ADO, so step titles track the case;
 *     page-object members and flow steps are preserved whole.
 *   - A keep region that wraps whole units replaces them where they are
 *     generated now, byte for byte.
 *   - Any other keep region is anchored to the generated line above it and
 *     re-inserted after that line. When the unit it followed is gone, it
 *     follows the closest earlier surviving unit at the bracket depth it had
 *     (never past the test's or class's closing bracket); after a flow step
 *     whose action or target changed, it is orphaned instead.
 *   - Kept code whose unit no longer exists is never dropped: it is appended,
 *     commented out, under `// tesseract:orphaned <key>` inside a keep region.
 *
 * Hand-edit detection: line `// tesseract:generated sha256:<12 hex>` holds a
 * hash of the file with keep regions removed, kept units reduced to their
 * generator-owned lines, and the hash line itself removed, computed over a
 * format-insensitive canonical form (see lex.ts). A mismatch means an edit
 * outside keep regions, unless it is explained by a unit that was marked kept
 * since the last write (verified by restoring that unit to its likely prior
 * forms: as generated now, as written without markers, as written without its
 * keep regions, or its written opener with today's generated body).
 */
import { ToolError } from '../core/errors.js';
import { sha256Hex } from '../core/hash.js';
import { canonicalLines, finishCanonical, indentOf, isBlank, lexLine, INITIAL_LEX_STATE, readQuoted, type LexState } from './lex.js';
import { normalizeNewlines, toFileText } from './writer.js';

// ─── Grammar ────────────────────────────────────────────────────────────────

const HASH_LINE = /^\/\/ tesseract:generated sha256:([0-9a-f]{12})\s*$/;
const KEEP_START = /^\s*\/\/\s*tesseract:keep-start\b(.*)$/;
const KEEP_END = /^\s*\/\/\s*tesseract:keep-end\b/;
const KEEP_SHORTHAND = /^\s*\/\/\s*tesseract:keep\s*$/;
const STEP_OPENER = /^\s*await\s+test\.step\s*\(/;
const FLOW_STEP = /^\s*\/\/\s*step\s+(\d+)\b(?:\s*[\u2014\u2013-]\s*(.*))?/;
const DOC_OPENER = /^\s*\/\*\*/;
const DOC_SUBJECT = /^(facet|route|select)\s+(\S+)/;
const EXPECTED_LINE = /^\s*\/\/\s*Expected:/;
const ORPHAN_PREFIX = 'orphaned ';

export const hashLine = (hash: string): string => `// tesseract:generated sha256:${hash}`;
/** Renderers emit this line; stampHash / mergeWithExisting replace it with the real hash. */
export const HASH_PLACEHOLDER = hashLine('000000000000');

const isKeepMarker = (line: string): boolean => KEEP_START.test(line) || KEEP_END.test(line) || KEEP_SHORTHAND.test(line);

// ─── Parsed form ────────────────────────────────────────────────────────────

type UnitFamily = 'step' | 'member' | 'flow-step';

interface Unit {
  readonly family: UnitFamily;
  readonly key: string;
  readonly lines: readonly string[];
  /** Leading lines the generator still owns when the unit is kept (test.step opener + Expected comment). */
  readonly head: number;
  readonly kept: boolean;
  readonly shorthand: string | null;
  readonly title: string | null;
}

interface Region {
  readonly label: string | null;
  /** All lines, markers included. */
  readonly lines: readonly string[];
  /** Units found inside the region (keys assigned), i.e. generated units the region may have taken over. */
  readonly consumed: readonly Unit[];
}

type Item =
  | { readonly type: 'line'; readonly text: string }
  | { readonly type: 'hash'; readonly text: string }
  | { readonly type: 'unit'; readonly unit: Unit }
  | { readonly type: 'region'; readonly region: Region };

interface ParsedFile {
  readonly items: readonly Item[];
  readonly storedHash: string | null;
}

const conflict = (message: string, detail?: Record<string, unknown>): ToolError => new ToolError('conflict', message, detail);

const nextNonBlank = (lines: readonly string[], from: number, limit: number): number | null => {
  const found = lines.slice(from, limit + 1).findIndex((line) => !isBlank(line));
  return found === -1 ? null : from + found;
};

const lastNonBlank = (lines: readonly string[], from: number, to: number): number => {
  const slice = lines.slice(from, to + 1);
  const offset = [...slice].reverse().findIndex((line) => !isBlank(line));
  return offset === -1 ? from : to - offset;
};

/** `step <action> <target>` from a flow step comment (whitespace collapsed), else `step-<n>`. */
const flowStepKey = (index: string, description: string | undefined): string => {
  const text = (description ?? '').replace(/\s+/g, ' ').trim();
  return text.length > 0 ? `step ${text}` : `step-${index}`;
};

interface Opener {
  readonly family: UnitFamily;
  readonly key: string;
  /** Last line of the leading comment (doc comment or step comment); the statement follows it. -1 for test.step. */
  readonly leadEnd: number;
}

const docSubject = (lines: readonly string[], start: number, limit: number): { readonly key: string; readonly end: number } | null => {
  const endOffset = lines.slice(start, Math.min(limit, start + 40) + 1).findIndex((line) => line.includes('*/'));
  if (endOffset === -1) return null;
  const end = start + endOffset;
  const content = lines
    .slice(start, end + 1)
    .map((line) => line.trim().replace(/^\/\*\*/, '').replace(/^\*(?!\/)/, '').replace(/\*\/.*$/, '').trim())
    .find((text) => text.length > 0);
  const match = content === undefined ? null : DOC_SUBJECT.exec(content);
  if (match === null) return null;
  const kind = match[1]!;
  const id = match[2]!;
  return { key: kind === 'facet' ? id : kind === 'select' ? `select ${id}` : 'route', end };
};

const detectOpener = (lines: readonly string[], i: number, limit: number): Opener | null => {
  const line = lines[i]!;
  if (STEP_OPENER.test(line)) return { family: 'step', key: '', leadEnd: -1 };
  const flow = FLOW_STEP.exec(line);
  if (flow !== null) return { family: 'flow-step', key: flowStepKey(flow[1]!, flow[2]), leadEnd: i };
  if (DOC_OPENER.test(line)) {
    const subject = docSubject(lines, i, limit);
    if (subject !== null) return { family: 'member', key: subject.key, leadEnd: subject.end };
  }
  return null;
};

/**
 * Last line of the statement starting at `start`: brackets balance, and the
 * next line does not continue a member chain. Bounded by indentation: a line
 * indented less than the unit, or another unit opener at the unit's own level,
 * ends it even if brackets were miscounted.
 */
const statementEnd = (lines: readonly string[], start: number, baseIndent: number, limit: number): number | null => {
  // Inside a keep region the human's indentation is not evidence of anything; only its keep-end closes it.
  let depth = 0;
  let state = INITIAL_LEX_STATE;
  let inKeep = false;
  for (let k = start; k <= limit; k += 1) {
    const line = lines[k]!;
    if (k > start && !inKeep && !isBlank(line) && !KEEP_START.test(line)) {
      const lineIndent = indentOf(line);
      if (lineIndent < baseIndent) return lastNonBlank(lines, start, k - 1);
      if (depth > 0 && lineIndent === baseIndent && detectOpener(lines, k, limit) !== null) return lastNonBlank(lines, start, k - 1);
    }
    inKeep = KEEP_START.test(line) ? true : KEEP_END.test(line) ? false : inKeep;
    const lexed = lexLine(line, state);
    depth += lexed.depthDelta;
    state = lexed.state;
    if (!inKeep && depth <= 0 && !state.inBlockComment) {
      const next = nextNonBlank(lines, k + 1, limit);
      if (next === null || !/^\s*(\.|\?\.)/.test(lines[next]!)) return k;
    }
  }
  return null;
};

const stepHead = (unitLines: readonly string[]): number => {
  const bodyOpen = unitLines.findIndex((line, index) => index < unitLines.length - 1 && /\{\s*(\/\/.*)?$/.test(line));
  if (bodyOpen === -1) return 1;
  const expected = unitLines.slice(bodyOpen + 1).findIndex((line) => !EXPECTED_LINE.test(line));
  return bodyOpen + 1 + (expected === -1 ? 0 : expected);
};

const stepTitle = (unitLines: readonly string[]): string | null => {
  const joined = unitLines.slice(0, 3).join('\n');
  const at = joined.indexOf('test.step');
  if (at === -1) return null;
  const quoteAt = joined.slice(at).search(/['"`]/);
  if (quoteAt === -1) return null;
  return readQuoted(joined, at + quoteAt).value;
};

const checkMarkersBalanced = (unitLines: readonly string[], firstLine: number): void => {
  const open = unitLines.reduce<number | null>((openAt, line, index) => {
    if (KEEP_START.test(line)) {
      if (openAt !== null) throw conflict(`nested tesseract:keep-start at line ${firstLine + index + 1}; keep regions do not nest`);
      return index;
    }
    if (KEEP_END.test(line)) {
      if (openAt === null) throw conflict(`tesseract:keep-end at line ${firstLine + index + 1} has no matching keep-start`);
      return null;
    }
    return openAt;
  }, null);
  if (open !== null) {
    throw conflict(`the keep region starting at line ${firstLine + open + 1} crosses the end of its block; close it inside the same step or member`);
  }
};

interface RawUnit extends Unit {
  readonly inRegion: boolean;
}

const readUnit = (
  lines: readonly string[],
  i: number,
  limit: number,
  shorthand: string | null,
  inRegion: boolean,
): { readonly unit: RawUnit; readonly end: number } | null => {
  const opener = detectOpener(lines, i, limit);
  if (opener === null) return null;
  const leadEnd = opener.family === 'step' ? i - 1 : opener.leadEnd;
  // Between a member's doc comment (or a flow step's comment) and its statement, a human may put the
  // shorthand, or open a keep region around the statement; either way the unit is theirs.
  const inner = opener.family !== 'step' && leadEnd + 1 <= limit && KEEP_SHORTHAND.test(lines[leadEnd + 1]!);
  const statementStart = leadEnd + 1 + (inner ? 1 : 0);
  if (statementStart > limit || isBlank(lines[statementStart] ?? '') || KEEP_END.test(lines[statementStart]!) || KEEP_SHORTHAND.test(lines[statementStart]!)) return null;
  // A keep region right after the comment either holds the statement (it contains code) or precedes it.
  const leadingRegionEnd = (): number | null => {
    const offset = lines.slice(statementStart + 1, limit + 1).findIndex((line) => KEEP_END.test(line) || KEEP_START.test(line));
    return offset === -1 || KEEP_START.test(lines[statementStart + 1 + offset]!) ? null : statementStart + 1 + offset;
  };
  const regionEnd = opener.family !== 'step' && KEEP_START.test(lines[statementStart]!) ? leadingRegionEnd() : undefined;
  if (regionEnd === null) return null;
  // After a leading region, the unit goes on through the next line when that line is a plain statement of the unit's
  // own level (the region was inserted above it); otherwise the region wrapped the statement itself.
  const baseIndent = indentOf(lines[i]!);
  const after = regionEnd === undefined ? null : lines[regionEnd + 1];
  const continues = after !== undefined && after !== null && !isBlank(after) && !isKeepMarker(after) && !/^\s*(\/\/|\/\*|[})\]])/.test(after) &&
    indentOf(after) >= baseIndent && detectOpener(lines, regionEnd! + 1, limit) === null;
  const end = regionEnd === undefined
    ? statementEnd(lines, statementStart, baseIndent, limit)
    : continues
      ? statementEnd(lines, regionEnd + 1, baseIndent, limit)
      : regionEnd;
  if (end === null) return null;
  const unitLines = lines.slice(i, end + 1);
  if (!inRegion) checkMarkersBalanced(unitLines, i);
  const kept = shorthand !== null || inner || unitLines.some((line) => KEEP_START.test(line) || KEEP_SHORTHAND.test(line));
  return {
    unit: {
      family: opener.family,
      key: opener.key,
      lines: unitLines,
      head: opener.family === 'step' ? stepHead(unitLines) : 0,
      kept,
      shorthand,
      title: opener.family === 'step' ? stepTitle(unitLines) : null,
      inRegion,
    },
    end,
  };
};

const unitsWithin = (lines: readonly string[], from: number, to: number): readonly RawUnit[] => {
  const found: RawUnit[] = [];
  for (let k = from; k <= to; k += 1) {
    const read = readUnit(lines, k, to, null, true);
    if (read !== null) {
      found.push(read.unit);
      k = read.end;
    }
  }
  return found;
};

/** The `ado-steps` annotation of a spec: the ADO stepIdentifiers in test.step order. */
export const parseAdoSteps = (text: string): readonly string[] | null => {
  const match = /(['"]?)type\1\s*:\s*(['"])ado-steps\2\s*,\s*(['"]?)description\3\s*:\s*(?=['"])/.exec(text);
  if (match === null) return null;
  try {
    const parsed: unknown = JSON.parse(readQuoted(text, match.index + match[0].length).value);
    return Array.isArray(parsed) && parsed.every((entry) => typeof entry === 'string') ? (parsed as string[]) : null;
  } catch {
    return null;
  }
};

/**
 * Keys for test.step units. When the file has as many steps as its ado-steps
 * annotation lists, they pair up in order. Otherwise steps outside keep
 * regions are generated and pair up in order, and a step inside a region
 * pairs up only when its title is the one ADO step it would pair with
 * (anything else in a region is the human's own step).
 */
const assignStepKeys = (
  units: readonly RawUnit[],
  adoSteps: readonly string[] | null,
  titleFor: ((stepIdentifier: string) => string | undefined) | undefined,
): ReadonlyMap<RawUnit, string> => {
  const steps = units.filter((unit) => unit.family === 'step');
  if (adoSteps === null) return new Map(steps.map((unit, position) => [unit, `step@${position + 1}`]));
  if (steps.length === adoSteps.length) return new Map(steps.map((unit, position) => [unit, `step-${adoSteps[position]!}`]));
  return steps.reduce<{ readonly keys: ReadonlyMap<RawUnit, string>; readonly next: number }>(
    (acc, unit, position) => {
      const candidate = adoSteps[acc.next];
      const pairs = candidate !== undefined && (!unit.inRegion || (titleFor !== undefined && titleFor(candidate) === unit.title));
      return pairs
        ? { keys: new Map([...acc.keys, [unit, `step-${candidate}`]]), next: acc.next + 1 }
        : { keys: new Map([...acc.keys, [unit, `step@${position + 1}`]]), next: acc.next };
    },
    { keys: new Map(), next: 0 },
  ).keys;
};

type RawItem =
  | { readonly type: 'line'; readonly text: string }
  | { readonly type: 'hash'; readonly text: string }
  | { readonly type: 'unit'; readonly unit: RawUnit }
  | { readonly type: 'region'; readonly label: string | null; readonly lines: readonly string[]; readonly consumed: readonly RawUnit[] };

const scanItems = (lines: readonly string[]): readonly RawItem[] => {
  const limit = lines.length - 1;
  const items: RawItem[] = [];
  let sawHash = false;
  for (let i = 0; i <= limit; i += 1) {
    const line = lines[i]!;
    if (!sawHash && HASH_LINE.test(line)) {
      items.push({ type: 'hash', text: line });
      sawHash = true;
      continue;
    }
    if (KEEP_END.test(line)) throw conflict(`tesseract:keep-end at line ${i + 1} has no matching keep-start`);
    const start = KEEP_START.exec(line);
    if (start !== null) {
      const endOffset = lines.slice(i + 1).findIndex((candidate) => KEEP_END.test(candidate) || KEEP_START.test(candidate));
      if (endOffset === -1) throw conflict(`tesseract:keep-start at line ${i + 1} is never closed with tesseract:keep-end`);
      const end = i + 1 + endOffset;
      if (KEEP_START.test(lines[end]!)) throw conflict(`nested tesseract:keep-start at line ${end + 1}; keep regions do not nest`);
      const label = start[1]!.trim();
      items.push({ type: 'region', label: label.length > 0 ? label : null, lines: lines.slice(i, end + 1), consumed: unitsWithin(lines, i + 1, end - 1) });
      i = end;
      continue;
    }
    const shorthand = KEEP_SHORTHAND.test(line);
    const read = shorthand ? (i + 1 <= limit ? readUnit(lines, i + 1, limit, line, false) : null) : readUnit(lines, i, limit, null, false);
    if (read !== null) {
      items.push({ type: 'unit', unit: read.unit });
      i = read.end;
    } else {
      items.push(shorthand ? { type: 'region', label: null, lines: [line], consumed: [] } : { type: 'line', text: line });
    }
  }
  return items;
};

const splitLines = (text: string): readonly string[] => {
  const lines = normalizeNewlines(text).split('\n');
  return lines.length > 0 && lines[lines.length - 1] === '' ? lines.slice(0, -1) : lines;
};

/** Flow steps that repeat an action on the same target are told apart by occurrence: `step click x`, `step click x #2`, … */
const assignFlowKeys = (units: readonly RawUnit[]): ReadonlyMap<RawUnit, string> =>
  units
    .filter((unit) => unit.family === 'flow-step')
    .reduce<{ readonly keys: ReadonlyMap<RawUnit, string>; readonly seen: ReadonlyMap<string, number> }>(
      (acc, unit) => {
        const count = (acc.seen.get(unit.key) ?? 0) + 1;
        return {
          keys: new Map([...acc.keys, [unit, count === 1 ? unit.key : `${unit.key} #${count}`]]),
          seen: new Map([...acc.seen, [unit.key, count]]),
        };
      },
      { keys: new Map(), seen: new Map() },
    ).keys;

const parseFile = (text: string, titleFor?: (stepIdentifier: string) => string | undefined): ParsedFile => {
  const raw = scanItems(splitLines(text));
  const allUnits = raw.flatMap((item) => (item.type === 'unit' ? [item.unit] : item.type === 'region' ? item.consumed : []));
  const stepKeys = assignStepKeys(allUnits, parseAdoSteps(text), titleFor);
  const flowKeys = assignFlowKeys(allUnits);
  const keyed = (unit: RawUnit): Unit => {
    const { inRegion: _inRegion, ...rest } = unit;
    if (unit.family === 'step') return { ...rest, key: stepKeys.get(unit) ?? 'step@?' };
    return unit.family === 'flow-step' ? { ...rest, key: flowKeys.get(unit) ?? unit.key } : rest;
  };
  const items = raw.map((item): Item => {
    if (item.type === 'unit') return { type: 'unit', unit: keyed(item.unit) };
    if (item.type === 'region') {
      // A step the human wrote inside a region has no ADO key; it is region content, not a taken-over unit.
      const consumed = item.consumed.map(keyed).filter((unit) => !unit.key.startsWith('step@'));
      return { type: 'region', region: { label: item.label, lines: item.lines, consumed } };
    }
    return item;
  });
  const hashItem = raw.find((item) => item.type === 'hash');
  const stored = hashItem === undefined ? null : (HASH_LINE.exec(hashItem.text)?.[1] ?? null);
  return { items, storedHash: stored };
};

// ─── Hash ───────────────────────────────────────────────────────────────────

const unitCloser = (unit: Unit): string => unit.lines[unit.lines.length - 1] ?? '';

// The key is deliberately not part of the placeholder: step keys come from pairing with ado-steps, and the
// hash must not change if that pairing does.
const keptPlaceholder = (unit: Unit): string =>
  `⟦kept⟧${unit.family === 'step' ? canonicalLines([...unit.lines.slice(0, unit.head), unitCloser(unit)]) : ''}`;

/** One piece of the hashed skeleton: fixed text, or a slot for a unit a human holds (kept, or inside a keep region). */
type Part = { readonly fixed: string } | { readonly key: string; readonly fallback: string };

const skeletonParts = (file: ParsedFile): readonly Part[] => {
  const parts: Part[] = [];
  let frame: string[] = [];
  const flush = (): void => {
    if (frame.length > 0) parts.push({ fixed: canonicalLines(frame) });
    frame = [];
  };
  for (const item of file.items) {
    if (item.type === 'line') {
      frame.push(item.text);
    } else if (item.type === 'unit') {
      flush();
      parts.push(item.unit.kept ? { key: item.unit.key, fallback: keptPlaceholder(item.unit) } : { fixed: canonicalLines(item.unit.lines) });
    } else if (item.type === 'region') {
      // Keep regions contribute nothing; the units inside them are slots, empty unless a stand-in is chosen.
      flush();
      parts.push(...item.region.consumed.map((unit): Part => ({ key: unit.key, fallback: '' })));
    }
  }
  flush();
  return parts;
};

const hashParts = (parts: readonly Part[], chosen: ReadonlyMap<string, string>): string =>
  sha256Hex(finishCanonical(parts.map((part) => ('fixed' in part ? part.fixed : (chosen.get(part.key) ?? part.fallback))).join(''))).slice(0, 12);

const hashOf = (file: ParsedFile): string => hashParts(skeletonParts(file), new Map());

const withoutMarkers = (lines: readonly string[]): readonly string[] => lines.filter((line) => !isKeepMarker(line));

/** Lines with every keep region (markers and contents) removed: the unit as generated, if the human only added kept lines. */
const withoutRegions = (lines: readonly string[]): readonly string[] =>
  lines.reduce<{ readonly out: readonly string[]; readonly inside: boolean }>(
    (acc, line) => {
      if (KEEP_START.test(line)) return { out: acc.out, inside: true };
      if (KEEP_END.test(line)) return { out: acc.out, inside: false };
      return acc.inside || KEEP_SHORTHAND.test(line) ? acc : { out: [...acc.out, line], inside: false };
    },
    { out: [], inside: false },
  ).out;

/**
 * What a held unit may have looked like when Tesseract last wrote it, as
 * canonical text: as generated now; as written without keep markers (wrapped,
 * not edited); as written without keep regions (kept lines only added); and,
 * for a test.step, its written opener with the body generated now (the ADO
 * wording changed in the same revision that regenerates it).
 */
const priorForms = (unit: Unit, generated: Unit | undefined): readonly string[] => {
  const forms: readonly (readonly string[])[] = [
    ...(generated === undefined ? [] : [generated.lines]),
    withoutMarkers(unit.lines),
    withoutRegions(unit.lines),
    ...(generated !== undefined && unit.family === 'step' && generated.family === 'step'
      ? [[...unit.lines.slice(0, unit.head), ...generated.lines.slice(generated.head, generated.lines.length - 1), unitCloser(unit)]]
      : []),
    // A flow step that moved (steps inserted or removed when re-recording): its written comment, today's statement.
    ...(generated !== undefined && unit.family === 'flow-step' && generated.family === 'flow-step'
      ? [[...unit.lines.slice(0, 1), ...generated.lines.slice(1)]]
      : []),
  ];
  return [...new Set(forms.map((form) => canonicalLines(form)))];
};

/**
 * True when everything outside keep regions is as Tesseract last wrote it,
 * modulo formatting. A unit marked kept (or wrapped in a region) since the
 * last write no longer contributes its text, so the stored hash is also tried
 * with each such unit restored to one of its prior forms.
 */
const verify = (existing: ParsedFile, generated: ParsedFile | null): boolean => {
  const stored = existing.storedHash;
  if (stored === null) return false;
  const parts = skeletonParts(existing);
  if (hashParts(parts, new Map()) === stored) return true;
  const generatedUnits = new Map(
    (generated?.items ?? []).flatMap((item) => (item.type === 'unit' ? [[item.unit.key, item.unit] as const] : [])),
  );
  const held = existing.items.flatMap((item) =>
    item.type === 'unit' && item.unit.kept ? [item.unit] : item.type === 'region' ? item.region.consumed : [],
  );
  const options = held
    .filter((unit, index) => held.findIndex((other) => other.key === unit.key) === index)
    .map((unit) => ({ key: unit.key, forms: priorForms(unit, generatedUnits.get(unit.key)) }));
  if (options.length === 0) return false;
  const total = options.reduce((product, option) => product * (option.forms.length + 1), 1);
  if (total > 4096) {
    // Too many held units to try every combination: try each prior form for all of them at once.
    return [0, 1, 2, 3].some((choice) =>
      hashParts(parts, new Map(options.map((option) => [option.key, option.forms[Math.min(choice, option.forms.length - 1)]!]))) === stored,
    );
  }
  const search = (index: number, chosen: ReadonlyMap<string, string>): boolean => {
    const option = options[index];
    if (option === undefined) return chosen.size > 0 && hashParts(parts, chosen) === stored;
    return search(index + 1, chosen) || option.forms.some((form) => search(index + 1, new Map([...chosen, [option.key, form]])));
  };
  return search(0, new Map());
};

// ─── Merge ──────────────────────────────────────────────────────────────────

interface Anchor {
  /** The generated line above the region (null: the region opens its segment). */
  readonly line: { readonly canonical: string; readonly occurrence: number } | null;
  /** Blank lines between that line (or the segment start) and the region. */
  readonly gap: number;
}

interface Placement {
  readonly segment: string;
  /** Index of the frame line (within the segment) to insert after; -1 = segment start; 'end' = before the next unit. */
  readonly after: number | 'end';
}

const HEAD_SEGMENT = '^';

const frameCanonical = (item: Item): string | null => {
  if (item.type === 'hash') return '//tesseract:generated';
  if (item.type === 'line') return isBlank(item.text) ? null : canonicalLines([item.text]);
  return null;
};

interface SegmentLine {
  readonly segment: string;
  readonly index: number;
  readonly canonical: string | null;
}

/** For each item: the segment it sits in and, for frame lines, its index within the segment. */
const segmentsOf = (items: readonly Item[], segmentAfter: (item: Item) => string | null): readonly SegmentLine[] => {
  const out: SegmentLine[] = [];
  let segment = HEAD_SEGMENT;
  let index = -1;
  for (const item of items) {
    if (item.type === 'line' || item.type === 'hash') {
      index += 1;
      out.push({ segment, index, canonical: frameCanonical(item) });
      continue;
    }
    out.push({ segment, index, canonical: null });
    const next = segmentAfter(item);
    if (next !== null) {
      segment = next;
      index = -1;
    }
  }
  return out;
};

const orphanBlock = (key: string, lines: readonly string[]): readonly string[] => [
  `// tesseract:keep-start ${ORPHAN_PREFIX}${key}`,
  `// tesseract:orphaned ${key} — kept code whose step or member is no longer generated; reuse what you need, then delete this block.`,
  ...lines.map((line) => (isBlank(line) ? '//' : `// ${line}`)),
  '// tesseract:keep-end',
];

const reindent = (lines: readonly string[], delta: number): readonly string[] =>
  delta === 0
    ? lines
    : lines.map((line) => {
        if (isBlank(line)) return line;
        if (delta > 0) return `${' '.repeat(delta)}${line}`;
        const removable = Math.min(-delta, /^ */.exec(line)![0].length);
        return line.slice(removable);
      });

/** Lines outside keep regions that match `pattern` are dropped (generator-owned lines that moved into a kept body). */
const dropOutsideRegions = (lines: readonly string[], pattern: RegExp): readonly string[] =>
  lines.reduce<{ readonly out: readonly string[]; readonly inside: boolean }>(
    (acc, line) => {
      const inside = KEEP_START.test(line) ? true : KEEP_END.test(line) ? false : acc.inside;
      return { out: !acc.inside && !KEEP_START.test(line) && pattern.test(line) ? acc.out : [...acc.out, line], inside };
    },
    { out: [], inside: false },
  ).out;

interface Lexed {
  readonly depth: number;
  readonly state: LexState;
}

const LEX_START: Lexed = { depth: 0, state: INITIAL_LEX_STATE };

const lexAll = (lines: readonly string[], from: Lexed): Lexed =>
  lines.reduce<Lexed>((acc, line) => {
    const lexed = lexLine(line, acc.state);
    return { depth: acc.depth + lexed.depthDelta, state: lexed.state };
  }, from);

const depthAfter = (lines: readonly string[]): number => lexAll(lines, LEX_START).depth;

const placementKey = (placement: Placement): string => `${placement.segment}\u0000${String(placement.after)}`;

const mergeKeptUnit = (generated: Unit, kept: Unit): readonly string[] => {
  const prefix = kept.shorthand === null ? [] : [kept.shorthand];
  // A kept flow step keeps its body; its `// step <n> — …` comment is renumbered to where the step is now.
  if (generated.family === 'flow-step') return [...prefix, ...generated.lines.slice(0, 1), ...kept.lines.slice(1)];
  if (generated.family !== 'step') return [...prefix, ...kept.lines];
  const body = dropOutsideRegions(kept.lines.slice(kept.head, kept.lines.length - 1), EXPECTED_LINE);
  const delta = indentOf(generated.lines[0]!) - indentOf(kept.lines[0]!);
  return [...prefix, ...generated.lines.slice(0, generated.head), ...reindent(body, delta), unitCloser(generated)];
};

interface Spliced {
  readonly lines: readonly string[];
  readonly orphaned: readonly string[];
}

const splice = (generated: ParsedFile, existing: ParsedFile): Spliced => {
  const genUnits = generated.items.flatMap((item) => (item.type === 'unit' ? [item.unit] : []));
  const genKeys = new Set(genUnits.map((unit) => unit.key));
  const regions = existing.items.flatMap((item, index) => (item.type === 'region' ? [{ region: item.region, index }] : []));

  // Regions that took over generated units sit where the first of those units is generated now.
  const takeovers = regions
    .filter(({ region }) => !(region.label ?? '').startsWith(ORPHAN_PREFIX))
    .flatMap(({ region, index }) => {
      const present = region.consumed.filter((unit) => genKeys.has(unit.key));
      if (present.length === 0) return [];
      const firstInGen = genUnits.find((unit) => present.some((held) => held.key === unit.key))!;
      return [{ region, index, at: firstInGen.key, holds: new Set(present.map((unit) => unit.key)) }];
    });
  const heldKeys = new Set(takeovers.flatMap((takeover) => [...takeover.holds]));
  const takeoversAt = (key: string): readonly Region[] =>
    takeovers.filter((takeover) => takeover.at === key).map((takeover) => takeover.region);
  const takeoverIndexes = new Set(takeovers.map((takeover) => takeover.index));

  const keptUnits = existing.items.flatMap((item) => (item.type === 'unit' && item.unit.kept ? [item.unit] : []));
  const keptByKey = new Map(
    keptUnits.filter((unit) => genKeys.has(unit.key) && !heldKeys.has(unit.key)).reverse().map((unit) => [unit.key, unit] as const),
  );
  const orphanedUnits = keptUnits.filter((unit) => !genKeys.has(unit.key) || heldKeys.has(unit.key) || keptByKey.get(unit.key) !== unit);

  // Free regions: anchored to the generated line above them, within the segment after the same unit.
  const existingSegments = segmentsOf(existing.items, (item) => {
    if (item.type === 'unit') return item.unit.key;
    if (item.type === 'region' && item.region.consumed.length > 0) return item.region.consumed[item.region.consumed.length - 1]!.key;
    return null;
  });
  const generatedSegments = segmentsOf(generated.items, (item) => (item.type === 'unit' ? item.unit.key : null));
  const flowStepKeys = new Set(
    existing.items.flatMap((item) =>
      (item.type === 'unit' ? [item.unit] : item.type === 'region' ? item.region.consumed : []).filter((unit) => unit.family === 'flow-step').map((unit) => unit.key),
    ),
  );
  const unitOrder = existing.items.flatMap((item) =>
    item.type === 'unit' ? [item.unit.key] : item.type === 'region' ? item.region.consumed.map((unit) => unit.key) : [],
  );
  const segmentFrames = (segment: string): readonly SegmentLine[] =>
    generatedSegments.filter((line) => line.segment === segment && line.canonical !== null);
  const headFallback = (): number => {
    const head = generated.items
      .map((item, index) => ({ item, line: generatedSegments[index]! }))
      .filter(({ line }) => line.segment === HEAD_SEGMENT && line.canonical !== null);
    const lastImport = [...head].reverse().find(({ item }) => item.type === 'line' && /^\s*import\s/.test(item.text));
    const hash = head.find(({ item }) => item.type === 'hash');
    return (lastImport ?? hash)?.line.index ?? -1;
  };

  const anchorOf = (index: number): Anchor => {
    const segment = existingSegments[index]!.segment;
    let gap = 0;
    let counting = true;
    for (let i = index - 1; i >= 0; i -= 1) {
      const entry = existingSegments[i]!;
      const item = existing.items[i]!;
      if (entry.segment !== segment) break;
      if (item.type === 'line' && isBlank(item.text)) {
        if (counting) gap += 1;
      } else if (item.type === 'line' || item.type === 'hash') {
        const canonical = entry.canonical!;
        const occurrence = existingSegments.slice(0, i + 1).filter((line) => line.segment === segment && line.canonical === canonical).length - 1;
        return { line: { canonical, occurrence }, gap };
      } else {
        counting = false;
      }
    }
    return { line: null, gap };
  };

  /** Move past up to `gap` blank generated lines that directly follow frame line `after` of the segment. */
  const skipBlanks = (segment: string, after: number, gap: number): number => {
    let at = after;
    while (at - after < gap) {
      const next = generated.items.findIndex((item, i) => item.type === 'line' && generatedSegments[i]!.segment === segment && generatedSegments[i]!.index === at + 1);
      const item = next === -1 ? undefined : generated.items[next];
      if (item === undefined || item.type !== 'line' || !isBlank(item.text)) break;
      at += 1;
    }
    return at;
  };

  /** Bracket depth before the region at `index`, counting the generator's lines only (frame lines and units, not keep regions). */
  const existingDepthBefore = (index: number): number =>
    depthAfter(existing.items.slice(0, index).flatMap((item) => (item.type === 'unit' ? item.unit.lines : item.type === 'region' ? [] : [item.text])));
  /** Bracket depth of the generated text at every place a free region can go (built on first use: most merges never need it). */
  let generatedDepthsCache: ReadonlyMap<string, number> | null = null;
  const generatedDepthAt = (placement: Placement): number | undefined => {
    if (generatedDepthsCache === null) {
      const depths = new Map<string, number>([[placementKey({ segment: HEAD_SEGMENT, after: -1 }), 0]]);
      let at = LEX_START;
      let segment = HEAD_SEGMENT;
      let frame = -1;
      for (const item of generated.items) {
        if (item.type === 'line' || item.type === 'hash') {
          at = lexAll([item.text], at);
          frame += 1;
          depths.set(placementKey({ segment, after: frame }), at.depth);
        } else if (item.type === 'region') {
          at = lexAll(item.region.lines, at);
        } else {
          depths.set(placementKey({ segment, after: 'end' }), at.depth);
          at = lexAll(item.unit.lines, at);
          segment = item.unit.key;
          frame = -1;
          depths.set(placementKey({ segment, after: -1 }), at.depth);
        }
      }
      depths.set(placementKey({ segment, after: 'end' }), at.depth);
      generatedDepthsCache = depths;
    }
    return generatedDepthsCache.get(placementKey(placement));
  };

  const placeFree = (index: number): Placement | null => {
    const segment = existingSegments[index]!.segment;
    if (segment === HEAD_SEGMENT || genKeys.has(segment)) {
      const anchor = anchorOf(index);
      if (anchor.line === null) return { segment, after: skipBlanks(segment, -1, anchor.gap) };
      const { canonical, occurrence } = anchor.line;
      const matches = segmentFrames(segment).filter((line) => line.canonical === canonical);
      const match = matches[occurrence] ?? matches[matches.length - 1];
      if (match !== undefined) return { segment, after: skipBlanks(segment, match.index, anchor.gap) };
      return { segment, after: segment === HEAD_SEGMENT ? headFallback() : -1 };
    }
    // Its unit is gone. A flow step's key is its action and target, so a vanished one means that action changed
    // or went away; code that ran after it must not move in front of whatever runs there now: orphan it.
    if (flowStepKeys.has(segment)) return null;
    // Otherwise follow the closest earlier unit that survives, at the bracket depth the region had (before the
    // next unit, else directly after the survivor; the survivor's trailing frame lines may close the test or
    // class). No such place: the region is orphaned rather than moved out of its block.
    const position = unitOrder.indexOf(segment);
    const survivor = [...unitOrder.slice(0, Math.max(position, 0))].reverse().find((key) => genKeys.has(key));
    if (survivor === undefined) return null;
    const depth = existingDepthBefore(index);
    const options: readonly Placement[] = [{ segment: survivor, after: 'end' }, { segment: survivor, after: -1 }];
    return options.find((option) => generatedDepthAt(option) === depth) ?? null;
  };

  const freeRegions = regions.filter(
    ({ region, index }) => !takeoverIndexes.has(index) && !(region.label ?? '').startsWith(ORPHAN_PREFIX),
  );
  /** Blank lines right after the region in the existing file (kept when the generated text does not supply them). */
  const trailingOf = (index: number): number => {
    const after = existing.items.slice(index + 1);
    const stop = after.findIndex((item) => !(item.type === 'line' && isBlank(item.text)));
    return stop === -1 ? after.length : stop;
  };
  const placed = freeRegions.map(({ region, index }) => ({ region, placement: placeFree(index), trailing: trailingOf(index) }));
  const placedAt = (segment: string, after: number | 'end', nextIsBlank: boolean): readonly string[] => {
    const batch = placed.filter(({ placement }) => placement !== null && placement.segment === segment && placement.after === after);
    return batch.flatMap(({ region, trailing }, i) => [
      ...region.lines,
      ...(i < batch.length - 1 || !nextIsBlank ? Array.from({ length: trailing }, () => '') : []),
    ]);
  };
  // A stray one-line marker that lost its place carries no code; it is simply not carried over.
  const orphanedRegions = placed.filter(({ placement, region }) => placement === null && region.lines.length > 1).map(({ region }) => region);

  const blankAt = (i: number): boolean => {
    const item = generated.items[i];
    return item === undefined || (item.type === 'line' && isBlank(item.text));
  };
  const body: string[] = [...placedAt(HEAD_SEGMENT, -1, blankAt(0))];
  let segment = HEAD_SEGMENT;
  let frame = -1;
  generated.items.forEach((item, i) => {
    if (item.type === 'line' || item.type === 'hash') {
      frame += 1;
      body.push(item.text, ...placedAt(segment, frame, blankAt(i + 1)));
    } else if (item.type === 'region') {
      body.push(...item.region.lines);
    } else {
      const unit = item.unit;
      const kept = keptByKey.get(unit.key);
      const lines = heldKeys.has(unit.key)
        ? takeoversAt(unit.key).flatMap((region) => region.lines)
        : kept !== undefined
          ? mergeKeptUnit(unit, kept)
          : unit.lines;
      body.push(...placedAt(segment, 'end', false), ...lines, ...placedAt(unit.key, -1, blankAt(i + 1)));
      segment = unit.key;
      frame = -1;
    }
  });
  body.push(...placedAt(segment, 'end', true));

  const carriedOrphans = regions.filter(({ region }) => (region.label ?? '').startsWith(ORPHAN_PREFIX)).map(({ region }) => region.lines);
  const newOrphans = [
    ...orphanedUnits.map((unit) => ({ key: unit.key, lines: unit.lines })),
    ...orphanedRegions.map((region) => ({
      key: region.label ?? (region.consumed[0]?.key ?? 'region'),
      lines: region.lines.slice(1, -1),
    })),
  ];
  const tail = [...carriedOrphans, ...newOrphans.map((orphan) => orphanBlock(orphan.key, orphan.lines))].reduce<readonly string[]>(
    (acc, block) => [...acc, ...(acc.length === 0 || !isBlank(acc[acc.length - 1]!) ? [''] : []), ...block],
    body,
  );
  return { lines: tail, orphaned: newOrphans.map((orphan) => orphan.key) };
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * What a failed verification means. The usual cause is an edit outside keep
 * regions. The other: a generated line was rewritten inside a new keep region
 * and that step or member is generated differently now, so its original text
 * cannot be reconstructed to prove the edit stayed inside the region.
 */
export const HAND_EDIT_MESSAGE =
  'the existing file changed outside tesseract:keep regions since Tesseract wrote it (or a newly kept step or member was rewritten and is generated differently now). ' +
  'Wrap your edits in "// tesseract:keep-start" / "// tesseract:keep-end" (page objects: or move them to the overrides file) and emit again; ' +
  'if the diff shows nothing of yours is lost, emit with force.';

/** The hash a generated or merged text should carry on its `tesseract:generated` line. */
export const generatedHash = (text: string): string => hashOf(parseFile(text));

/** Set the `// tesseract:generated sha256:…` line (inserting it first if missing) to the text's own hash. */
export const stampHash = (text: string): string => {
  const lines = splitLines(text);
  const at = lines.findIndex((line) => HASH_LINE.test(line));
  const withLine = at === -1 ? [HASH_PLACEHOLDER, ...lines] : lines;
  const index = at === -1 ? 0 : at;
  const hash = generatedHash(toFileText(withLine));
  return toFileText(withLine.map((line, i) => (i === index ? hashLine(hash) : line)));
};

export interface GeneratedCheck {
  /** The file carries a tesseract:generated line. */
  readonly stamped: boolean;
  /** Everything outside keep regions is as Tesseract last wrote it (formatting aside). */
  readonly intact: boolean;
}

/**
 * Check a file on its own (no regeneration at hand). A unit marked kept since
 * the last write cannot be verified without the generated text, so `intact`
 * is conservative: false means "edited, or newly kept".
 */
export const checkGenerated = (text: string): GeneratedCheck => {
  const parsed = parseFile(text);
  return { stamped: parsed.storedHash !== null, intact: parsed.storedHash !== null && verify(parsed, null) };
};

export interface MergeOptions {
  /** Proceed even when the existing file was edited outside keep regions (those edits are discarded). */
  readonly force?: boolean;
}

export interface MergeResult {
  /** The text to write: LF line endings, stamped hash. */
  readonly text: string;
  /** Keys of kept code that no longer has a place and was appended as an orphaned block. */
  readonly orphaned: readonly string[];
  /** The existing file was edited outside keep regions (or is not a Tesseract file). */
  readonly handEdited: boolean;
}

/**
 * Merge without deciding: never throws for a hand edit (it reports it), only
 * for keep markers that cannot be paired (always a conflict, even with force).
 */
export const mergeTexts = (generated: string, existing: string | null): MergeResult => {
  const generatedFile = parseFile(stampHash(generated));
  if (existing === null) return { text: stampHash(generated), orphaned: [], handEdited: false };
  const titles = new Map(
    generatedFile.items.flatMap((item) =>
      item.type === 'unit' && item.unit.family === 'step' && item.unit.title !== null ? [[item.unit.key, item.unit.title] as const] : [],
    ),
  );
  const existingFile = parseFile(existing, (stepIdentifier) => titles.get(`step-${stepIdentifier}`));
  const handEdited = !verify(existingFile, generatedFile);
  const spliced = splice(generatedFile, existingFile);
  return { text: stampHash(toFileText(spliced.lines)), orphaned: spliced.orphaned, handEdited };
};

/**
 * Merge a freshly rendered file with the file on disk.
 *
 * Keep regions and kept units survive (see the module comment); orphaned kept
 * code is appended as a commented block and reported. When the existing file
 * was edited outside keep regions, this throws a `conflict` ToolError (detail:
 * `{ handEdited: true }`) unless `force` is set, in which case those edits are
 * discarded and `handEdited` is true. Malformed keep markers are always a
 * conflict.
 */
export const mergeWithExisting = (generated: string, existing: string | null, options: MergeOptions = {}): MergeResult => {
  const result = mergeTexts(generated, existing);
  if (result.handEdited && options.force !== true) {
    throw conflict(HAND_EDIT_MESSAGE, { handEdited: true });
  }
  return result;
};

/** Same content for every purpose emission cares about: identical after LF/BOM normalisation, or identical canonical form. */
export const sameGeneratedContent = (a: string, b: string): boolean => {
  const left = normalizeNewlines(a);
  const right = normalizeNewlines(b);
  if (left === right) return true;
  const canonical = (text: string): string => finishCanonical(canonicalLines(splitLines(text)));
  return canonical(left) === canonical(right);
};

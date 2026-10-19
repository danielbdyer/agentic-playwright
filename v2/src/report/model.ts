/**
 * Shared, pure readings of the receipts: field access on summarized
 * inputs and outputs, attributing each authoring line to the test case it
 * served, and the per-case facts both reports need (latest emit, latest
 * review, authoring time and tokens).
 */
import type { AcceptanceReceipt, Facet } from '../contract/schemas.js';
import type { EmitRecord } from '../run/emit-records.js';
import type { AuthoringLine, ReceiptSet } from './load.js';

// ─── Field access on summarized JSON ───────────────────────────────────────

export const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;

export const get = (value: unknown, ...keys: readonly string[]): unknown =>
  keys.reduce<unknown>((current, key) => asRecord(current)?.[key], value);

export const asString = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
export const asNumber = (value: unknown): number | undefined => (typeof value === 'number' && Number.isFinite(value) ? value : undefined);
export const asArray = (value: unknown): readonly unknown[] => (Array.isArray(value) ? value : []);

/** A summarized array ends with "…(n more)" when receipts truncated it; n, or 0. */
export const truncatedCount = (items: readonly unknown[]): number => {
  const last = items[items.length - 1];
  const match = typeof last === 'string' ? /^…\((\d+) more\)$/.exec(last) : null;
  return match === null ? 0 : Number(match[1]);
};

export const timeOf = (iso: string): number => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

export const ratio = (numerator: number, denominator: number): number | null => (denominator > 0 ? numerator / denominator : null);

// ─── Attribution ───────────────────────────────────────────────────────────

export interface Attributed {
  readonly line: AuthoringLine;
  /** The test case the call served, when the receipt says or its page does. */
  readonly caseId: string | undefined;
  readonly time: number;
  /** Position in the log (for stable ordering and dedupe keys). */
  readonly order: number;
}

const pageIdOf = (line: AuthoringLine): string | undefined => asString(get(line.input, 'pageId')) ?? asString(get(line.output, 'pageId'));

/**
 * Attribute every authoring line to a test case. A line carries one when
 * the call had a decision (or a testCaseId); a line that does not, but
 * worked on a page that an attributed line in the same session worked on,
 * belongs to that line's case (the nearest one before it, else after it).
 * This is how an interactive host's observations, which carry no decision,
 * still land in the per-test receipt.
 */
export const attribute = (lines: readonly AuthoringLine[]): readonly Attributed[] => {
  const base = lines.map((line, order) => ({ line, order, time: timeOf(line.at) }));
  const byPage = new Map<string, { readonly time: number; readonly order: number; readonly caseId: string }[]>();
  for (const { line, order, time } of base) {
    const pageId = pageIdOf(line);
    if (line.testCase === undefined || pageId === undefined) continue;
    const key = `${line.session ?? ''}|${pageId}`;
    const marks = byPage.get(key) ?? [];
    marks.push({ time, order, caseId: line.testCase });
    byPage.set(key, marks);
  }
  return base.map(({ line, order, time }) => {
    if (line.testCase !== undefined) return { line, order, time, caseId: line.testCase };
    const pageId = pageIdOf(line);
    const marks = pageId === undefined ? undefined : byPage.get(`${line.session ?? ''}|${pageId}`);
    if (marks === undefined || marks.length === 0) return { line, order, time, caseId: undefined };
    const before = marks.filter((m) => m.order < order).pop();
    const after = marks.find((m) => m.order > order);
    return { line, order, time, caseId: (before ?? after)?.caseId };
  });
};

// ─── Per-case facts ────────────────────────────────────────────────────────

export const latestBy = <T>(items: readonly T[], key: (item: T) => string, at: (item: T) => string): ReadonlyMap<string, T> => {
  const map = new Map<string, T>();
  for (const item of items) {
    const current = map.get(key(item));
    if (current === undefined || timeOf(at(item)) >= timeOf(at(current))) map.set(key(item), item);
  }
  return map;
};

export const latestReviews = (reviews: readonly AcceptanceReceipt[]): ReadonlyMap<string, AcceptanceReceipt> =>
  latestBy(reviews, (r) => r.testCaseId, (r) => r.at);

export const latestEmits = (emits: readonly EmitRecord[]): ReadonlyMap<string, EmitRecord> => latestBy(emits, (e) => e.testCaseId, (e) => e.at);

/** Successful, written test.emit calls (a dry run writes nothing). */
export const isWrittenEmit = (a: Attributed): boolean =>
  a.line.tool === 'test.emit' && a.line.outcome === 'succeeded' && get(a.line.output, 'written') !== false && get(a.line.input, 'dryRun') !== true;

/** The latest written test.emit line per case. */
export const latestEmitLines = (attributed: readonly Attributed[]): ReadonlyMap<string, Attributed> => {
  const map = new Map<string, Attributed>();
  for (const a of attributed) {
    if (a.caseId !== undefined && isWrittenEmit(a)) map.set(a.caseId, a);
  }
  return map;
};

/** Tools whose time and tokens are not authoring: running, publishing, and the human's review. */
const NOT_AUTHORING = new Set(['test.run', 'ado.publish', 'review.record']);

export interface CaseCost {
  readonly caseId: string;
  /** First authoring receipt of the case. */
  readonly start: number;
  /** Wall-clock minutes: per session, first call to last call's end; summed over sessions. */
  readonly minutes: number;
  readonly tokens: number;
  readonly models: readonly string[];
}

/**
 * Authoring cost per case. Host token counts are deduplicated by session
 * and prompt fingerprint, so a decision a host reports on several calls is
 * counted once.
 */
export const caseCosts = (attributed: readonly Attributed[]): ReadonlyMap<string, CaseCost> => {
  const groupBy = <K>(items: readonly Attributed[], key: (a: Attributed) => K | undefined): Map<K, Attributed[]> => {
    const groups = new Map<K, Attributed[]>();
    for (const item of items) {
      const k = key(item);
      if (k === undefined) continue;
      const group = groups.get(k) ?? [];
      group.push(item);
      groups.set(k, group);
    }
    return groups;
  };
  const byCase = groupBy(attributed, (a) => (NOT_AUTHORING.has(a.line.tool) ? undefined : a.caseId));
  return new Map(
    [...byCase].map(([caseId, lines]) => {
      const sessions = groupBy(lines, (a) => a.line.session ?? '');
      const ms = [...sessions.values()].reduce((sum, group) => {
        const start = group.reduce((min, a) => Math.min(min, a.time), Number.POSITIVE_INFINITY);
        const end = group.reduce((max, a) => Math.max(max, a.time + a.line.durationMs), 0);
        return sum + Math.max(0, end - start);
      }, 0);
      const seen = new Set<string>();
      const tokens = lines.reduce((sum, a) => {
        const host = a.line.host;
        if (host?.tokens === undefined) return sum;
        const key = host.promptFingerprint !== undefined ? `${a.line.session ?? ''}|${host.promptFingerprint}` : `#${a.order}`;
        if (seen.has(key)) return sum;
        seen.add(key);
        return sum + (host.tokens.prompt ?? 0) + (host.tokens.completion ?? 0);
      }, 0);
      const models = [...new Set(lines.flatMap((a) => (a.line.host?.model !== undefined ? [a.line.host.model] : [])))];
      const start = lines.reduce((min, a) => Math.min(min, a.time), Number.POSITIVE_INFINITY);
      return [caseId, { caseId, start, minutes: ms / 60_000, tokens, models }] as const;
    }),
  );
};

export const facetIndex = (facets: readonly Facet[]): ReadonlyMap<string, Facet> => new Map(facets.map((f) => [f.id, f] as const));

export const screenOfFacet = (facetId: string): string => facetId.slice(0, Math.max(0, facetId.indexOf(':')));

/** When each screen was first seen: its earliest facet's mint time. */
export const screenFirstSeen = (facets: readonly Facet[]): ReadonlyMap<string, number> => {
  const map = new Map<string, number>();
  for (const facet of facets) {
    const t = timeOf(facet.provenance.mintedAt);
    if (t === 0) continue;
    const current = map.get(facet.screen);
    if (current === undefined || t < current) map.set(facet.screen, t);
  }
  return map;
};

/** Every case the receipts mention. */
export const caseIds = (set: ReceiptSet, attributed: readonly Attributed[]): readonly string[] =>
  [
    ...new Set([
      ...set.emits.map((e) => e.testCaseId),
      ...set.reviews.map((r) => r.testCaseId),
      ...set.runs.flatMap((r) => (r.testCase !== undefined ? [r.testCase] : [])),
      ...attributed.flatMap((a) => (a.caseId !== undefined ? [a.caseId] : [])),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

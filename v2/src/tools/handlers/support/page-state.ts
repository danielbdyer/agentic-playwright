/**
 * What the app.* handlers remember between calls, beside the browser pool.
 * Both live exactly as long as what they describe:
 *
 * - per page (a WeakMap keyed by the Playwright Page, so it goes when the
 *   pool drops the page): the latest snapshot id, and the latest page-scope
 *   snapshot record, which is the "before" side of app.act's delta;
 * - per candidate: the locator the ladder verified on the live page for a
 *   (snapshotId, ref), so memory.mint and memory.enrich can tell a verified
 *   locator from one the agent typed, after the page has been observed
 *   again and the ref registry has moved on. Bounded; oldest first out;
 * - per candidate: whether app.act acted on it, which is what memory.mint's
 *   provenance instrument records (app.act, else app.observe).
 */
import type { Page } from '@playwright/test';
import type { ResolvedLocator } from '../../../contract/schemas.js';
import type { SnapshotRecord } from '../../../observe/index.js';

interface PageMemory {
  readonly latestSnapshotId: string;
  /** The latest record observed with scope "page" (deltas compare whole pages). */
  readonly pageRecord?: SnapshotRecord;
}

const pages = new WeakMap<Page, PageMemory>();

/** Remember an observation of a page; a page-scope record also becomes the delta baseline. */
export const rememberSnapshot = (page: Page, record: SnapshotRecord): void => {
  const previous = pages.get(page);
  const pageRecord = record.scope === 'page' ? record : previous?.pageRecord;
  pages.set(page, { latestSnapshotId: record.snapshotId, ...(pageRecord !== undefined ? { pageRecord } : {}) });
};

export const latestSnapshotId = (page: Page): string | undefined => pages.get(page)?.latestSnapshotId;

/** The latest page-scope record of this page, if any. */
export const latestPageRecord = (page: Page): SnapshotRecord | undefined => pages.get(page)?.pageRecord;

// ─── Verified candidate resolutions ────────────────────────────────────────

const MAX_RESOLUTIONS = 512;
const resolutions = new Map<string, ResolvedLocator>();

const keyOf = (snapshotId: string, ref: string): string => `${snapshotId}\u0000${ref}`;

/** Record the locator verified for a snapshot candidate (only verified ones are worth remembering). */
export const rememberResolution = (snapshotId: string, ref: string, resolved: ResolvedLocator): void => {
  if (!resolved.verified) return;
  const key = keyOf(snapshotId, ref);
  resolutions.delete(key);
  resolutions.set(key, resolved);
  while (resolutions.size > MAX_RESOLUTIONS) {
    const oldest = resolutions.keys().next().value;
    if (oldest === undefined) break;
    resolutions.delete(oldest);
  }
};

export const recalledResolution = (snapshotId: string, ref: string): ResolvedLocator | undefined => resolutions.get(keyOf(snapshotId, ref));

// ─── Candidates acted on ───────────────────────────────────────────────────

/** Candidates app.act performed an action on in this process (snapshotId, ref), oldest first out. */
const acted = new Set<string>();

/** Record that app.act acted on a cited candidate (memory.mint's provenance says app.act for it). */
export const rememberActedOn = (snapshotId: string, ref: string): void => {
  const key = keyOf(snapshotId, ref);
  acted.delete(key);
  acted.add(key);
  while (acted.size > MAX_RESOLUTIONS) {
    const oldest = acted.values().next().value;
    if (oldest === undefined) break;
    acted.delete(oldest);
  }
};

export const wasActedOn = (snapshotId: string, ref: string): boolean => acted.has(keyOf(snapshotId, ref));

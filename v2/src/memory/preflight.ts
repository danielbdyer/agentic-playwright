/**
 * The Playwright-bound part of memory: does each facet still resolve on the
 * live page? For every live facet the best locator is built exactly the way
 * the emitted page object builds it, and counted twice — all matches and
 * visible matches (`locator.filter({ visible: true })`; no ElementHandle, no
 * waiting). Exactly one visible match is ok. Otherwise the fallbacks are
 * counted too: if none of the facet's locators matches anything the facet is
 * missing; if something matches (several visible, only hidden ones, or a
 * fallback works where the best does not) it is stale, with the detail.
 * Every locator counted is reported as a resolution attempt so memory's
 * health reflects it (see recordPreflight in the service).
 */
import type { Page } from '@playwright/test';
import { ToolError } from '../core/errors.js';
import type { Facet, FacetLocator, PreflightEntry } from '../contract/schemas.js';
import { locatorParams, renderLocator, toPlaywrightLocator } from '../locator/locator.js';
import { bareLocator } from './ids.js';
import type { ResolutionReport, ResolveOutcome } from './types.js';

export interface PreflightCheck {
  readonly entry: PreflightEntry;
  /** One report per locator counted, ready for recordPreflight. Empty for unchecked facets. */
  readonly attempts: readonly ResolutionReport[];
}

interface Count {
  readonly locator: FacetLocator;
  readonly total: number;
  readonly visible: number;
}

const outcomeOf = (count: Count): ResolveOutcome =>
  count.visible === 1 ? 'ok' : count.visible > 1 ? 'ambiguous' : count.total > 0 ? 'not-visible' : 'not-found';

const countLocator = async (page: Page, locator: FacetLocator, params: Readonly<Record<string, string>> | undefined): Promise<Count> => {
  const spec = bareLocator(locator);
  // The emitted locator (with visibleOnly, when set) decides the visible count;
  // the same locator without that filter tells "hidden only" from "nothing".
  const { visibleOnly: _visibleOnly, ...unfiltered } = spec;
  const [total, visible] = await Promise.all([
    toPlaywrightLocator(page, unfiltered, params).count(),
    toPlaywrightLocator(page, spec, params).filter({ visible: true }).count(),
  ]);
  return { locator, total, visible };
};

const describe = (count: Count): string =>
  count.visible > 1
    ? `ambiguous: ${count.visible} visible matches`
    : count.total > 0
      ? `${count.total} match${count.total === 1 ? '' : 'es'}, none visible`
      : 'no match';

/** Parameters the facet's locators need that `params` does not supply. */
const missingParams = (facet: Facet, params: Readonly<Record<string, string>> | undefined): string[] => {
  const needed = new Set([...(facet.parameter !== undefined && facet.kind === 'row' ? [facet.parameter] : []), ...facet.locators.flatMap((l) => locatorParams(l))]);
  return [...needed].filter((name) => params?.[name] === undefined).sort();
};

const attempt = (facetId: string, count: Count): ResolutionReport => ({
  facetId,
  locator: bareLocator(count.locator),
  outcome: outcomeOf(count),
  matches: count.visible,
  source: 'preflight',
  ...(outcomeOf(count) === 'ok' ? {} : { detail: describe(count) }),
});

const checkFacet = async (page: Page, facet: Facet, params: Readonly<Record<string, string>> | undefined): Promise<PreflightCheck> => {
  const best = facet.locators[0];
  if (best === undefined) {
    return { entry: { id: facet.id, status: 'unchecked', detail: 'facet has no locator' }, attempts: [] };
  }
  const expression = renderLocator(bareLocator(best));
  const missing = missingParams(facet, params);
  if (missing.length > 0) {
    return { entry: { id: facet.id, status: 'unchecked', locator: expression, detail: `needs parameter ${missing.map((m) => `{${m}}`).join(', ')}` }, attempts: [] };
  }
  const first = await countLocator(page, best, params);
  if (first.visible === 1) {
    return { entry: { id: facet.id, status: 'ok', matches: 1, locator: expression }, attempts: [attempt(facet.id, first)] };
  }
  // A fallback that cannot be built or counted (a hand-edited selector that does not
  // parse) is left out rather than hiding what the best locator found.
  const countFallback = async (locator: FacetLocator): Promise<Count | null> => {
    try {
      return await countLocator(page, locator, params);
    } catch (error) {
      if (page.isClosed()) throw error;
      return null;
    }
  };
  const fallbacks = (await Promise.all(facet.locators.slice(1).map(countFallback))).filter((count): count is Count => count !== null);
  const all = [first, ...fallbacks];
  const attempts = all.map((count) => attempt(facet.id, count));
  if (all.every((count) => count.total === 0)) {
    return { entry: { id: facet.id, status: 'missing', matches: 0, locator: expression, detail: 'no locator matches anything' }, attempts };
  }
  const working = fallbacks.find((count) => count.visible === 1);
  const detail = working !== undefined ? `${describe(first)}; fallback ${renderLocator(bareLocator(working.locator))} matches one` : describe(first);
  return { entry: { id: facet.id, status: 'stale', matches: first.visible, locator: expression, detail }, attempts };
};

/**
 * Check facets on a live page. Retired facets are skipped. A facet whose
 * locator cannot be built or counted (a parameter is missing, a hand-edited
 * selector does not parse) is `unchecked` with the reason; a closed page is
 * an error for the whole call.
 */
export const checkFacetsOnPage = async (
  page: Page,
  facets: readonly Facet[],
  params?: Readonly<Record<string, string>>,
): Promise<readonly PreflightCheck[]> => {
  const checks: PreflightCheck[] = [];
  for (const facet of facets.filter((f) => f.status !== 'retired')) {
    try {
      checks.push(await checkFacet(page, facet, params));
    } catch (error) {
      if (page.isClosed()) throw new ToolError('unavailable', 'the page closed during preflight', { facetId: facet.id });
      const message = error instanceof Error ? error.message.split('\n')[0] ?? error.message : String(error);
      checks.push({ entry: { id: facet.id, status: 'unchecked', detail: `could not check: ${message}` }, attempts: [] });
    }
  }
  return checks;
};

/** The contract entries, in order. */
export const preflightEntries = (checks: readonly PreflightCheck[]): PreflightEntry[] => checks.map((check) => check.entry);

export interface PreflightSummary {
  readonly ok: number;
  readonly stale: number;
  readonly missing: number;
  readonly unchecked: number;
}

export const summarizePreflight = (entries: readonly PreflightEntry[]): PreflightSummary => ({
  ok: entries.filter((e) => e.status === 'ok').length,
  stale: entries.filter((e) => e.status === 'stale').length,
  missing: entries.filter((e) => e.status === 'missing').length,
  unchecked: entries.filter((e) => e.status === 'unchecked').length,
});

/** A screen's overall status: missing if any facet is missing, else stale if any is stale (or the fingerprint drifted), else ok. */
export const screenPreflightStatus = (entries: readonly PreflightEntry[], fingerprintChanged: boolean): 'ok' | 'stale' | 'missing' =>
  entries.some((e) => e.status === 'missing') ? 'missing' : entries.some((e) => e.status === 'stale') || fingerprintChanged ? 'stale' : 'ok';

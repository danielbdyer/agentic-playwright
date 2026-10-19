/**
 * memory.preflight: does memory still describe the live app?
 *
 * For each screen (the one asked for, or every screen with a route) the
 * route is opened on one page (the caller's pageId, or a page opened with
 * the profile and its authentication, reused across screens and closed at
 * the end), the app is given time to hydrate, and then:
 *
 * - the page fingerprint is compared with the one recorded for the route
 *   (the first clean preflight records it: a fingerprint taken from a
 *   fresh load of the route compares like with like, where one taken mid-
 *   authoring would count search results as structure);
 * - every live facet's locators are counted on the page (memory's
 *   checkFacetsOnPage), and the results are appended to the evidence log,
 *   where gating marks facets stale once their health falls below the floor.
 *
 * Screen status: unreachable (navigation failed or the route redirected
 * elsewhere, typically to a login page), no-route, missing (a trusted
 * facet matches nothing), stale (any facet stale or missing, or the
 * fingerprint drifted), else ok. A named flow is judged by the facets its
 * recording references.
 */
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ToolError, isToolError } from '../../../core/errors.js';
import { readJson } from '../../../core/fsio.js';
import { redact, redactUrl, redactUrlsIn } from '../../../core/pii.js';
import { FlowRecordingSchema, type Facet, type PreflightEntry } from '../../../contract/schemas.js';
import type { ToolInput, ToolOutput } from '../../../contract/tools.js';
import type { PageHandle } from '../../../browser/types.js';
import {
  assertScreenName,
  checkFacetsOnPage,
  listScreens,
  loadScreen,
  parseFacetId,
  preflightEntries,
  recordPreflight,
  routeDrift,
  setRoute,
  summarizePreflight,
  summaryFromFingerprint,
  type LoadedScreen,
} from '../../../memory/index.js';
import { awaitHydration, buildFingerprint, inPage, navigate } from '../../../observe/index.js';
import { loadProfile, resolveUrl, type Profile } from '../../../workspace/profiles.js';
import type { ToolContext } from '../../types.js';
import { openApp } from './open.js';

type PreflightOutput = ToolOutput<'memory.preflight'>;
type ScreenReport = PreflightOutput['screens'][number];

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;
const FLOW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

const messageOf = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0] ?? String(error);

const unchecked = (facets: readonly Facet[], detail: string): PreflightEntry[] =>
  facets.map((facet) => ({ id: facet.id, status: 'unchecked', detail }));

/** Same path, case-insensitively and ignoring a trailing slash (OutSystems paths are case-insensitive). */
const samePath = (a: string, b: string): boolean => {
  try {
    const norm = (url: string): string => new URL(url).pathname.replace(/\/+$/, '').toLowerCase();
    return norm(a) === norm(b);
  } catch {
    return a === b;
  }
};

/** The page's structural signals, once more after a navigation lands; null when the page will not hold still. */
const readSignals = async (page: Page): Promise<Awaited<ReturnType<typeof inPage<'signals'>>> | null> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await inPage(page, 'signals');
    } catch {
      if (page.isClosed()) throw new ToolError('unavailable', 'the page closed during preflight');
      if (attempt === 1) return null;
      await page.waitForLoadState('domcontentloaded', { timeout: 5_000 }).catch(() => undefined);
    }
  }
  return null;
};

interface PageSession {
  handle: PageHandle | undefined;
  created: boolean;
}

/**
 * The status of a checked screen. A trusted facet that matches nothing is
 * a broken page object; anything else that no longer matches cleanly, or a
 * drifted page structure, is stale.
 */
export const checkedScreenStatus = (
  entries: readonly PreflightEntry[],
  facets: readonly Facet[],
  fingerprintChanged: boolean,
): 'ok' | 'stale' | 'missing' => {
  const statusOf = new Map(facets.map((facet) => [facet.id, facet.status]));
  if (entries.some((entry) => entry.status === 'missing' && statusOf.get(entry.id) === 'trusted')) return 'missing';
  if (fingerprintChanged || entries.some((entry) => entry.status === 'stale' || entry.status === 'missing')) return 'stale';
  return 'ok';
};

/** A flow's preflight status from the entries of the facets its recording references. */
export const flowStatus = (
  name: string,
  facetIds: readonly string[],
  facetEntries: ReadonlyMap<string, PreflightEntry>,
  checkedScreens: ReadonlySet<string>,
): PreflightEntry => {
  if (facetIds.length === 0) return { id: name, status: 'unchecked', detail: 'the flow references no facets' };
  const screens = [...new Set(facetIds.map((id) => parseFacetId(id)?.screen ?? id))];
  const notChecked = screens.filter((screen) => !checkedScreens.has(screen));
  if (notChecked.length > 0) {
    return { id: name, status: 'unchecked', detail: `screen(s) not checked in this preflight: ${notChecked.join(', ')}` };
  }
  const missing = facetIds.filter((id) => facetEntries.get(id) === undefined || facetEntries.get(id)?.status === 'missing');
  const stale = facetIds.filter((id) => facetEntries.get(id)?.status === 'stale');
  if (missing.length > 0) return { id: name, status: 'missing', detail: `facet(s) missing: ${missing.join(', ')}` };
  if (stale.length > 0) return { id: name, status: 'stale', detail: `facet(s) stale: ${stale.join(', ')}` };
  if (facetIds.every((id) => facetEntries.get(id)?.status === 'unchecked')) {
    return { id: name, status: 'unchecked', detail: 'none of its facets could be checked without parameters' };
  }
  return { id: name, status: 'ok' };
};

const readFlow = async (
  ctx: ToolContext,
  name: string,
): Promise<{ readonly facetIds: readonly string[] } | { readonly problem: string }> => {
  if (!FLOW_NAME.test(name)) return { problem: `"${name}" is not a flow name (kebab-case)` };
  const file = path.join(ctx.workspace.paths.recordings, `${name}.json`);
  let raw: unknown;
  try {
    raw = await readJson<unknown>(file);
  } catch (error) {
    return { problem: `.tesseract/flows/${name}.json is unreadable: ${messageOf(error)}` };
  }
  if (raw === null) return { problem: `no recording at .tesseract/flows/${name}.json; record it with flow.record` };
  const parsed = FlowRecordingSchema.safeParse(raw);
  if (!parsed.success) return { problem: `.tesseract/flows/${name}.json is malformed: ${parsed.error.issues[0]?.message ?? 'invalid'}` };
  return { facetIds: [...new Set(parsed.data.steps.flatMap((step) => (step.facetId !== undefined ? [step.facetId] : [])))] };
};

export const runPreflight = async (ctx: ToolContext, input: ToolInput<'memory.preflight'>): Promise<PreflightOutput> => {
  const { workspace } = ctx;
  const memory = { now: ctx.now };
  const names = input.screen !== undefined ? [assertScreenName(input.screen)] : await listScreens(workspace);
  const loaded: LoadedScreen[] = [];
  for (const name of names) loaded.push(await loadScreen(workspace, name, memory));
  if (input.screen !== undefined && loaded[0]?.exists !== true) {
    throw new ToolError('not-found', `no catalog for screen ${input.screen}; mint facets on it first`, { screen: input.screen });
  }
  const targets = input.screen !== undefined ? loaded : loaded.filter((screen) => screen.catalog.route !== undefined);

  const session: PageSession = input.pageId !== undefined ? { handle: ctx.browser.get(input.pageId), created: false } : { handle: undefined, created: false };
  let profile: Profile | null | undefined;
  const profileFor = async (): Promise<Profile | null> => {
    if (profile !== undefined) return profile;
    profile = input.profile !== undefined ? await loadProfile(workspace, input.profile, ctx.env) : session.handle?.profile ?? (await loadProfile(workspace, undefined, ctx.env));
    return profile;
  };
  const addressOf = async (routeUrl: string): Promise<string> => {
    if (ABSOLUTE.test(routeUrl)) return routeUrl;
    const chosen = await profileFor();
    if (chosen !== null) return resolveUrl(routeUrl, chosen);
    const current = session.handle?.page.url();
    if (current !== undefined && /^https?:/i.test(current)) return new URL(routeUrl.replace(/^\/+/, ''), current).toString();
    throw new ToolError('not-configured', `route "${routeUrl}" is relative to the profile baseURL; pass profile (or set TESSERACT_PROFILE)`, { route: routeUrl });
  };

  /**
   * Bring the session's page to the URL; returns it, or the reason it is
   * unreachable. A route that lands on another path (a login redirect) is
   * unreachable; the app's root route may legitimately redirect, so it is not checked.
   */
  const reach = async (url: string, checkRedirect: boolean): Promise<{ readonly page: Page } | { readonly unreachable: string }> => {
    try {
      if (session.handle === undefined) {
        const opened = await openApp(ctx, { url, ...(input.profile !== undefined ? { profile: input.profile } : {}) });
        session.handle = opened.handle;
        session.created = true;
      } else {
        const result = await navigate(session.handle.page, url, { timeoutMs: 30_000 });
        if (result.status !== null && result.status >= 400) return { unreachable: `HTTP ${result.status} from ${redactUrl(url, workspace.config.pii)}` };
        await awaitHydration(session.handle.page, { budgetMs: workspace.config.observe.hydrationBudgetMs });
      }
    } catch (error) {
      if (isToolError(error) && (error.family === 'not-configured' || error.family === 'invalid-input' || error.family === 'not-found')) throw error;
      return { unreachable: redact(redactUrlsIn(messageOf(error), workspace.config.pii), workspace.config.pii) };
    }
    const page = session.handle.page;
    if (checkRedirect && !samePath(page.url(), url)) {
      return { unreachable: `redirected to ${redactUrl(page.url(), workspace.config.pii)} (is the session signed in? check the profile's auth)` };
    }
    return { page };
  };

  const screens: ScreenReport[] = [];
  const facetEntries = new Map<string, PreflightEntry>();
  const checkedScreens = new Set<string>();
  try {
    for (const target of targets) {
      const { screen, catalog } = target;
      const route = catalog.route;
      const live = catalog.facets.filter((facet) => facet.status !== 'retired');
      if (route === undefined) {
        const detail = 'the screen has no route; set one with memory.mint (route)';
        screens.push({ screen, status: 'no-route', fingerprintChanged: false, fingerprintDiff: [], facets: unchecked(live, detail), detail });
        continue;
      }
      const url = await addressOf(route.url);
      const reached = await reach(url, route.url.replace(/^\/+|\/+$/g, '').length > 0);
      if ('unreachable' in reached) {
        ctx.log(`preflight: ${screen} unreachable: ${reached.unreachable}`);
        screens.push({
          screen,
          url: route.url,
          status: 'unreachable',
          fingerprintChanged: false,
          fingerprintDiff: [],
          facets: unchecked(live, `screen unreachable: ${reached.unreachable}`),
          detail: reached.unreachable,
        });
        continue;
      }
      const { page } = reached;
      const signals = await readSignals(page);
      if (signals === null) {
        const detail = `could not read the page at ${redactUrl(page.url(), workspace.config.pii)} (it kept navigating)`;
        screens.push({ screen, url: route.url, status: 'unreachable', fingerprintChanged: false, fingerprintDiff: [], facets: unchecked(live, `screen unreachable: ${detail}`), detail });
        continue;
      }
      const fingerprint = buildFingerprint(signals.fingerprint, page.url(), workspace.config.pii);
      const drift = routeDrift(route, fingerprint);
      const checks = await checkFacetsOnPage(page, live);
      const entries = preflightEntries(checks);
      await recordPreflight(workspace, checks, { pageFingerprint: fingerprint.hash, now: ctx.now });
      const status = checkedScreenStatus(entries, live, drift.changed);
      if (route.fingerprint === undefined && status === 'ok') {
        // The first clean preflight is the baseline later ones compare with.
        await setRoute(
          workspace,
          screen,
          { url: route.url, fingerprint: fingerprint.hash, landmarks: route.landmarks ?? [...fingerprint.landmarks] },
          summaryFromFingerprint(fingerprint),
          memory,
        );
      }
      entries.forEach((entry) => facetEntries.set(entry.id, entry));
      checkedScreens.add(screen);
      screens.push({ screen, url: route.url, status, fingerprintChanged: drift.changed, fingerprintDiff: [...drift.diff], facets: entries });
    }

    const flows: PreflightEntry[] = [];
    for (const name of input.flows ?? []) {
      const flow = await readFlow(ctx, name);
      flows.push('problem' in flow ? { id: name, status: 'missing', detail: flow.problem } : flowStatus(name, flow.facetIds, facetEntries, checkedScreens));
    }
    const summary = summarizePreflight([...screens.flatMap((screen) => screen.facets), ...flows]);
    return { screens, flows, summary: { ...summary } };
  } finally {
    if (session.created && session.handle !== undefined) await ctx.browser.close(session.handle.pageId).catch(() => undefined);
  }
};

/**
 * The memory service: what the memory.* tool handlers (and test.run,
 * review.record, app.act, flow.record) call. Every call that writes runs
 * inside the screen's lock and follows one order:
 *
 *   read catalog + evidence → reconcile human status edits → plan (pure)
 *   → fold → gate (promote / stale) → append evidence → save YAML
 *
 * Evidence is appended before the YAML is saved, so a crash between the two
 * leaves the log as the record. Reads take the same lock; they write only
 * when they find a human status edit to record.
 *
 * Facets returned by this module have their locators ordered (best first)
 * with `health` ("successes/attempts" over the last 20 attempts) and
 * `expression` (the Playwright code) filled in.
 */
import { ToolError } from '../core/errors.js';
import { relativePosix } from '../core/fsio.js';
import { renderLocator } from '../locator/locator.js';
import { FacetSchema, type Facet, type ScoredFacet, type ScreenRoute } from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';
import { catalogFile, listScreens, readScreenFile, writeScreenFile, type ScreenFile } from './catalog-store.js';
import {
  applyGating,
  bestLocator,
  facetHealth,
  foldEvents,
  projectCatalog,
  reconcileHumanEdits,
  type StatsIndex,
} from './derive.js';
import { appendEvents, eventFactory, evidenceFile, evidencePointer, readEvents } from './evidence.js';
import { bareLocator, locatorKeyOf, parseFacetId, assertScreenName, isSlug } from './ids.js';
import { withFileLock } from './lock.js';
import { planEnrich, type EnrichPlanInput } from './enrich.js';
import { planMint, type MintPlanInput } from './mint.js';
import { normalizeRouteUrl } from './route.js';
import { DEFAULT_QUERY_LIMIT, rankScored, scoreFacets } from './score.js';
import type { PreflightCheck } from './preflight.js';
import {
  RESOLVE_OUTCOMES,
  type CatalogRoute,
  type DriftSignal,
  type EventFactory,
  type EvidenceEvent,
  type GatingConfig,
  type MemoryOptions,
  type MemoryQueryInput,
  type ResolutionReport,
  type ResolveOutcome,
  type RouteSummary,
  type ScreenCatalog,
  type StatusChange,
} from './types.js';

// ─── Plumbing ──────────────────────────────────────────────────────────────

export const gatingConfig = (ws: Workspace): GatingConfig => ({
  promoteAfterPasses: ws.config.promoteAfterPasses,
  staleHealthFloor: ws.config.staleHealthFloor,
  staleMinAttempts: ws.config.staleMinAttempts,
});

interface ScreenState {
  readonly screen: string;
  readonly file: ScreenFile;
  /** Projected (ordered locators, health strings) and with pending reconciliation applied. */
  readonly catalog: ScreenCatalog;
  readonly stats: StatsIndex;
  /** Status events reconciling human YAML edits, not yet appended. */
  readonly pending: readonly EvidenceEvent[];
  readonly warnings: readonly string[];
}

interface Committed {
  readonly catalog: ScreenCatalog;
  readonly stats: StatsIndex;
  readonly changes: readonly StatusChange[];
}

const openState = async (ws: Workspace, screen: string, makeEvent: EventFactory): Promise<ScreenState> => {
  const file = await readScreenFile(ws, screen);
  const { events, skipped } = await readEvents(ws, screen);
  const base = foldEvents(events);
  const pending = reconcileHumanEdits(file.catalog, base, makeEvent);
  const stats = foldEvents(pending, base);
  return {
    screen,
    file,
    catalog: projectCatalog(file.catalog, stats, ws.config.staleHealthFloor),
    stats,
    pending,
    warnings: [
      ...file.warnings,
      ...(skipped > 0 ? [`${relativePosix(ws.paths.root, evidenceFile(ws, screen))}: ${skipped} unreadable line(s) skipped`] : []),
    ],
  };
};

/** Gate, then append evidence (first), then save the YAML (last). */
const commit = async (
  ws: Workspace,
  state: ScreenState,
  catalog: ScreenCatalog,
  events: readonly EvidenceEvent[],
  makeEvent: EventFactory,
): Promise<Committed> => {
  const gated = applyGating(catalog, foldEvents(events, state.stats), gatingConfig(ws), makeEvent);
  const projected = projectCatalog(gated.catalog, gated.stats, ws.config.staleHealthFloor);
  await appendEvents(ws, state.screen, [...state.pending, ...events, ...gated.events]);
  const empty = !state.file.exists && projected.facets.length === 0 && projected.route === undefined;
  if (!empty) await writeScreenFile(ws, projected, state.file.text);
  return { catalog: projected, stats: gated.stats, changes: gated.changes };
};

/** One operation, one instant: its events and any provenance it mints share the time read once at its start. */
const instantOf = (options: MemoryOptions): Date => (options.now ?? (() => new Date()))();

interface Plan {
  readonly catalog: ScreenCatalog;
  readonly events: readonly EvidenceEvent[];
}

/** Run a pure plan against a screen inside its lock and commit it. */
const mutate = async <P extends Plan>(
  ws: Workspace,
  screen: string,
  options: MemoryOptions,
  plan: (state: ScreenState, makeEvent: EventFactory, now: Date) => P,
): Promise<{ readonly plan: P; readonly committed: Committed; readonly state: ScreenState }> =>
  withFileLock(catalogFile(ws, screen), async () => {
    const now = instantOf(options);
    const makeEvent = eventFactory(() => now);
    const state = await openState(ws, screen, makeEvent);
    const planned = plan(state, makeEvent, now);
    const committed = await commit(ws, state, planned.catalog, planned.events, makeEvent);
    return { plan: planned, committed, state };
  });

/** Read a screen inside its lock; records (and commits) human status edits if it finds any. */
const readState = async (ws: Workspace, screen: string, options: MemoryOptions): Promise<ScreenState> =>
  withFileLock(catalogFile(ws, screen), async () => {
    const now = instantOf(options);
    const makeEvent = eventFactory(() => now);
    const state = await openState(ws, screen, makeEvent);
    if (state.pending.length === 0) return state;
    const committed = await commit(ws, state, state.catalog, [], makeEvent);
    return { ...state, catalog: committed.catalog, stats: committed.stats, pending: [] };
  });

/** Group facet ids (or things carrying them) by screen; malformed ids are returned separately. */
const groupByScreen = <T>(items: readonly T[], idOf: (item: T) => string): { readonly groups: ReadonlyMap<string, readonly T[]>; readonly malformed: readonly string[] } => {
  const groups = new Map<string, T[]>();
  const malformed: string[] = [];
  for (const item of items) {
    const parsed = parseFacetId(idOf(item));
    if (parsed === null || !isSlug(parsed.screen)) {
      malformed.push(idOf(item));
      continue;
    }
    groups.set(parsed.screen, [...(groups.get(parsed.screen) ?? []), item]);
  }
  return { groups: new Map([...groups.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))), malformed };
};

const unique = (values: readonly string[]): string[] => [...new Set(values)];

// ─── Presentation ──────────────────────────────────────────────────────────

/** A facet as tools return it: each locator carries its rendered Playwright expression. */
export const presentFacet = (facet: Facet): Facet => ({
  ...facet,
  locators: facet.locators.map((locator) => ({ ...locator, expression: renderLocator(bareLocator(locator)) })),
});

const round = (value: number): number => Math.round(value * 1000) / 1000;

const presentScored = (facet: ScoredFacet): ScoredFacet => ({
  ...(presentFacet(facet) as ScoredFacet),
  score: round(facet.score),
  phraseScore: round(facet.phraseScore),
  locatorHealth: round(facet.locatorHealth),
});

/** The contract's ScreenRoute (the stored summary stays internal). */
export const contractRoute = (route: CatalogRoute): ScreenRoute => ({
  url: route.url,
  ...(route.variant !== undefined ? { variant: route.variant } : {}),
  ...(route.fingerprint !== undefined ? { fingerprint: route.fingerprint } : {}),
  ...(route.title !== undefined ? { title: route.title } : {}),
});

// ─── Reading ───────────────────────────────────────────────────────────────

export { listScreens };

export interface LoadedScreen {
  readonly screen: string;
  /** Absolute path of the catalog file. */
  readonly file: string;
  readonly exists: boolean;
  /** Locators ordered and health strings current; includes retired facets. */
  readonly catalog: ScreenCatalog;
  readonly stats: StatsIndex;
  readonly warnings: readonly string[];
}

/** Load one screen's catalog (an empty catalog when the screen is unseen). Throws malformed-response for a broken file. */
export const loadScreen = async (ws: Workspace, screen: string, options: MemoryOptions = {}): Promise<LoadedScreen> => {
  const state = await readState(ws, assertScreenName(screen), options);
  return { screen, file: state.file.file, exists: state.file.exists, catalog: state.catalog, stats: state.stats, warnings: state.warnings };
};

/** A facet by id, or null when it is not in memory (or the id is malformed). */
export const findFacet = async (ws: Workspace, facetId: string, options: MemoryOptions = {}): Promise<Facet | null> => {
  const parsed = parseFacetId(facetId);
  if (parsed === null || !isSlug(parsed.screen)) return null;
  const state = await readState(ws, parsed.screen, options);
  const facet = state.catalog.facets.find((f) => f.id === facetId);
  return facet === undefined ? null : presentFacet(facet);
};

/** Facets by id across screens, in the order asked (duplicates once); ids not in memory are listed in `missing`. */
export const facetsByIds = async (
  ws: Workspace,
  ids: readonly string[],
  options: MemoryOptions = {},
): Promise<{ readonly facets: readonly Facet[]; readonly missing: readonly string[] }> => {
  const wanted = unique(ids);
  const { groups, malformed } = groupByScreen(wanted, (id) => id);
  const found = new Map<string, Facet>();
  for (const [screen, screenIds] of groups) {
    const state = await readState(ws, screen, options);
    for (const id of screenIds) {
      const facet = state.catalog.facets.find((f) => f.id === id);
      if (facet !== undefined) found.set(id, presentFacet(facet));
    }
  }
  return {
    facets: wanted.flatMap((id) => (found.has(id) ? [found.get(id)!] : [])),
    missing: [...malformed, ...wanted.filter((id) => !malformed.includes(id) && !found.has(id))],
  };
};

export interface MemoryQueryResult {
  readonly facets: readonly ScoredFacet[];
  /** For a named screen: it has a catalog. For an all-screens query: any screen has one. */
  readonly screenKnown: boolean;
  /** The named screen's route, or (all screens) the route of the top result's screen. */
  readonly route?: ScreenRoute;
  readonly warnings: readonly string[];
}

/**
 * memory.query. Scores every live facet of the screen (or of every screen,
 * with IDF computed per screen) and returns at most `limit` (default 8)
 * scoring above 0.3, best first, trusted before candidate at equal score.
 * An all-screens query skips (and warns about) a malformed catalog; a named
 * screen's malformed catalog is a malformed-response error.
 */
export const queryMemory = async (ws: Workspace, input: MemoryQueryInput, options: MemoryOptions = {}): Promise<MemoryQueryResult> => {
  const limit = Math.min(20, Math.max(1, Math.trunc(input.limit ?? DEFAULT_QUERY_LIMIT)));
  const screens = input.screen !== undefined ? [assertScreenName(input.screen)] : await listScreens(ws);
  const warnings: string[] = [];
  const states: ScreenState[] = [];
  for (const screen of screens) {
    try {
      const state = await readState(ws, screen, options);
      warnings.push(...state.warnings);
      if (state.file.exists) states.push(state);
    } catch (error) {
      if (input.screen !== undefined) throw error;
      warnings.push(`screen ${screen} skipped: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const scoring = { phrase: input.phrase, ...(input.kind !== undefined ? { kind: input.kind } : {}), ...(input.landmark !== undefined ? { landmark: input.landmark } : {}) };
  const scored = states.flatMap((state) => scoreFacets(scoring, state.catalog.facets, (facet) => facetHealth(facet, state.stats[facet.id])));
  const ranked = rankScored(scored, limit);
  const routeScreen = input.screen ?? ranked[0]?.screen;
  const route = states.find((state) => state.screen === routeScreen)?.catalog.route;
  return {
    facets: ranked.map(presentScored),
    screenKnown: states.length > 0,
    ...(route !== undefined ? { route: contractRoute(route) } : {}),
    warnings,
  };
};

// ─── Writing: catalog and route ────────────────────────────────────────────

const withRoute = (
  catalog: ScreenCatalog,
  route: ScreenRoute,
  summary: RouteSummary | undefined,
  makeEvent: EventFactory,
): { readonly catalog: ScreenCatalog; readonly events: readonly EvidenceEvent[] } => {
  const url = normalizeRouteUrl(route.url);
  const previous = catalog.route;
  // Absent fields keep their values while the URL stays the same; a new URL starts clean.
  const keep = previous !== undefined && previous.url === url ? previous : undefined;
  const fingerprint = route.fingerprint ?? keep?.fingerprint;
  const keptSummary = keep !== undefined && keep.fingerprint === fingerprint ? keep.summary : undefined;
  const next: CatalogRoute = {
    url,
    ...((route.variant ?? keep?.variant) !== undefined ? { variant: route.variant ?? keep?.variant } : {}),
    ...((route.title ?? keep?.title) !== undefined ? { title: route.title ?? keep?.title } : {}),
    ...(fingerprint !== undefined ? { fingerprint } : {}),
    ...((summary ?? keptSummary) !== undefined ? { summary: summary ?? keptSummary } : {}),
  };
  const unchanged = JSON.stringify(contractRoute(next)) === JSON.stringify(previous === undefined ? null : contractRoute(previous)) &&
    JSON.stringify(next.summary) === JSON.stringify(previous?.summary);
  if (unchanged) return { catalog, events: [] };
  return {
    catalog: { ...catalog, route: next },
    events: [
      makeEvent({
        kind: 'route',
        url,
        ...(next.fingerprint !== undefined ? { fingerprint: next.fingerprint } : {}),
        ...(next.summary !== undefined ? { summary: { ...next.summary, landmarks: [...next.summary.landmarks], interactiveRoles: { ...next.summary.interactiveRoles } } } : {}),
      }),
    ],
  };
};

/**
 * Set a screen's route (creating the screen's catalog if needed). The URL is
 * stored relative to the profile baseURL without a leading slash, or
 * absolute. Pass the fingerprint's summary (summaryFromFingerprint) so
 * preflight can report what drifted.
 */
export const setRoute = async (
  ws: Workspace,
  screen: string,
  route: ScreenRoute,
  summary?: RouteSummary,
  options: MemoryOptions = {},
): Promise<CatalogRoute> => {
  const { committed } = await mutate(ws, assertScreenName(screen), options, (state, makeEvent) => withRoute(state.catalog, route, summary, makeEvent));
  return committed.catalog.route!;
};

/**
 * Replace a screen's catalog wholesale (for importers and the CLI; tools use
 * mint and enrich). Status differences from what the log recorded are
 * recorded as human edits, since they bypassed the tool rules.
 */
export const saveScreen = async (ws: Workspace, catalog: ScreenCatalog, options: MemoryOptions = {}): Promise<ScreenCatalog> => {
  const screen = assertScreenName(catalog.screen);
  for (const facet of catalog.facets) {
    const checked = FacetSchema.safeParse(facet);
    if (!checked.success) throw new ToolError('invalid-input', `facet ${facet.id}: ${checked.error.issues[0]?.message ?? 'invalid'}`, { facetId: facet.id });
    if (parseFacetId(facet.id)?.screen !== screen || facet.screen !== screen) {
      throw new ToolError('invalid-input', `facet ${facet.id} does not belong to screen ${screen}`, { facetId: facet.id });
    }
  }
  if (new Set(catalog.facets.map((f) => f.id)).size !== catalog.facets.length) throw new ToolError('invalid-input', `duplicate facet ids in ${screen}`);
  const route = catalog.route === undefined ? undefined : { ...catalog.route, url: normalizeRouteUrl(catalog.route.url) };
  const { committed } = await mutate(ws, screen, options, (state, makeEvent) => {
    const next: ScreenCatalog = {
      screen,
      ...(route !== undefined ? { route } : {}),
      facets: [...catalog.facets].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((f) => ({ ...f, locators: f.locators.map(({ expression: _e, ...l }) => l) })),
    };
    return { catalog: next, events: reconcileHumanEdits(next, state.stats, makeEvent) };
  });
  return committed.catalog;
};

// ─── Writing: mint and enrich ──────────────────────────────────────────────

export interface MintInput extends MintPlanInput {
  /** Also set the screen's route (memory.mint's `route`). */
  readonly route?: ScreenRoute;
  readonly routeSummary?: RouteSummary;
}

export interface MintResult {
  readonly facet: Facet;
  /** False when an equivalent facet already existed and the mint folded into it. */
  readonly created: boolean;
  /** Dropped aliases, an unverified locator, catalog warnings. */
  readonly warnings: readonly string[];
}

/**
 * memory.mint. The caller loads the evidence candidate from the snapshot
 * (and fails with stale-snapshot when it is gone) and passes the verified
 * locator when it has one. Conflicts are ToolError('conflict') with
 * `detail.existingId` (and `detail.hint: 'memory.enrich'` when the locator
 * already belongs to another facet).
 */
export const mintFacet = async (ws: Workspace, input: MintInput, options: MemoryOptions = {}): Promise<MintResult> => {
  const screen = assertScreenName(input.screen);
  const { plan, committed, state } = await mutate(ws, screen, options, (current, makeEvent, now) => {
    const minted = planMint(current.catalog, input, {
      pii: ws.config.pii,
      now: now.toISOString(),
      makeEvent,
      pointer: (eventId) => evidencePointer(ws, screen, eventId),
    });
    if (input.route === undefined) return minted;
    const routed = withRoute(minted.catalog, input.route, input.routeSummary, makeEvent);
    return { ...minted, catalog: routed.catalog, events: [...minted.events, ...routed.events] };
  });
  const facet = committed.catalog.facets.find((f) => f.id === plan.facet.id) ?? plan.facet;
  return { facet: presentFacet(facet), created: plan.created, warnings: [...state.warnings, ...plan.warnings] };
};

export type EnrichInput = EnrichPlanInput;

export interface EnrichResult {
  readonly facet: Facet;
  /** Human-readable list of what changed (empty when nothing did). */
  readonly changes: readonly string[];
}

/** memory.enrich. Unknown id → not-found; retired → conflict; a locator another facet owns → conflict. */
export const enrichFacet = async (ws: Workspace, input: EnrichInput, options: MemoryOptions = {}): Promise<EnrichResult> => {
  const parsed = parseFacetId(input.facetId);
  if (parsed === null || !isSlug(parsed.screen)) {
    throw new ToolError('not-found', `no facet ${input.facetId}: facet ids are "<screen>:<name>"`, { facetId: input.facetId });
  }
  const { plan, committed } = await mutate(ws, parsed.screen, options, (state, makeEvent) =>
    planEnrich(state.catalog, input, { pii: ws.config.pii, makeEvent }),
  );
  const facet = committed.catalog.facets.find((f) => f.id === plan.facet.id) ?? plan.facet;
  const gated = committed.changes.filter((c) => c.facetId === facet.id).map((c) => `status: ${c.from} → ${c.to} (${c.reason})`);
  return { facet: presentFacet(facet), changes: [...plan.changes, ...gated] };
};

// ─── Writing: evidence from use ────────────────────────────────────────────

export interface ResolutionResult {
  /** Status transitions the new evidence caused (stale after the health floor, promotions). */
  readonly changes: readonly StatusChange[];
  /** Trusted facets whose locator failed: the drift a test run or repair should surface. */
  readonly drift: readonly DriftSignal[];
  /** Facet ids not in memory, or with no locator to attribute the attempt to. */
  readonly unknown: readonly string[];
}

const LOCATOR_FAILURES: ReadonlySet<ResolveOutcome> = new Set(['not-found', 'ambiguous', 'not-visible']);

const driftOf = (facet: Facet, outcome: ResolveOutcome, locator: string): DriftSignal[] =>
  facet.status === 'trusted' && LOCATOR_FAILURES.has(outcome) ? [{ facetId: facet.id, outcome, locator }] : [];

/**
 * Record resolution attempts (from app.act, app.assert, flow.run, test.run,
 * preflight). Each appends a `resolved` event against the locator tried
 * (default: the facet's best), then gating runs: a facet whose best locator
 * falls below the health floor goes stale.
 */
export const recordResolutions = async (
  ws: Workspace,
  reports: readonly ResolutionReport[],
  options: MemoryOptions = {},
): Promise<ResolutionResult> => {
  const { groups, malformed } = groupByScreen(reports, (report) => report.facetId);
  const changes: StatusChange[] = [];
  const drift: DriftSignal[] = [];
  const unknown: string[] = [...malformed];
  for (const [screen, screenReports] of groups) {
    const { plan, committed } = await mutate(ws, screen, options, (state, makeEvent) => {
      const outcome = screenReports.map((report) => {
        const facet = state.catalog.facets.find((f) => f.id === report.facetId);
        const locator = report.locator ?? (facet !== undefined ? bestLocator(facet) : undefined);
        if (facet === undefined || locator === undefined) return { unknown: [report.facetId], events: [], drift: [] };
        const event = makeEvent({
          kind: 'resolved',
          facetId: facet.id,
          locatorKey: locatorKeyOf(locator),
          outcome: report.outcome,
          ...(report.matches !== undefined ? { matches: report.matches } : {}),
          source: report.source,
          ...(report.runId !== undefined ? { runId: report.runId } : {}),
          ...(report.pageFingerprint !== undefined ? { pageFingerprint: report.pageFingerprint } : {}),
          ...(report.detail !== undefined ? { detail: report.detail } : {}),
        });
        return { unknown: [], events: [event], drift: driftOf(facet, report.outcome, renderLocator(bareLocator(locator))) };
      });
      return {
        catalog: state.catalog,
        events: outcome.flatMap((o) => o.events),
        unknown: outcome.flatMap((o) => o.unknown),
        drift: outcome.flatMap((o) => o.drift),
      };
    });
    changes.push(...committed.changes);
    drift.push(...plan.drift);
    unknown.push(...plan.unknown);
  }
  return { changes, drift, unknown: unique(unknown) };
};

export interface TestRunInput {
  readonly runId: string;
  readonly testCaseId: string;
  /** Every facet the test references. */
  readonly facetIds: readonly string[];
  readonly outcome: 'passed' | 'failed';
  /** The facet in the failing step, when the failure is attributable to one. */
  readonly failedFacet?: string;
  /** The failure's error family; only locator families (not-found, ambiguous, not-visible) count against the facet. */
  readonly failureFamily?: string;
}

export interface TestRunResult extends ResolutionResult {
  /** Facets promoted to trusted by this run. */
  readonly promoted: readonly string[];
  /** Facets marked stale by this run. */
  readonly staled: readonly string[];
}

const isOutcome = (value: string | undefined): value is ResolveOutcome =>
  value !== undefined && (RESOLVE_OUTCOMES as readonly string[]).includes(value);

/**
 * Record one test run. A pass counts toward promotion for every facet the
 * test uses and is a successful resolution of each one's best locator; a
 * failure with a locator family is a failed resolution of the failing
 * facet's best locator and blocks its promotion until its locator changes.
 */
export const recordTestRun = async (ws: Workspace, input: TestRunInput, options: MemoryOptions = {}): Promise<TestRunResult> => {
  const ids = unique([...input.facetIds, ...(input.failedFacet !== undefined ? [input.failedFacet] : [])]);
  const { groups, malformed } = groupByScreen(ids, (id) => id);
  const changes: StatusChange[] = [];
  const drift: DriftSignal[] = [];
  const unknown: string[] = [...malformed];
  for (const [screen, screenIds] of groups) {
    const { plan, committed } = await mutate(ws, screen, options, (state, makeEvent) => {
      const facets = screenIds.map((id) => state.catalog.facets.find((f) => f.id === id));
      const known = facets.filter((f): f is Facet => f !== undefined);
      if (known.length === 0) return { catalog: state.catalog, events: [], unknown: screenIds, drift: [] };
      const failed = known.find((f) => f.id === input.failedFacet);
      const runEvent = makeEvent({
        kind: 'test-run',
        facetIds: known.map((f) => f.id),
        testCaseId: input.testCaseId,
        runId: input.runId,
        outcome: input.outcome,
        ...(failed !== undefined ? { failedFacet: failed.id } : {}),
        ...(input.failureFamily !== undefined ? { failureFamily: input.failureFamily } : {}),
      });
      const resolutionFor = (facet: Facet, outcome: ResolveOutcome): EvidenceEvent[] => {
        const locator = bestLocator(facet);
        return locator === undefined
          ? []
          : [makeEvent({ kind: 'resolved', facetId: facet.id, locatorKey: locatorKeyOf(locator), outcome, source: 'run', runId: input.runId })];
      };
      const family = input.failureFamily;
      const resolved =
        input.outcome === 'passed'
          ? known.flatMap((facet) => resolutionFor(facet, 'ok'))
          : failed !== undefined && isOutcome(family) && family !== 'ok'
            ? resolutionFor(failed, family)
            : [];
      const failedLocator = failed !== undefined ? bestLocator(failed) : undefined;
      return {
        catalog: state.catalog,
        events: [runEvent, ...resolved],
        unknown: screenIds.filter((id) => !known.some((f) => f.id === id)),
        drift:
          failed !== undefined && failedLocator !== undefined && isOutcome(family)
            ? driftOf(failed, family, renderLocator(bareLocator(failedLocator)))
            : [],
      };
    });
    changes.push(...committed.changes);
    drift.push(...plan.drift);
    unknown.push(...plan.unknown);
  }
  return {
    changes,
    drift,
    unknown: unique(unknown),
    promoted: changes.filter((c) => c.to === 'trusted').map((c) => c.facetId),
    staled: changes.filter((c) => c.to === 'stale').map((c) => c.facetId),
  };
};

export interface AcceptanceInput {
  readonly testCaseId: string;
  readonly facetIds: readonly string[];
  readonly reviewer: string;
  readonly decision: 'accept' | 'accept-with-edit' | 'reject';
  /** From the review rules (accept-with-edit counts only for small edits). Default: true unless rejected. */
  readonly countsAsAccepted?: boolean;
}

export interface AcceptanceResult {
  /** Candidate facets promoted to trusted (AcceptanceReceipt.facetsPromoted). */
  readonly promoted: readonly string[];
  readonly unknown: readonly string[];
}

/** review.record: an accepted test promotes the candidate facets it uses. A rejection (or an edit too large to count) records nothing here. */
export const recordAcceptance = async (ws: Workspace, input: AcceptanceInput, options: MemoryOptions = {}): Promise<AcceptanceResult> => {
  if (input.decision === 'reject' || input.countsAsAccepted === false) return { promoted: [], unknown: [] };
  const decision = input.decision;
  const { groups, malformed } = groupByScreen(unique(input.facetIds), (id) => id);
  const promoted: string[] = [];
  const unknown: string[] = [...malformed];
  for (const [screen, screenIds] of groups) {
    const { plan, committed } = await mutate(ws, screen, options, (state, makeEvent) => {
      const known = screenIds.filter((id) => state.catalog.facets.some((f) => f.id === id));
      return {
        catalog: state.catalog,
        events: known.length === 0 ? [] : [makeEvent({ kind: 'accepted', facetIds: known, testCaseId: input.testCaseId, reviewer: input.reviewer, decision })],
        unknown: screenIds.filter((id) => !known.includes(id)),
      };
    });
    promoted.push(...committed.changes.filter((c) => c.to === 'trusted').map((c) => c.facetId));
    unknown.push(...plan.unknown);
  }
  return { promoted, unknown: unique(unknown) };
};

export interface PreflightRecordOptions extends MemoryOptions {
  readonly runId?: string;
  /** The live page's fingerprint hash, stored on each resolution event. */
  readonly pageFingerprint?: string;
}

export interface PreflightRecordResult extends ResolutionResult {
  /** Facets newly marked stale by this preflight. */
  readonly staled: readonly string[];
}

/**
 * Append preflight results (from checkFacetsOnPage) as resolution events and
 * apply gating. A facet's preflight misses count against its health only
 * after preflight has once seen it resolve, so facets that exist only after
 * an action (search results, an open dialog) are not staled by a landing-page
 * check.
 */
export const recordPreflight = async (
  ws: Workspace,
  checks: readonly PreflightCheck[],
  options: PreflightRecordOptions = {},
): Promise<PreflightRecordResult> => {
  const reports = checks.flatMap((check) =>
    check.attempts.map((attempt) => ({
      ...attempt,
      ...(options.runId !== undefined ? { runId: options.runId } : {}),
      ...(options.pageFingerprint !== undefined ? { pageFingerprint: options.pageFingerprint } : {}),
    })),
  );
  const result = await recordResolutions(ws, reports, options);
  return { ...result, staled: result.changes.filter((c) => c.to === 'stale').map((c) => c.facetId) };
};

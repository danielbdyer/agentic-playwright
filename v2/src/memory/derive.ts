/**
 * Confidence on read. Everything memory believes about a facet (locator
 * health, passes since its locator last changed, whether a human accepted a
 * test that uses it, its last recorded status) is a pure fold over the
 * evidence log. Replaying the same events always gives the same stats.
 *
 * Health is per locator over a sliding window of the last 20 attempts: the
 * window is the aging mechanism, so old successes cannot hide new failures.
 * A locator with no attempts counts as healthy (1.0) — it has not failed.
 *
 * A locator memory.enrich adds is pinned first (the contract's "placed
 * first"): it is the one the page object emits and the next run exercises,
 * even while the locator it replaces is still above the health floor. The
 * pin lasts until that locator records a failure of its own; then ordering
 * by health and ladder rank takes over again.
 *
 * One test.run is one run: however many receipts it has for a facet (data
 * rows, projects), it counts at most one pass and one failure, and it is a
 * pass only when every one of them passed.
 */
import { ToolError } from '../core/errors.js';
import type { Facet, FacetLocator, FacetStatus, LocatorSpec, LocatorStrategy } from '../contract/schemas.js';
import { locatorKeyOf } from './ids.js';
import type { EvidenceEvent, EventFactory, GatingConfig, ResolveOutcome, ScreenCatalog, StatusChange, StatusEvent, StatusReason } from './types.js';

export const HEALTH_WINDOW = 20;

// ─── Stats ─────────────────────────────────────────────────────────────────

export interface LocatorWindow {
  /** Most recent last; true is a success. At most HEALTH_WINDOW entries. */
  readonly outcomes: readonly boolean[];
}

export interface FacetStats {
  readonly facetId: string;
  /** Event id of the facet's (latest) minted event. */
  readonly mintedEventId?: string;
  readonly locators: Readonly<Record<string, LocatorWindow>>;
  /** Passing test runs since the facet's locator or status last changed. */
  readonly passesSinceChange: number;
  /** Failing test runs attributed to this facet since its locator or status last changed. */
  readonly failuresSinceChange: number;
  /** A human accepted a test using this facet since its locator or status last changed. */
  readonly acceptedSinceChange: boolean;
  /** The status the log last recorded: a status event's `to`, or candidate after minting. */
  readonly lastStatus?: FacetStatus;
  /** Preflight has seen this facet resolve at least once (see foldResolved). */
  readonly seenByPreflight: boolean;
  readonly lastVerifiedAt?: string;
  readonly runs: number;
  readonly passes: number;
  /** Key of the locator memory.enrich last added, kept first until it fails (see orderLocators). */
  readonly pinnedLocator?: string;
  /** How the latest test.run counted for this facet, so its other receipts do not count again. */
  readonly lastRun?: RunCount;
  /**
   * Set by a tool status event the catalog YAML may not show yet: the status
   * the file had (`from` of the first such event) and the hash of the file
   * text that commit read. Cleared by a human status event.
   */
  readonly unsaved?: UnsavedStatus;
}

export interface RunCount {
  readonly runId: string;
  /** Every receipt of the run that used the facet passed (so far). */
  readonly passed: boolean;
  /** A failure of the run was counted against the facet. */
  readonly against: boolean;
}

export interface UnsavedStatus {
  readonly from: FacetStatus;
  readonly fileBefore: string;
}

export type StatsIndex = Readonly<Record<string, FacetStats>>;

export const emptyStats = (facetId: string): FacetStats => ({
  facetId,
  locators: {},
  passesSinceChange: 0,
  failuresSinceChange: 0,
  acceptedSinceChange: false,
  seenByPreflight: false,
  runs: 0,
  passes: 0,
});

const statsOf = (index: StatsIndex, facetId: string): FacetStats => index[facetId] ?? emptyStats(facetId);

const put = (index: StatsIndex, stats: FacetStats): StatsIndex => ({ ...index, [stats.facetId]: stats });

const resetSinceChange = (stats: FacetStats): FacetStats => ({
  ...stats,
  passesSinceChange: 0,
  failuresSinceChange: 0,
  acceptedSinceChange: false,
});

/** Failure families that say the locator is at fault. Anything else (an assertion mismatch, an environment timeout) is not the facet's failure. */
const LOCATOR_FAILURE_FAMILIES = new Set(['not-found', 'ambiguous', 'not-visible']);

/** An unattributed failure (no family) counts against the facet: unknown failures should not promote it. */
export const failureCountsAgainstFacet = (family: string | undefined): boolean =>
  family === undefined || LOCATOR_FAILURE_FAMILIES.has(family);

/** not-enabled says the element was found but disabled: the app's state, not the locator's health. */
const isNeutral = (outcome: ResolveOutcome): boolean => outcome === 'not-enabled';

const pushOutcome = (window: LocatorWindow | undefined, ok: boolean): LocatorWindow => ({
  outcomes: [...(window?.outcomes ?? []), ok].slice(-HEALTH_WINDOW),
});

const foldResolved = (index: StatsIndex, event: Extract<EvidenceEvent, { kind: 'resolved' }>): StatsIndex => {
  const stats = statsOf(index, event.facetId);
  if (isNeutral(event.outcome)) return index;
  const ok = event.outcome === 'ok';
  // Preflight loads the route's landing state. A facet that only exists after
  // an action (search results, an open dialog) is absent there by design, so
  // preflight misses count against health only once preflight has seen the
  // facet resolve at least once.
  if (event.source === 'preflight' && !ok && !stats.seenByPreflight) return index;
  // The pinned locator keeps its place until it fails itself.
  const { pinnedLocator, ...rest } = stats;
  const unpinned = !ok && pinnedLocator === event.locatorKey;
  return put(index, {
    ...(unpinned ? rest : stats),
    locators: { ...stats.locators, [event.locatorKey]: pushOutcome(stats.locators[event.locatorKey], ok) },
    seenByPreflight: stats.seenByPreflight || (event.source === 'preflight' && ok),
    ...(ok ? { lastVerifiedAt: event.at } : {}),
  });
};

/**
 * One facet's share of a test-run event. The first receipt of a run counts
 * the run; later receipts of the same run only make it worse: a failure turns
 * a counted pass into a failed run, and the first failure against the facet
 * counts once.
 */
const foldTestRun = (stats: FacetStats, event: Extract<EvidenceEvent, { kind: 'test-run' }>): FacetStats => {
  const passed = event.outcome === 'passed';
  const against = !passed && stats.facetId === event.failedFacet && failureCountsAgainstFacet(event.failureFamily);
  const prior = stats.lastRun;
  if (prior === undefined || prior.runId !== event.runId) {
    return {
      ...stats,
      runs: stats.runs + 1,
      passes: stats.passes + (passed ? 1 : 0),
      passesSinceChange: stats.passesSinceChange + (passed ? 1 : 0),
      failuresSinceChange: stats.failuresSinceChange + (against ? 1 : 0),
      lastRun: { runId: event.runId, passed, against },
    };
  }
  const undoPass = prior.passed && !passed;
  const addFailure = against && !prior.against;
  return {
    ...stats,
    passes: stats.passes - (undoPass ? 1 : 0),
    passesSinceChange: Math.max(0, stats.passesSinceChange - (undoPass ? 1 : 0)),
    failuresSinceChange: stats.failuresSinceChange + (addFailure ? 1 : 0),
    lastRun: { runId: event.runId, passed: prior.passed && passed, against: prior.against || against },
  };
};

const foldStatus = (index: StatsIndex, event: Extract<EvidenceEvent, { kind: 'status' }>): StatsIndex => {
  const { unsaved, ...stats } = resetSinceChange(statsOf(index, event.facetId));
  // A human status edit is a fresh start: the human looked, so the health
  // window that led to the old status no longer speaks for the facet. It was
  // read from the file, so the file shows it.
  if (event.by === 'human') return put(index, { ...stats, lastStatus: event.to, locators: {} });
  // A tool status change the file may not show yet: remember what the file
  // said before it (the earliest such status, while the file text is the same).
  const pending: UnsavedStatus | undefined =
    event.fileBefore === undefined
      ? undefined
      : unsaved !== undefined && unsaved.fileBefore === event.fileBefore
        ? unsaved
        : { from: event.from, fileBefore: event.fileBefore };
  return put(index, { ...stats, lastStatus: event.to, ...(pending !== undefined ? { unsaved: pending } : {}) });
};

/** One step of the fold. Unknown facets start from empty stats. */
export const foldEvent = (index: StatsIndex, event: EvidenceEvent): StatsIndex => {
  switch (event.kind) {
    case 'minted':
      // A (re)mint is a new facet identity: earlier history under the same id does not carry over.
      return put(index, { ...emptyStats(event.facetId), mintedEventId: event.eventId, lastStatus: 'candidate' });
    case 'enriched': {
      const stats = statsOf(index, event.facetId);
      const first = event.locatorAdded?.key ?? event.locatorFirst;
      if (first === undefined) return put(index, stats);
      // memory.enrich places its locator first, new or known (a re-mint's new locator only joins the facet).
      return put(index, { ...resetSinceChange(stats), ...(event.via === 'enrich' ? { pinnedLocator: first } : {}) });
    }
    case 'resolved':
      return foldResolved(index, event);
    case 'test-run':
      return event.facetIds.reduce((acc, facetId) => put(acc, foldTestRun(statsOf(acc, facetId), event)), index);
    case 'accepted':
      return event.facetIds.reduce((acc, facetId) => put(acc, { ...statsOf(acc, facetId), acceptedSinceChange: true }), index);
    case 'status':
      return foldStatus(index, event);
    case 'route':
      return index;
    case 'id-migration': {
      const from = index[event.from];
      if (from === undefined) return index;
      const { [event.from]: _moved, ...rest } = index;
      return { ...rest, [event.to]: { ...from, facetId: event.to } };
    }
    default: {
      const never: never = event;
      return never;
    }
  }
};

export const foldEvents = (events: readonly EvidenceEvent[], initial: StatsIndex = {}): StatsIndex => events.reduce(foldEvent, initial);

// ─── Health ────────────────────────────────────────────────────────────────

export interface LocatorHealth {
  readonly successes: number;
  readonly attempts: number;
  /** successes / attempts; 1 when there are no attempts. */
  readonly rate: number;
  /** 4·r·(1−r): 0 for always or never, 1 for a coin flip (lifted from v1). */
  readonly flakiness: number;
}

/** Lifted from v1 `healthFromCounts`, with the zero-attempt rule changed to 1.0. */
export const healthFromCounts = (successes: number, attempts: number): LocatorHealth => {
  if (!Number.isInteger(successes) || !Number.isInteger(attempts) || successes < 0 || attempts < 0) {
    throw new ToolError('invalid-input', `health counts must be non-negative integers (successes ${successes}, attempts ${attempts})`);
  }
  if (successes > attempts) throw new ToolError('invalid-input', `successes (${successes}) cannot exceed attempts (${attempts})`);
  const rate = attempts === 0 ? 1 : successes / attempts;
  return { successes, attempts, rate, flakiness: attempts === 0 ? 0 : 4 * rate * (1 - rate) };
};

export const windowHealth = (window: LocatorWindow | undefined): LocatorHealth => {
  const outcomes = window?.outcomes ?? [];
  return healthFromCounts(outcomes.filter(Boolean).length, outcomes.length);
};

export const locatorHealth = (stats: FacetStats | undefined, locator: LocatorSpec): LocatorHealth =>
  windowHealth(stats?.locators[locatorKeyOf(locator)]);

/** The YAML projection: "successes/attempts" over the window. */
export const healthString = (health: LocatorHealth): string => `${health.successes}/${health.attempts}`;

/**
 * The health that speaks for a facet: its best locator by rate, ties broken
 * by more attempts (stronger evidence), then stored order. A facet with no
 * locators (a route facet) is healthy.
 */
export const facetHealthWindow = (facet: Pick<Facet, 'locators'>, stats: FacetStats | undefined): LocatorHealth => {
  const healths = facet.locators.map((locator) => locatorHealth(stats, locator));
  return healths.reduce<LocatorHealth | null>(
    (best, h) => (best === null || h.rate > best.rate || (h.rate === best.rate && h.attempts > best.attempts) ? h : best),
    null,
  ) ?? healthFromCounts(0, 0);
};

/** Max locator rate over the facet's current locators; 1 when it has none. */
export const facetHealth = (facet: Pick<Facet, 'locators'>, stats: FacetStats | undefined): number =>
  facetHealthWindow(facet, stats).rate;

// ─── Locator order ─────────────────────────────────────────────────────────

/** The locator ladder, best first. The page object emits the first locator. */
export const LADDER: readonly LocatorStrategy[] = ['role-name', 'label', 'placeholder', 'text', 'test-id', 'css', 'row-text'];

export const ladderRank = (strategy: LocatorStrategy): number => {
  const rank = LADDER.indexOf(strategy);
  return rank === -1 ? LADDER.length : rank;
};

/**
 * The pinned locator (the one memory.enrich last added, until it fails)
 * first; then healthy locators (rate ≥ floor), then by ladder rank; a stable
 * sort, so among equals the existing order wins.
 */
export const orderLocators = <L extends LocatorSpec>(
  locators: readonly L[],
  rateOf: (locator: L) => number,
  floor: number,
  pinnedKey?: string,
): L[] =>
  locators
    .map((locator, index) => ({
      locator,
      index,
      pinned: pinnedKey !== undefined && locatorKeyOf(locator) === pinnedKey ? 0 : 1,
      healthy: rateOf(locator) >= floor ? 0 : 1,
      rank: ladderRank(locator.strategy),
    }))
    .sort((a, b) => a.pinned - b.pinned || a.healthy - b.healthy || a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.locator);

/** The locator a page object emits: the first of an ordered facet. Facets this module returns are already ordered. */
export const bestLocator = (facet: Pick<Facet, 'locators'>): FacetLocator | undefined => facet.locators[0];

/**
 * The catalog as it should be shown and stored: each facet's locators ordered
 * by current health and their `health` strings rewritten from the evidence.
 */
export const projectFacet = (facet: Facet, stats: FacetStats | undefined, floor: number): Facet => {
  const withHealth = facet.locators.map((locator) => ({ ...locator, health: healthString(locatorHealth(stats, locator)) }));
  return { ...facet, locators: orderLocators(withHealth, (locator) => locatorHealth(stats, locator).rate, floor, stats?.pinnedLocator) };
};

export const projectCatalog = (catalog: ScreenCatalog, stats: StatsIndex, floor: number): ScreenCatalog => ({
  ...catalog,
  facets: catalog.facets.map((facet) => projectFacet(facet, stats[facet.id], floor)),
});

// ─── Gating ────────────────────────────────────────────────────────────────

export interface Transition {
  readonly to: FacetStatus;
  readonly reason: Extract<StatusReason, 'accepted' | 'passes' | 'health-floor'>;
}

/**
 * The one promotion rule (vision §5.4): a candidate becomes trusted when a
 * human accepts a test that uses it, or after N passing runs with no failure
 * since its locator last changed. Any live facet whose best locator falls
 * below the health floor (with enough attempts to mean it) becomes stale.
 * Retired is a human decision and is never left automatically; stale is left
 * only by a repair (enrich with a new locator, or one moved first) or a human
 * edit.
 */
export const nextStatus = (facet: Facet, stats: FacetStats | undefined, config: GatingConfig): Transition | null => {
  if (facet.status === 'retired') return null;
  const s = stats ?? emptyStats(facet.id);
  const health = facetHealthWindow(facet, s);
  if (facet.status !== 'stale' && health.attempts >= config.staleMinAttempts && health.rate < config.staleHealthFloor) {
    return { to: 'stale', reason: 'health-floor' };
  }
  if (facet.status === 'candidate' && s.acceptedSinceChange) return { to: 'trusted', reason: 'accepted' };
  if (facet.status === 'candidate' && s.passesSinceChange >= config.promoteAfterPasses && s.failuresSinceChange === 0) {
    return { to: 'trusted', reason: 'passes' };
  }
  return null;
};

export interface GatingResult {
  readonly catalog: ScreenCatalog;
  readonly stats: StatsIndex;
  readonly events: readonly StatusEvent[];
  readonly changes: readonly StatusChange[];
}

/** Apply nextStatus to every facet once (one pass reaches a fixpoint: a transition resets the counters it consumed). */
export const applyGating = (catalog: ScreenCatalog, stats: StatsIndex, config: GatingConfig, makeEvent: EventFactory): GatingResult =>
  catalog.facets.reduce<GatingResult>(
    (acc, facet) => {
      const transition = nextStatus(facet, acc.stats[facet.id], config);
      if (transition === null) return acc;
      const event = makeEvent({ kind: 'status', facetId: facet.id, from: facet.status, to: transition.to, reason: transition.reason, by: 'tool' });
      return {
        catalog: { ...acc.catalog, facets: acc.catalog.facets.map((f) => (f.id === facet.id ? { ...f, status: transition.to } : f)) },
        stats: foldEvent(acc.stats, event),
        events: [...acc.events, event],
        changes: [...acc.changes, { facetId: facet.id, from: facet.status, to: transition.to, reason: transition.reason }],
      };
    },
    { catalog, stats, events: [], changes: [] },
  );

/**
 * Statuses the log recorded but the catalog file never received: a commit
 * appends its status events, then writes the YAML, and that write can fail
 * (a rename refused while an editor holds the file, a full disk). A facet
 * whose file status is still the one the tool changed it from, in a file
 * whose text is exactly what that commit read, was not edited by a human:
 * the log wins. `fileHash` is sha256Hex of the file text as read ('' when
 * there is no file).
 */
export const restoreUnsavedStatuses = (catalog: ScreenCatalog, stats: StatsIndex, fileHash: string): ScreenCatalog => ({
  ...catalog,
  facets: catalog.facets.map((facet) => {
    const s = stats[facet.id];
    const unsaved = s?.unsaved;
    const logged = s?.lastStatus;
    return unsaved !== undefined && logged !== undefined && unsaved.fileBefore === fileHash && facet.status === unsaved.from && logged !== facet.status
      ? { ...facet, status: logged }
      : facet;
  }),
});

/**
 * Human status edits in the YAML, as status events: when a facet's status in
 * the file differs from the last status the log recorded (candidate for a
 * facet the log has never seen), the file wins and the log records it. Run
 * restoreUnsavedStatuses first, so a write that never landed is not taken
 * for an edit.
 */
export const reconcileHumanEdits = (catalog: ScreenCatalog, stats: StatsIndex, makeEvent: EventFactory): readonly StatusEvent[] =>
  catalog.facets.flatMap((facet) => {
    const recorded = stats[facet.id]?.lastStatus ?? 'candidate';
    return recorded === facet.status
      ? []
      : [makeEvent({ kind: 'status', facetId: facet.id, from: recorded, to: facet.status, reason: 'human', by: 'human' })];
  });

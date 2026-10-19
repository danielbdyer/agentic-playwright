/**
 * The flow recorder, Node side: attach to a page, receive what the user
 * does from the in-page script, turn each action into a step on a facet,
 * and stop when asked.
 *
 * Per page, once: the `__tesseractRecord` binding and the in-page script as
 * an init script (so every document the page loads reports), plus an
 * immediate install on the current document. Per recording: a session with
 * a random token (events from an earlier recording on the same page are
 * ignored), the stop conditions, and a queue.
 *
 * Events are processed one at a time, in arrival order:
 *
 *   evidence  the (snapshotId, ref) the element had when the user touched
 *             it, if it was registered; else, if the element is still in
 *             the page, its ref in the snapshot registered now (observing
 *             first if it is in none); else the in-page description alone;
 *   locator   verified on the live page with observe's locator ladder when
 *             the element is still attached; otherwise derived (unverified)
 *             from the candidate by memory;
 *   facet     minted as a candidate (provenance flow.record + flow name) on
 *             the screen of the URL the event happened on, or an equivalent
 *             existing facet reused;
 *   then the page settles and the next snapshot is taken (unless more
 *   events are already waiting).
 *
 * The recorder observes with the same walker as app.observe, which
 * registers refs in the page. When an agent drives the page with app.act
 * while recording, the snapshot the agent registered is put back after
 * each of the recorder's own observations, so the agent's refs stay valid.
 */
import { randomBytes } from 'node:crypto';
import type { Frame, Page } from '@playwright/test';
import type { Candidate, FlowRecordingSpec, ResolvedLocator } from '../contract/schemas.js';
import { ToolError, isToolError } from '../core/errors.js';
import { slugify } from '../core/text.js';
import { memberTable } from '../emit/index.js';
import {
  findFacet,
  loadScreen,
  mintFacet,
  setRoute,
  summaryFromFingerprint,
  isSlug,
  type MintDraft,
} from '../memory/index.js';
import {
  loadSnapshot,
  observePage,
  resolveCandidateLocator,
  saveSnapshotRecord,
  settle,
  toCandidate,
  type SnapshotRecord,
  type WalkNode,
} from '../observe/index.js';
import { screenNameFromUrl } from '../resolve/index.js';
import type { Workspace } from '../workspace/workspace.js';
import {
  LocateResultSchema,
  NOT_LOCATED,
  RecorderMessageSchema,
  type ActionEvent,
  type Descriptor,
  type LocateResult,
  type RecorderConfig,
} from './events.js';
import { RECORDER_BINDING, RECORDER_SCRIPT, recorderCall } from './in-page.js';
import { EMPTY_DRAFT, appendStep, assertFlowName, isWebUrl, markNavigation, relativeToBase, routeUrlOf, samePath, type RecordingDraft, type StepInput } from './recording.js';

export type StopOn = 'manual' | 'urlChange' | 'steps';
export type StopReason = 'manual' | 'urlChange' | 'steps' | 'timeout' | 'closed';

export const DEFAULT_RECORD_TIMEOUT_MS = 10 * 60_000;
/** A navigation this long after the last recorded action was not caused by it: it becomes a navigate step. */
export const NAVIGATION_GRACE_MS = 3_000;
/** After the URL path changes (stopOn urlChange), events still in flight from the old document get this long to arrive. */
export const URL_CHANGE_GRACE_MS = 400;
const SETTLE_BUDGET_MS = 3_000;
const VERIFY_BUDGET_MS = 5_000;
const IN_PAGE_BUDGET_MS = 3_000;

export interface RecordOptions {
  readonly workspace: Workspace;
  readonly page: Page;
  readonly pageId: string;
  readonly name: string;
  /** Profile baseURL: screen names, routes and step URLs are relative to it. */
  readonly baseURL: string | null;
  /** Screen name for facets on the start page (other pages derive theirs from the URL). */
  readonly screen?: string;
  readonly stopOn: StopOn;
  /** Stop after this many recorded actions (required for stopOn "steps"; a cap otherwise). */
  readonly maxSteps?: number;
  readonly timeoutMs?: number;
  /** Accessible names (or labels, placeholders, name/id attributes) of fields whose values become secret parameters. */
  readonly redact?: readonly string[];
  /** Show the in-page Stop button; default: stopOn is "manual". */
  readonly stopButton?: boolean;
  readonly session?: string;
  readonly now?: () => Date;
  readonly log?: (message: string) => void;
}

export interface RecordedFlow {
  readonly recording: FlowRecordingSpec;
  readonly stoppedBy: StopReason;
  /** Facets this recording created. */
  readonly facetsMinted: readonly string[];
  /** Every facet the steps use (created or reused). */
  readonly facetsUsed: readonly string[];
  /** Actions recorded (the opening navigation is not one). */
  readonly actions: number;
  /** Snapshots the recorder took. */
  readonly snapshots: readonly string[];
  /** Events that could not become steps, and why. */
  readonly warnings: readonly string[];
}

export interface RecordingSession {
  /** Resolves once the page reports and the first snapshot is taken: act on the page after this. */
  readonly ready: Promise<void>;
  readonly done: Promise<RecordedFlow>;
  /** Stop from Node (as if the Stop button was pressed). */
  readonly stop: () => void;
}

// ─── Per page: binding and init script, installed once ─────────────────────

interface ActiveRecording {
  readonly token: string;
  readonly config: () => RecorderConfig;
  readonly onAction: (event: ActionEvent) => void;
  readonly onStop: () => void;
  readonly ready: Promise<void>;
}

const active = new WeakMap<Page, ActiveRecording>();
const installed = new WeakMap<Page, Promise<void>>();

const install = (page: Page): Promise<void> => {
  const existing = installed.get(page);
  if (existing !== undefined) return existing;
  const pending = (async (): Promise<void> => {
    await page.exposeBinding(RECORDER_BINDING, (source: { readonly frame: Frame }, raw: unknown): RecorderConfig | null => {
      if (source.frame !== page.mainFrame()) return { active: false };
      const parsed = RecorderMessageSchema.safeParse(raw);
      if (!parsed.success) return null;
      const recording = active.get(page);
      const message = parsed.data;
      switch (message.type) {
        case 'hello':
          return recording?.config() ?? { active: false };
        case 'stop':
          if (recording !== undefined && message.token === recording.token) recording.onStop();
          return null;
        case 'action':
          if (recording !== undefined && message.token === recording.token) recording.onAction(message);
          return null;
        default:
          return null;
      }
    });
    await page.addInitScript(RECORDER_SCRIPT);
  })();
  installed.set(page, pending);
  pending.catch(() => installed.delete(page));
  return pending;
};

/** Resolves once a recording on `page` is ready (or at once when none is starting). For app.act to call before acting. */
export const recorderReady = async (page: Page): Promise<void> => {
  await active.get(page)?.ready;
};

/** Wait until a recording has started on `page` and is ready (tests, and anything that starts a recording elsewhere). */
export const waitForRecording = async (page: Page, timeoutMs = 15_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (active.get(page) === undefined) {
    if (Date.now() > deadline) throw new ToolError('timeout', 'no recording started on the page');
    if (page.isClosed()) throw new ToolError('not-found', 'the page closed before a recording started');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  await active.get(page)?.ready;
};

/** Whether a recording is running on `page`. */
export const isRecording = (page: Page): boolean => active.has(page);

// ─── Helpers ───────────────────────────────────────────────────────────────

const withTimeout = <T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> =>
  new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    timer.unref();
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });

const evaluateQuietly = async (page: Page, expression: string): Promise<unknown> => {
  if (page.isClosed()) return undefined;
  return withTimeout(page.evaluate(expression), IN_PAGE_BUDGET_MS, undefined);
};

const normalized = (text: string | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim().toLowerCase();

const REDACTION = /^<[a-z-]+>$/;

/** The words a facet minted from this candidate is named by. */
export const displayNameOf = (candidate: Candidate): string => {
  const usable = (text: string | undefined): string | null => {
    const trimmed = (text ?? '').replace(/\s+/g, ' ').trim();
    return trimmed.length > 0 && !REDACTION.test(trimmed) ? trimmed : null;
  };
  const designerId = candidate.id !== undefined && candidate.idKind !== 'structural' ? candidate.id.replace(/[_-]+/g, ' ') : undefined;
  return usable(candidate.name) ?? usable(candidate.placeholder) ?? usable(candidate.testId) ?? usable(designerId) ?? `${candidate.role.length > 0 ? candidate.role : candidate.tag} control`;
};

/** A snapshot-shaped candidate for an element no snapshot registered, from its in-page description (PII-gated like observe). */
export const candidateFromDescriptor = (descriptor: Descriptor, ref: string, pii: Workspace['config']['pii']): Candidate => {
  const node: WalkNode = {
    ref,
    role: descriptor.role,
    name: descriptor.name.slice(0, 120),
    namingSource: descriptor.namingSource,
    affordance: descriptor.affordance,
    interactive: descriptor.interactive,
    category: descriptor.category,
    tag: descriptor.tag,
    visible: descriptor.visible,
    inViewport: descriptor.visible,
    enabled: true,
    ...(descriptor.landmark !== undefined ? { landmark: descriptor.landmark } : {}),
    ...(descriptor.landmarkName !== undefined ? { landmarkName: descriptor.landmarkName.slice(0, 80) } : {}),
    ...(descriptor.dataBlock !== undefined ? { dataBlock: descriptor.dataBlock } : {}),
    ...(descriptor.rowText !== undefined ? { rowText: descriptor.rowText.slice(0, 160) } : {}),
    ...(descriptor.testId !== undefined ? { testId: descriptor.testId } : {}),
    ...(descriptor.testIdAttribute !== undefined ? { testIdAttribute: descriptor.testIdAttribute } : {}),
    ...(descriptor.id !== undefined ? { id: descriptor.id } : {}),
    ...(descriptor.idKind !== undefined ? { idKind: descriptor.idKind } : {}),
    ...(descriptor.placeholder !== undefined ? { placeholder: descriptor.placeholder } : {}),
    ...(descriptor.inputType !== undefined ? { inputType: descriptor.inputType } : {}),
  };
  return toCandidate(node, pii);
};

/** Screen name for a URL: the explicit one on the start page, else derived from the path relative to baseURL. */
export const screenFor = (url: string, baseURL: string | null, start: { readonly url: string; readonly screen?: string }): string => {
  if (start.screen !== undefined && samePath(url, start.url)) return start.screen;
  const derived = screenNameFromUrl(url, baseURL ?? undefined);
  if (isSlug(derived)) return derived;
  const slug = slugify(derived);
  return isSlug(slug) ? slug : 'home';
};

const rowTexts = (locator: ResolvedLocator['locator'] | undefined): string | undefined => locator?.scope?.rowText;

interface Evidence {
  readonly snapshotId: string;
  readonly candidate: Candidate;
  readonly verified?: ResolvedLocator;
}

interface FacetRef {
  readonly id: string;
  readonly created: boolean;
}

// ─── The session ───────────────────────────────────────────────────────────

/**
 * Start recording on a page. The returned session's `ready` resolves when
 * the page reports and the first snapshot exists; `done` resolves with the
 * recording when a stop condition fires. Nothing is written to
 * .tesseract/flows/ here (see persistFlow); facets, routes, snapshots, and
 * evidence are.
 */
export const startRecording = (options: RecordOptions): RecordingSession => {
  const { workspace, page, pageId, baseURL } = options;
  const name = assertFlowName(options.name);
  if (options.stopOn === 'steps' && options.maxSteps === undefined) {
    throw new ToolError('invalid-input', 'stopOn "steps" needs maxSteps');
  }
  if (options.screen !== undefined && !isSlug(options.screen)) {
    throw new ToolError('invalid-input', `screen must be kebab-case: ${JSON.stringify(options.screen)}`);
  }
  if (active.has(page)) throw new ToolError('invalid-input', `a recording is already running on page ${pageId}; stop it first`);
  if (page.isClosed()) throw new ToolError('not-found', `page ${pageId} is closed`);

  const now = options.now ?? ((): Date => new Date());
  const log = options.log ?? ((): void => undefined);
  const pii = workspace.config.pii;
  const token = randomBytes(12).toString('hex');
  const maxSteps = options.maxSteps;
  const timeoutMs = options.timeoutMs ?? DEFAULT_RECORD_TIMEOUT_MS;
  const config: RecorderConfig = {
    active: true,
    token,
    redact: [...(options.redact ?? [])],
    stopButton: options.stopButton ?? options.stopOn === 'manual',
  };
  const startUrl = page.url();
  const start = { url: startUrl, ...(options.screen !== undefined ? { screen: options.screen } : {}) };
  const screenOf = (url: string): string => screenFor(url, baseURL, start);

  // Session state. Mutated only by the sequential event processor and the stop handlers.
  let draft: RecordingDraft = EMPTY_DRAFT;
  let actions = 0;
  let stopReason: StopReason | null = null;
  let pending = 0;
  let lastActionAt = 0;
  let lastUrl = startUrl;
  let latest: SnapshotRecord | null = null;
  const own: string[] = [];
  const records = new Map<string, SnapshotRecord | null>();
  /** First snapshot per screen, with the raw URL it was taken at (routes are set from these). */
  const firstByScreen = new Map<string, { readonly record: SnapshotRecord; readonly url: string }>();
  const facetByElement = new Map<string, FacetRef>();
  const minted: string[] = [];
  const warnings: string[] = [];

  let resolveStopped: (reason: StopReason) => void = () => undefined;
  const stopped = new Promise<StopReason>((resolve) => {
    resolveStopped = resolve;
  });
  const requestStop = (reason: StopReason): void => {
    if (stopReason !== null) return;
    stopReason = reason;
    resolveStopped(reason);
  };

  let markReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve) => {
    markReady = resolve;
  });
  let chain: Promise<void> = ready;

  // ─── in-page calls ─────────────────────────────────────────────────────

  const locate = async (event: ActionEvent): Promise<LocateResult> => {
    const raw = await evaluateQuietly(page, recorderCall('locate', event.doc, event.seq));
    const parsed = LocateResultSchema.safeParse(raw);
    return parsed.success ? parsed.data : NOT_LOCATED;
  };

  /** Run fn with the recorder's observations; afterwards put back a snapshot someone else had registered. */
  const keepingRegistry = async <T>(fn: () => Promise<T>): Promise<T> => {
    await evaluateQuietly(page, recorderCall('hold'));
    try {
      return await fn();
    } finally {
      await evaluateQuietly(page, recorderCall('release', own));
    }
  };

  const recordFor = async (snapshotId: string): Promise<SnapshotRecord | null> => {
    if (records.has(snapshotId)) return records.get(snapshotId) ?? null;
    const loaded = await loadSnapshot(workspace, snapshotId).catch(() => null);
    records.set(snapshotId, loaded);
    return loaded;
  };

  const candidateIn = async (snapshotId: string | null, ref: string | null): Promise<{ readonly snapshotId: string; readonly candidate: Candidate } | null> => {
    if (snapshotId === null || ref === null) return null;
    const record = await recordFor(snapshotId);
    const candidate = record?.candidates.find((c) => c.ref === ref);
    return candidate === undefined ? null : { snapshotId, candidate };
  };

  /** Observe and save (the caller decides whether the registry is kept). */
  const takeSnapshot = async (): Promise<SnapshotRecord | null> => {
    if (page.isClosed()) return null;
    const url = page.url();
    try {
      const { record } = await observePage(page, {
        pageId,
        maxCandidates: workspace.config.observe.maxCandidates,
        maxAriaBytes: workspace.config.observe.maxAriaBytes,
        pii,
        now,
      });
      const saved = await saveSnapshotRecord(workspace, record);
      own.push(saved.record.snapshotId);
      records.set(saved.record.snapshotId, saved.record);
      latest = saved.record;
      if (isWebUrl(url)) {
        const screen = screenOf(url);
        if (!firstByScreen.has(screen)) firstByScreen.set(screen, { record: saved.record, url });
      }
      return saved.record;
    } catch (error) {
      log(`flow.record: snapshot failed: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
      return null;
    }
  };

  const verify = (snapshotId: string, ref: string): Promise<ResolvedLocator | undefined> =>
    withTimeout<ResolvedLocator | undefined>(resolveCandidateLocator(page, snapshotId, ref), VERIFY_BUDGET_MS, undefined);

  // ─── evidence and facets ───────────────────────────────────────────────

  const evidenceFor = async (event: ActionEvent): Promise<Evidence | null> => {
    const fromEvent = await candidateIn(event.snapshotId, event.ref);
    return keepingRegistry(async () => {
      let live = page.isClosed() ? NOT_LOCATED : await locate(event);
      if (live.attached && live.ref === null && fromEvent === null) {
        await takeSnapshot();
        live = await locate(event);
      }
      const verified = live.attached && live.ref !== null && live.snapshotId !== null ? await verify(live.snapshotId, live.ref) : undefined;
      const chosen = fromEvent ?? (await candidateIn(live.snapshotId, live.ref));
      const withVerified = (snapshotId: string, candidate: Candidate): Evidence => ({ snapshotId, candidate, ...(verified !== undefined ? { verified } : {}) });
      if (chosen !== null) return withVerified(chosen.snapshotId, chosen.candidate);
      if (event.descriptor !== null) {
        return withVerified(latest?.snapshotId ?? 'unobserved', candidateFromDescriptor(event.descriptor, `recorded-${event.seq}`, pii));
      }
      return null;
    });
  };

  /** The same element under an existing id: same role, name and landmark, and not a different row. */
  const sameElement = async (existingId: string, evidence: Evidence): Promise<boolean> => {
    const existing = await findFacet(workspace, existingId, { now });
    if (existing === null || existing.status === 'retired') return false;
    const role = existing.role ?? existing.locators[0]?.role;
    if (role !== evidence.candidate.role) return false;
    const names = [existing.displayName, ...existing.aliases].map(normalized);
    if (!names.includes(normalized(displayNameOf(evidence.candidate)))) return false;
    if ((existing.scope?.landmark ?? undefined) !== evidence.candidate.landmark) return false;
    const theirRow = rowTexts(existing.locators[0]);
    const ourRow = rowTexts(evidence.verified?.locator);
    return theirRow === undefined || ourRow === undefined || theirRow === ourRow;
  };

  const mint = async (screen: string, evidence: Evidence): Promise<FacetRef | null> => {
    const displayName = displayNameOf(evidence.candidate);
    const placeholder = evidence.candidate.placeholder?.trim();
    const base: MintDraft = {
      displayName,
      ...(placeholder !== undefined && placeholder.length > 0 && normalized(placeholder) !== normalized(displayName) && !REDACTION.test(placeholder) ? { aliases: [placeholder] } : {}),
    };
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const draftFacet: MintDraft = attempt === 1 ? base : { ...base, name: `${slugify(displayName, 50)}-${attempt}` };
      try {
        const result = await mintFacet(
          workspace,
          {
            screen,
            draft: draftFacet,
            candidate: evidence.candidate,
            snapshotId: evidence.snapshotId,
            ...(evidence.verified !== undefined ? { verified: evidence.verified } : {}),
            provenance: { instrument: 'flow.record', flow: name, ...(options.session !== undefined ? { session: options.session } : {}) },
          },
          { now },
        );
        return { id: result.facet.id, created: result.created };
      } catch (error) {
        if (!isToolError(error) || error.family !== 'conflict') throw error;
        const existingId = typeof error.detail?.existingId === 'string' ? error.detail.existingId : undefined;
        if (existingId !== undefined && (error.detail?.hint === 'memory.enrich' || (await sameElement(existingId, evidence)))) {
          return { id: existingId, created: false };
        }
      }
    }
    return null;
  };

  const facetFor = async (event: ActionEvent, screen: string): Promise<FacetRef | null> => {
    if (event.element !== null) {
      const known = facetByElement.get(event.element);
      if (known !== undefined) return known;
    }
    const evidence = await evidenceFor(event);
    if (evidence === null) return null;
    const facet = await mint(screen, evidence);
    if (facet !== null && event.element !== null) facetByElement.set(event.element, facet);
    if (facet?.created === true) minted.push(facet.id);
    return facet;
  };

  const memberOf = async (facetId: string, screen: string): Promise<string | undefined> => {
    const loaded = await loadScreen(workspace, screen, { now }).catch(() => null);
    return loaded === null ? undefined : memberTable(loaded.catalog.facets).get(facetId)?.name;
  };

  // ─── processing ────────────────────────────────────────────────────────

  const capReached = (): boolean => maxSteps !== undefined && actions >= maxSteps;

  const afterStep = async (): Promise<void> => {
    if (capReached()) {
      requestStop('steps');
      return;
    }
    // More events already waiting were captured against the current registry; observe after the last of them.
    if (stopReason !== null || pending > 1 || page.isClosed()) return;
    await keepingRegistry(async () => {
      await settle(page, { budgetMs: SETTLE_BUDGET_MS }).catch(() => undefined);
      await takeSnapshot();
    });
  };

  /** Add a step; `counted` is false for the opening navigation, which is not a user action. */
  const append = (input: StepInput, counted = true): void => {
    const next = appendStep(draft, input);
    draft = next.draft;
    if (counted && !next.merged) actions += 1;
  };

  const processAction = async (event: ActionEvent): Promise<void> => {
    if (capReached()) return;
    if (options.stopOn === 'urlChange' && !samePath(event.url, startUrl)) return;
    const screen = screenOf(event.url);
    const url = relativeToBase(event.url, baseURL);
    const needsFacet = event.action !== 'press' || event.descriptor !== null;
    const facet = needsFacet ? await facetFor(event, screen).catch((error: unknown) => {
      warnings.push(`step ${event.action} at ${url}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }) : null;
    if (needsFacet && facet === null) {
      if (event.action !== 'press') {
        warnings.push(`a ${event.action} on ${event.descriptor?.name ?? 'an element'} could not be given a facet; it was left out`);
        return;
      }
    }
    const facetScreen = facet?.id.split(':')[0] ?? screen;
    const base = { screen: facetScreen, url, ...(facet !== null ? { facetId: facet.id } : {}) };
    const snapshotId = event.snapshotId ?? latest?.snapshotId;
    const withSnapshot = snapshotId !== undefined ? { snapshotId } : {};
    switch (event.action) {
      case 'fill': {
        const member = facet === null ? undefined : await memberOf(facet.id, facetScreen);
        append({
          action: 'fill',
          ...base,
          ...withSnapshot,
          ...(member !== undefined ? { member } : {}),
          fill: event.secret === true ? { secret: true } : { value: event.value ?? '' },
        });
        break;
      }
      case 'select':
        append({ action: 'select', ...base, ...withSnapshot, literal: event.value ?? '' });
        break;
      case 'press':
        append({ action: 'press', ...base, ...withSnapshot, literal: event.key ?? 'Enter' });
        break;
      default:
        append({ action: event.action, ...base, ...withSnapshot });
    }
    await afterStep();
  };

  const processNavigation = async (url: string): Promise<void> => {
    if (capReached()) return;
    append({ action: 'navigate', screen: screenOf(url), url: relativeToBase(url, baseURL) });
    await afterStep();
  };

  const enqueue = (work: () => Promise<void>): void => {
    pending += 1;
    chain = chain
      .then(work)
      .catch((error: unknown) => {
        warnings.push(error instanceof Error ? error.message : String(error));
        log(`flow.record: ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
      })
      .finally(() => {
        pending -= 1;
      });
  };

  const onAction = (event: ActionEvent): void => {
    if (stopReason !== null) return;
    if (options.stopOn === 'urlChange' && !samePath(event.url, startUrl)) return;
    lastActionAt = Date.now();
    enqueue(() => processAction(event));
  };

  const onFrameNavigated = (frame: Frame): void => {
    if (frame !== page.mainFrame() || stopReason !== null) return;
    const url = frame.url();
    if (url === lastUrl || !isWebUrl(url)) return;
    lastUrl = url;
    const causedByAction = Date.now() - lastActionAt <= NAVIGATION_GRACE_MS;
    // Queued behind the action that caused it, so the mark lands on that step.
    if (causedByAction) enqueue(async () => { draft = markNavigation(draft, relativeToBase(url, baseURL)); });
    if (options.stopOn === 'urlChange') {
      if (!samePath(url, startUrl)) setTimeout(() => requestStop('urlChange'), URL_CHANGE_GRACE_MS).unref();
      return;
    }
    if (!causedByAction) enqueue(() => processNavigation(url));
  };
  const onClose = (): void => requestStop('closed');

  // ─── lifecycle ─────────────────────────────────────────────────────────

  const routes = async (screens: readonly string[]): Promise<void> => {
    for (const screen of screens) {
      const first = firstByScreen.get(screen);
      if (first === undefined) continue;
      const { record, url } = first;
      try {
        await setRoute(
          workspace,
          screen,
          {
            url: routeUrlOf(url, baseURL),
            variant: record.variant,
            fingerprint: record.fingerprint.hash,
            title: record.title,
            landmarks: [...record.fingerprint.landmarks],
          },
          summaryFromFingerprint(record.fingerprint),
          { now },
        );
      } catch (error) {
        warnings.push(`route for ${screen}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  };

  const run = async (): Promise<RecordedFlow> => {
    await install(page);
    page.on('framenavigated', onFrameNavigated);
    page.once('close', onClose);
    const timer = setTimeout(() => requestStop('timeout'), timeoutMs);
    timer.unref();
    try {
      await evaluateQuietly(page, RECORDER_SCRIPT);
      await evaluateQuietly(page, recorderCall('configure', config));
      const first = await keepingRegistry(takeSnapshot);
      if (isWebUrl(startUrl)) {
        append({
          action: 'navigate',
          screen: screenOf(startUrl),
          url: relativeToBase(startUrl, baseURL),
          ...(first !== null ? { snapshotId: first.snapshotId } : {}),
        }, false);
      }
      markReady();
      const reason = await stopped;
      // Drain: every event that arrived before the stop is processed.
      let drained: Promise<void> | null = null;
      while (drained !== chain) {
        drained = chain;
        await chain;
      }
      const screens = [...new Set(draft.steps.map((step) => step.screen))];
      await routes(screens);
      const recording: FlowRecordingSpec = {
        name,
        ...(isWebUrl(startUrl) ? { startUrl: relativeToBase(startUrl, baseURL) } : {}),
        recordedAt: now().toISOString(),
        ...(options.session !== undefined ? { session: options.session } : {}),
        steps: [...draft.steps],
        params: [...draft.params],
      };
      return {
        recording,
        stoppedBy: reason,
        facetsMinted: [...new Set(minted)],
        facetsUsed: [...new Set(draft.steps.flatMap((step) => (step.facetId !== undefined ? [step.facetId] : [])))],
        actions,
        snapshots: [...own],
        warnings: [...warnings],
      };
    } finally {
      clearTimeout(timer);
      page.off('framenavigated', onFrameNavigated);
      page.off('close', onClose);
      if (active.get(page)?.token === token) active.delete(page);
      markReady();
      await evaluateQuietly(page, recorderCall('configure', { active: false }));
    }
  };

  active.set(page, {
    token,
    config: () => (stopReason === null ? config : { active: false }),
    onAction,
    onStop: () => requestStop('manual'),
    ready,
  });

  const done = run();
  // A failure before ready must not leave waiters hanging.
  done.catch(() => markReady());
  return { ready, done, stop: () => requestStop('manual') };
};

/** Record until a stop condition fires. */
export const recordFlow = (options: RecordOptions): Promise<RecordedFlow> => startRecording(options).done;

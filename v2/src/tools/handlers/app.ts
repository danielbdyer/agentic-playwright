/**
 * app.* handlers: the eyes and hands. app.open opens (or attaches to, or
 * navigates) a page and waits for the OutSystems runtime to hydrate;
 * app.observe snapshots it and ranks candidates against the step's words;
 * app.act performs one action on a verified target and returns what
 * changed; app.assert checks one web-first assertion and reports what it
 * saw. Facet targets leave resolution evidence in memory, so a locator's
 * health reflects every real use, not only test runs.
 *
 * Page-side failures of an action come back as outcome "failed" with an
 * error family; only bad input (an unknown page, a missing or stale target,
 * an unknown parameter) throws.
 */
import type { PageHandle } from '../../browser/types.js';
import type { Hint, ResolvedLocator, SnapshotDelta } from '../../contract/schemas.js';
import { ToolError, isToolError } from '../../core/errors.js';
import { redactUrl } from '../../core/pii.js';
import { countMatches, isPageAssertion, performAction, runAssertion, type ActionResult } from '../../act/index.js';
import { locatorKeyOf, loadScreen, recordResolutions, type ResolveOutcome } from '../../memory/index.js';
import { awaitHydration, diffSnapshots, settle, type SnapshotRecord } from '../../observe/index.js';
import { classifyStep, rankCandidates, screenNameFromUrl } from '../../resolve/index.js';
import { recorderReady } from '../../flow/index.js';
import { resolveUrl } from '../../workspace/profiles.js';
import type { ToolContext, ToolHandler, ToolHandlers } from '../types.js';
import { observeAndSave, visibleAlerts } from './support/observation.js';
import { openApp } from './support/open.js';
import { latestPageRecord, rememberResolution } from './support/page-state.js';
import { paramNamesIn, substituteOptional } from './support/params.js';
import { isPasswordField, resolveTarget, settleResolution, type TargetResolution } from './support/target.js';

const HINT_LIMIT = 10;
const SETTLE_BUDGET_MS = 3_000;
const NAVIGATE_TIMEOUT_MS = 30_000;
const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;
const RESOLVE_OUTCOMES: ReadonlySet<string> = new Set<ResolveOutcome>(['ok', 'not-found', 'ambiguous', 'not-visible', 'not-enabled']);

const isResolveOutcome = (value: string): value is ResolveOutcome => RESOLVE_OUTCOMES.has(value);

// ─── app.open ──────────────────────────────────────────────────────────────

const open: ToolHandler<'app.open'> = async (input, ctx) => {
  const opened = await openApp(ctx, input);
  return {
    pageId: opened.handle.pageId,
    finalUrl: opened.finalUrl,
    title: opened.title,
    variant: opened.variant,
    hydration: opened.hydration,
    attached: opened.attached,
    ...(opened.profile !== undefined ? { profile: opened.profile } : {}),
  };
};

// ─── app.observe ───────────────────────────────────────────────────────────

/** Rank the scope's candidates against the step's words (the pre-filter; a suggestion, the agent decides). */
const hintsFor = (intent: string, record: SnapshotRecord): readonly Hint[] => {
  const stepIntent = classifyStep(intent, '', paramNamesIn(intent));
  return rankCandidates(stepIntent, record.candidates, { limit: HINT_LIMIT });
};

const observe: ToolHandler<'app.observe'> = async (input, ctx) => {
  const handle = ctx.browser.get(input.pageId);
  const { snapshot, record } = await observeAndSave(ctx, handle, {
    ...(input.scope !== undefined ? { scope: input.scope } : {}),
    ...(input.includeScreenshot !== undefined ? { includeScreenshot: input.includeScreenshot } : {}),
    ...(input.audit !== undefined ? { audit: input.audit } : {}),
    ...(input.maxCandidates !== undefined ? { maxCandidates: input.maxCandidates } : {}),
  });
  const intent = input.intent?.trim() ?? '';
  if (intent.length === 0) return snapshot;
  const hints = hintsFor(intent, record);
  // A hinted candidate the cap dropped is shown anyway: a hint must name something the agent can see.
  const shown = new Set(snapshot.candidates.map((c) => c.ref));
  const extra = new Set(hints.map((h) => h.ref).filter((ref) => !shown.has(ref)));
  const candidates = extra.size === 0 ? snapshot.candidates : record.candidates.filter((c) => shown.has(c.ref) || extra.has(c.ref));
  return { ...snapshot, candidates: [...candidates], hints: [...hints] };
};

// ─── app.act ───────────────────────────────────────────────────────────────

/** A navigate value as an absolute URL: relative to the page's profile baseURL, else to the page itself. */
const navigationUrl = (value: string, handle: PageHandle): string => {
  if (ABSOLUTE.test(value)) return value;
  if (handle.profile !== null) return resolveUrl(value, handle.profile);
  const current = handle.page.url();
  if (/^https?:/i.test(current)) return new URL(value.replace(/^\/+/, ''), current).toString();
  throw new ToolError('invalid-input', `relative url "${value}" needs a page opened with a profile (app.open profile) or an absolute URL`, { url: value });
};

/**
 * The "before" side of the delta: the page's latest whole-page snapshot when
 * it is of the current document, else a fresh one (taken after the target
 * was resolved, so it cannot invalidate the agent's refs mid-resolution).
 */
const baselineFor = async (ctx: ToolContext, handle: PageHandle): Promise<SnapshotRecord | undefined> => {
  const remembered = latestPageRecord(handle.page);
  if (remembered !== undefined && remembered.url === redactUrl(handle.page.url(), remembered.pii)) return remembered;
  try {
    return (await observeAndSave(ctx, handle, { scope: 'page' })).record;
  } catch (error) {
    ctx.log(`app.act: no baseline snapshot for ${handle.pageId}: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

/** What changed: the whole page observed after the action, diffed against the baseline. */
const postStateOf = async (ctx: ToolContext, handle: PageHandle, before: SnapshotRecord | undefined): Promise<SnapshotDelta | undefined> => {
  if (handle.page.isClosed()) return undefined;
  try {
    const after = await observeAndSave(ctx, handle, { scope: 'page' });
    const delta = diffSnapshots(before ?? after.record, after.record, visibleAlerts(after.record));
    return delta;
  } catch (error) {
    ctx.log(`app.act: could not observe ${handle.pageId} after the action: ${error instanceof Error ? error.message : String(error)}`);
    return undefined;
  }
};

/** A facet already in memory that owns this locator (so the agent enriches instead of minting a twin). */
const knownFacetFor = async (ctx: ToolContext, handle: PageHandle, resolved: ResolvedLocator): Promise<string | undefined> => {
  try {
    const screen = screenNameFromUrl(handle.page.url(), handle.profile?.baseURL);
    const loaded = await loadScreen(ctx.workspace, screen, { now: ctx.now });
    if (!loaded.exists) return undefined;
    const key = locatorKeyOf(resolved.locator);
    return loaded.catalog.facets.find((facet) => facet.status !== 'retired' && facet.locators.some((locator) => locatorKeyOf(locator) === key))?.id;
  } catch {
    return undefined;
  }
};

/** Append a resolution of the facet's best locator to the evidence log; never fails the call. */
const recordFacetUse = async (
  ctx: ToolContext,
  resolution: TargetResolution,
  outcome: ResolveOutcome,
  source: 'act' | 'assert',
  matches: number | undefined,
  detail: string | undefined,
): Promise<void> => {
  if (resolution.facet === undefined) return;
  try {
    await recordResolutions(
      ctx.workspace,
      [
        {
          facetId: resolution.facet.id,
          locator: resolution.spec,
          outcome,
          source,
          ...(matches !== undefined ? { matches } : {}),
          ...(detail !== undefined ? { detail } : {}),
        },
      ],
      { now: ctx.now },
    );
  } catch (error) {
    ctx.log(`could not record ${source} evidence for ${resolution.facet.id}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

const act: ToolHandler<'app.act'> = async (input, ctx) => {
  const started = Date.now();
  const handle = ctx.browser.get(input.pageId);
  // A flow.record that is still starting on this page must see this action.
  await recorderReady(handle.page);
  const { value, used } = substituteOptional(input.value, input.params);
  if (used) ctx.markSensitive?.('value');

  let resolution: TargetResolution | undefined;
  let actionValue = value;
  if (input.action === 'navigate') {
    if (value === undefined || value.trim().length === 0) throw new ToolError('invalid-input', 'navigate needs the url in value');
    actionValue = navigationUrl(value.trim(), handle);
  } else if (input.target !== undefined) {
    resolution = await resolveTarget(ctx, handle, input.target, input.params);
    if (input.action === 'fill' && value !== undefined && (await isPasswordField(resolution))) ctx.markSensitive?.('value');
  } else if (input.action !== 'press') {
    // press without a target sends the key to whatever has focus.
    throw new ToolError('invalid-input', `${input.action} needs a target: {facetId}, {snapshotId, ref}, or {locator}`, { action: input.action });
  }

  const before = await baselineFor(ctx, handle);
  const timeoutMs = input.timeoutMs ?? (input.action === 'navigate' ? NAVIGATE_TIMEOUT_MS : undefined);
  const result: ActionResult = await performAction(handle.page, resolution?.locator ?? null, input.action, actionValue, timeoutMs !== undefined ? { timeoutMs } : {});

  let postState: SnapshotDelta | undefined;
  if (result.outcome === 'succeeded') {
    if (input.action === 'navigate') await awaitHydration(handle.page, { budgetMs: ctx.workspace.config.observe.hydrationBudgetMs });
    else await settle(handle.page, { budgetMs: SETTLE_BUDGET_MS });
    postState = await postStateOf(ctx, handle, before);
  }

  let resolved: ResolvedLocator | undefined;
  let facetId: string | undefined;
  if (resolution !== undefined) {
    resolved = settleResolution(resolution, result.matches).resolved;
    if (resolution.candidate !== undefined) rememberResolution(resolution.candidate.snapshotId, resolution.candidate.ref, resolved);
    const outcome = result.outcome === 'succeeded' ? 'ok' : isResolveOutcome(result.family) ? result.family : undefined;
    if (outcome !== undefined) {
      await recordFacetUse(ctx, resolution, outcome, 'act', result.matches?.visible, result.outcome === 'failed' ? result.message : undefined);
    }
    facetId = resolution.facet?.id ?? (resolved.verified ? await knownFacetFor(ctx, handle, resolved) : undefined);
  }

  return {
    outcome: result.outcome,
    ...(result.outcome === 'failed' ? { errorFamily: result.family, message: result.message } : {}),
    ...(resolved !== undefined ? { resolved } : {}),
    ...(facetId !== undefined ? { facetId } : {}),
    ...(result.outcome === 'succeeded' && result.select !== undefined
      ? { select: { via: result.select.via, ...(result.select.typed !== undefined ? { typed: result.select.typed } : {}) } }
      : {}),
    ...(postState !== undefined ? { postState } : {}),
    durationMs: Date.now() - started,
  };
};

// ─── app.assert ────────────────────────────────────────────────────────────

/**
 * What an assertion says about the facet's locator. A hidden check learns
 * nothing (absence passes); a count passing over at least one element is a
 * use; otherwise the counts after the assertion say whether the locator
 * found its one element.
 */
const assertionOutcome = (
  kind: string,
  passed: boolean,
  counts: { readonly total: number; readonly visible: number } | undefined,
): ResolveOutcome | undefined => {
  if (kind === 'hidden' || counts === undefined) return undefined;
  if (kind === 'count') return passed && counts.total > 0 ? 'ok' : undefined;
  if (counts.total === 0) return 'not-found';
  if (counts.visible > 1) return 'ambiguous';
  if (counts.visible === 0) return passed ? 'ok' : 'not-visible';
  return 'ok';
};

const assert: ToolHandler<'app.assert'> = async (input, ctx) => {
  const handle = ctx.browser.get(input.pageId);
  const pageLevel = isPageAssertion(input.assertion);
  if (!pageLevel && input.target === undefined) {
    throw new ToolError('invalid-input', `a ${input.assertion} assertion needs a target: {facetId}, {snapshotId, ref}, or {locator}`, { assertion: input.assertion });
  }
  const { value: expected } = substituteOptional(input.expected, input.params, 'expected');
  const resolution = pageLevel || input.target === undefined ? undefined : await resolveTarget(ctx, handle, input.target, input.params);

  let result: Awaited<ReturnType<typeof runAssertion>>;
  try {
    result = await runAssertion(handle.page, input.assertion, resolution?.locator ?? null, expected, input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {});
  } catch (error) {
    if (resolution !== undefined && isToolError(error) && error.family === 'ambiguous') {
      await recordFacetUse(ctx, resolution, 'ambiguous', 'assert', undefined, error.message);
    }
    throw error;
  }

  let resolved: ResolvedLocator | undefined;
  if (resolution !== undefined) {
    const counts = handle.page.isClosed() ? undefined : await countMatches(resolution.locator).catch(() => undefined);
    resolved = settleResolution(resolution, counts).resolved;
    if (resolution.candidate !== undefined) rememberResolution(resolution.candidate.snapshotId, resolution.candidate.ref, resolved);
    const outcome = assertionOutcome(input.assertion, result.passed, counts);
    if (outcome !== undefined) await recordFacetUse(ctx, resolution, outcome, 'assert', counts?.visible, outcome === 'ok' ? undefined : result.message);
  }

  return {
    passed: result.passed,
    observed: result.observed,
    ...(result.message !== undefined ? { message: result.message } : {}),
    ...(resolved !== undefined ? { resolved } : {}),
  };
};

export const appHandlers: Pick<ToolHandlers, 'app.open' | 'app.observe' | 'app.act' | 'app.assert'> = {
  'app.open': open,
  'app.observe': observe,
  'app.act': act,
  'app.assert': assert,
};

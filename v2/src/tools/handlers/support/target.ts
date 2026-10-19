/**
 * Target resolution for app.act and app.assert. A target is one of:
 *
 * - {facetId}: the facet's best locator from memory, built with params;
 * - {snapshotId, ref}: a snapshot candidate, resolved through the locator
 *   ladder to a locator verified against the element the walker
 *   registered; kept inside the landmark or block the agent observed when
 *   that stays unique (the step named the region; the locator should too);
 * - {locator}: an explicit locator, built as given and verified by counting.
 *
 * The ladder needs the page's ref registry, which holds only the latest
 * observation. When the agent acts on a candidate from an earlier
 * observation of the same document (an act's post-state replaced it), the
 * candidate is re-anchored: the page is walked again with the snapshot's
 * scope and the candidate is found by its identity (role, name, tag,
 * landmark, block, row, ids) and its position among identical twins. If
 * that is not unambiguous, the snapshot is stale and the agent observes again.
 */
import type { Locator, Page } from '@playwright/test';
import { ToolError, isToolError } from '../../../core/errors.js';
import { redactUrl } from '../../../core/pii.js';
import type { Candidate, Facet, LocatorScope, LocatorSpec, ResolvedLocator, Target } from '../../../contract/schemas.js';
import type { PageHandle } from '../../../browser/types.js';
import { renderLocator, toPlaywrightLocator } from '../../../locator/locator.js';
import { bareLocator, bestLocator, findFacet, requireFacetId } from '../../../memory/index.js';
import {
  countMatches as countSpecMatches,
  loadSnapshot,
  observePage,
  parseScope,
  resolveCandidateLocator,
  type SnapshotRecord,
} from '../../../observe/index.js';
import type { ToolContext } from '../../types.js';
import type { Params } from './params.js';
import { rememberResolution } from './page-state.js';

export type TargetSource = 'facet' | 'candidate' | 'locator';

export interface TargetResolution {
  readonly source: TargetSource;
  /** The live Playwright locator (with the visibility filter when the spec asks for one). */
  readonly locator: Locator;
  /** The locator spec, without display fields. */
  readonly spec: LocatorSpec;
  /** Spec, expression, and what the ladder or the count established. */
  readonly resolved: ResolvedLocator;
  readonly facet?: Facet;
  /** The cited candidate (the agent's snapshotId and ref), when the target was one. */
  readonly candidate?: { readonly snapshotId: string; readonly ref: string; readonly inputType?: string };
}

const presentResolved = (spec: LocatorSpec, verified: boolean, alternatives: ResolvedLocator['alternatives'] = []): ResolvedLocator => {
  const expression = renderLocator(spec);
  return { locator: { ...spec, expression }, expression, verified, alternatives };
};

// ─── Candidates ────────────────────────────────────────────────────────────

/** Identity of a candidate for re-anchoring: what does not change when the user types or the page re-renders. */
const identityOf = (candidate: Candidate): string =>
  [
    candidate.role,
    candidate.name,
    candidate.tag,
    candidate.landmark ?? '',
    candidate.landmarkName ?? '',
    candidate.dataBlock ?? '',
    candidate.rowText ?? '',
    candidate.id ?? '',
    candidate.testId ?? '',
    candidate.placeholder ?? '',
    candidate.inputType ?? '',
  ].join('\u0000');

const staleError = (snapshotId: string, ref: string, why: string): ToolError =>
  new ToolError('stale-snapshot', `snapshot ${snapshotId} is stale: ${why}. Observe the page again and use the new refs.`, { snapshotId, ref });

const loadRecordOrNull = async (ctx: ToolContext, snapshotId: string): Promise<SnapshotRecord | null> => {
  try {
    return await loadSnapshot(ctx.workspace, snapshotId);
  } catch {
    return null;
  }
};

/**
 * Find the cited candidate on the page again (the registry moved on to a
 * later observation of the same document). Returns the fresh snapshot id
 * and ref to resolve through the ladder.
 */
const reanchor = async (
  ctx: ToolContext,
  handle: PageHandle,
  record: SnapshotRecord,
  ref: string,
): Promise<{ readonly snapshotId: string; readonly ref: string }> => {
  const candidate = record.candidates.find((c) => c.ref === ref);
  if (candidate === undefined) throw new ToolError('not-found', `snapshot ${record.snapshotId} has no candidate ${ref}`, { snapshotId: record.snapshotId, ref });
  if (redactUrl(handle.page.url(), record.pii) !== record.url) {
    throw staleError(record.snapshotId, ref, 'the page has navigated since that snapshot');
  }
  const fresh = await observePage(handle.page, {
    pageId: handle.pageId,
    scope: record.scope,
    pii: record.pii,
    maxCandidates: 1,
    maxAriaBytes: 1024,
    now: ctx.now,
  });
  const key = identityOf(candidate);
  const before = record.candidates.filter((c) => identityOf(c) === key);
  const after = fresh.record.candidates.filter((c) => identityOf(c) === key);
  const position = before.findIndex((c) => c.ref === ref);
  const match = after[position];
  if (match === undefined || before.length !== after.length) {
    throw staleError(
      record.snapshotId,
      ref,
      after.length === 0
        ? `${candidate.role} "${candidate.name}" is no longer on the page`
        : `the page was observed again and ${candidate.role} "${candidate.name}" cannot be told apart from ${after.length - 1} other(s)`,
    );
  }
  return { snapshotId: fresh.record.snapshotId, ref: match.ref };
};

const isUnique = async (page: Page, spec: LocatorSpec): Promise<boolean> => {
  try {
    const counts = await countSpecMatches(page, spec);
    return counts.total === 1 && counts.visible === 1;
  } catch {
    return false;
  }
};

/**
 * Keep a verified, unscoped locator inside the region the agent observed.
 * Scoping only narrows the match set, so a scoped form that still matches
 * exactly one element matches the same element.
 */
const preferObservedScope = async (page: Page, resolved: ResolvedLocator, record: SnapshotRecord | null, ref: string): Promise<ResolvedLocator> => {
  if (!resolved.verified || record === null) return resolved;
  const spec = bareLocator(resolved.locator);
  if (spec.scope?.landmark !== undefined || spec.scope?.dataBlock !== undefined || spec.nth !== undefined) return resolved;
  let observed: ReturnType<typeof parseScope>;
  try {
    observed = parseScope(record.scope);
  } catch {
    return resolved;
  }
  if (observed.kind === 'page') return resolved;
  const candidate = record.candidates.find((c) => c.ref === ref);
  const scopes: readonly LocatorScope[] =
    observed.kind === 'block'
      ? [{ dataBlock: observed.name }]
      : candidate !== undefined && candidate.landmark !== observed.role
        ? []
        : [
            { landmark: observed.role },
            ...(candidate?.landmarkName !== undefined ? [{ landmark: observed.role, landmarkName: candidate.landmarkName }] : []),
          ];
  for (const scope of scopes) {
    const scoped: LocatorSpec = { ...spec, scope: { ...scope, ...(spec.scope?.rowText !== undefined ? { rowText: spec.scope.rowText } : {}), ...(spec.scope?.rowExact !== undefined ? { rowExact: spec.scope.rowExact } : {}) } };
    if (await isUnique(page, scoped)) return presentResolved(scoped, true, resolved.alternatives);
  }
  return resolved;
};

/** The registry holds a later observation of the same document (not a navigation, not a detached element). */
const isObservedAgain = (error: unknown): boolean =>
  isToolError(error) && error.family === 'stale-snapshot' && error.detail?.status === 'stale';

/** Attempts when another observer (a flow recording) swaps the registry while a candidate is being resolved. */
const RESOLVE_ATTEMPTS = 3;
const RETRY_PAUSE_MS = 250;

const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The ladder's locator for a snapshot candidate on a live page, re-anchored
 * when the page was observed again since, kept in the observed region.
 * Remembered when verified, for memory.mint and memory.enrich.
 *
 * flow.record observes the page while the agent acts (and puts the
 * previous registry back afterwards), so a registry can change between the
 * re-anchoring walk and the ladder; that race is retried a few times.
 */
export const resolveCandidateOnPage = async (
  ctx: ToolContext,
  handle: PageHandle,
  snapshotId: string,
  ref: string,
  options: { readonly reanchor?: boolean } = {},
): Promise<{ readonly resolved: ResolvedLocator; readonly record: SnapshotRecord | null }> => {
  let resolved: ResolvedLocator | undefined;
  let record: SnapshotRecord | null = null;
  for (let attempt = 1; resolved === undefined; attempt += 1) {
    try {
      resolved = await resolveCandidateLocator(handle.page, snapshotId, ref);
      break;
    } catch (error) {
      if (!isObservedAgain(error) || options.reanchor === false) throw error;
    }
    record ??= await loadSnapshot(ctx.workspace, snapshotId);
    // A candidate that is gone or no longer unique is stale for good: reanchor's verdict is final.
    const anchored = await reanchor(ctx, handle, record, ref);
    try {
      resolved = await resolveCandidateLocator(handle.page, anchored.snapshotId, anchored.ref);
    } catch (error) {
      if (!isObservedAgain(error) || attempt >= RESOLVE_ATTEMPTS) throw error;
      await pause(RETRY_PAUSE_MS);
    }
  }
  record ??= await loadRecordOrNull(ctx, snapshotId);
  const scoped = await preferObservedScope(handle.page, resolved, record, ref);
  rememberResolution(snapshotId, ref, scoped);
  return { resolved: scoped, record };
};

// ─── Any target ────────────────────────────────────────────────────────────

const facetTarget = async (ctx: ToolContext, facetId: string): Promise<{ readonly facet: Facet; readonly spec: LocatorSpec }> => {
  requireFacetId(facetId);
  const facet = await findFacet(ctx.workspace, facetId, { now: ctx.now });
  if (facet === null) throw new ToolError('not-found', `no facet ${facetId} in memory; memory.query finds facets by the step's words`, { facetId });
  if (facet.status === 'retired') {
    throw new ToolError('invalid-input', `facet ${facetId} is retired; observe the page and use a candidate instead`, { facetId });
  }
  const best = bestLocator(facet);
  if (best === undefined) throw new ToolError('not-found', `facet ${facetId} has no locator; observe the page and enrich it`, { facetId });
  return { facet, spec: bareLocator(best) };
};

/**
 * Resolve a target to a live locator. Throws ToolError for bad input only:
 * an unknown or retired facet, a stale or unknown snapshot candidate, a
 * locator that cannot be built (a missing {parameter}).
 */
export const resolveTarget = async (ctx: ToolContext, handle: PageHandle, target: Target, params: Params | undefined): Promise<TargetResolution> => {
  if ('facetId' in target) {
    const { facet, spec } = await facetTarget(ctx, target.facetId);
    return { source: 'facet', locator: toPlaywrightLocator(handle.page, spec, params), spec, resolved: presentResolved(spec, false), facet };
  }
  if ('ref' in target) {
    const { resolved, record } = await resolveCandidateOnPage(ctx, handle, target.snapshotId, target.ref);
    const spec = bareLocator(resolved.locator);
    const inputType = record?.candidates.find((c) => c.ref === target.ref)?.inputType;
    return {
      source: 'candidate',
      locator: toPlaywrightLocator(handle.page, spec, params),
      spec,
      resolved,
      candidate: { snapshotId: target.snapshotId, ref: target.ref, ...(inputType !== undefined ? { inputType } : {}) },
    };
  }
  const spec = bareLocator(target.locator);
  return { source: 'locator', locator: toPlaywrightLocator(handle.page, spec, params), spec, resolved: presentResolved(spec, false) };
};

/**
 * Settle what a resolution established once the element has been counted:
 * a single visible match among hidden twins gets the visibility filter (the
 * emitted locator would otherwise hit a strict-mode violation), and the
 * locator is verified when exactly one visible element matches (a candidate
 * also needs the ladder's verdict; an nth locator never is).
 */
export const settleResolution = (
  resolution: TargetResolution,
  counts: { readonly total: number; readonly visible: number } | undefined,
): { readonly spec: LocatorSpec; readonly resolved: ResolvedLocator } => {
  if (counts === undefined) {
    const unverified = resolution.source === 'candidate' ? resolution.resolved : { ...resolution.resolved, verified: false };
    return { spec: resolution.spec, resolved: unverified };
  }
  const single = counts.visible === 1;
  const spec: LocatorSpec =
    single && counts.total > 1 && resolution.spec.visibleOnly !== true && resolution.spec.nth === undefined
      ? { ...resolution.spec, visibleOnly: true }
      : resolution.spec;
  const verified = single && spec.nth === undefined && (resolution.source !== 'candidate' || resolution.resolved.verified);
  return { spec, resolved: presentResolved(spec, verified, resolution.resolved.alternatives) };
};

/** secret: a password-like field (its value must never reach a receipt or an output); unknown: no element to tell by. */
export type FieldSensitivity = 'secret' | 'plain' | 'unknown';

/** autocomplete tokens that mark a field's value as a credential or card secret. */
const SECRET_AUTOCOMPLETE = '(?:^|\\s)(?:current-password|new-password|one-time-code|cc-number|cc-csc|cc-exp(?:-month|-year)?)(?:\\s|$)';

/**
 * Whether the target is a password-like field, read from the elements its
 * locator matches right now: call it when the action or assertion has just
 * reached the element (a field rendered late is there by then). Never
 * waits: no element matching is "unknown", which callers treat as secret
 * where a value was typed or read. Any matching element that is a password
 * input (or carries a credential autocomplete token) makes it secret.
 */
export const fieldSensitivity = async (resolution: TargetResolution): Promise<FieldSensitivity> => {
  if (resolution.candidate?.inputType?.toLowerCase() === 'password') return 'secret';
  try {
    const verdicts = await resolution.locator.evaluateAll(
      (elements, pattern) =>
        elements.map(
          (element) =>
            element instanceof HTMLInputElement &&
            (element.type.toLowerCase() === 'password' || new RegExp(pattern, 'i').test(element.getAttribute('autocomplete') ?? '')),
        ),
      SECRET_AUTOCOMPLETE,
    );
    if (verdicts.length === 0) return 'unknown';
    return verdicts.some((secret) => secret) ? 'secret' : 'plain';
  } catch {
    return 'unknown';
  }
};

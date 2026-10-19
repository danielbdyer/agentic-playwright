/**
 * memory.* handlers: thin wrappers over the memory library, plus the two
 * things only a handler can do. It cites evidence: mint and enrich load the
 * snapshot record the agent names (a pruned or unknown snapshot is
 * stale-snapshot) and pass the locator the ladder verified for that
 * candidate on the live page, when this session verified one, so memory can
 * tell a verified locator from a typed one. And it keeps the page objects a
 * projection of the catalog: a screen whose pages/<screen>.page.ts exists is
 * regenerated after every change, so repair in place closes with enrich →
 * test.run.
 */
import type { Candidate, ResolvedLocator, ScreenRoute } from '../../contract/schemas.js';
import { ToolError } from '../../core/errors.js';
import { enrichFacet, mintFacet, queryMemory, requireFacetId, routeUrlRelativeTo } from '../../memory/index.js';
import { loadSnapshot, type SnapshotRecord } from '../../observe/index.js';
import { loadProfile, resolveUrl, type Profile } from '../../workspace/profiles.js';
import type { ToolContext, ToolHandler, ToolHandlers } from '../types.js';
import { recalledResolution } from './support/page-state.js';
import { regeneratePageObject, regenerationNote } from './support/page-objects.js';
import { runPreflight } from './support/preflight.js';
import { resolveCandidateOnPage } from './support/target.js';

export { appendPreflightReceipt, lastPreflightReceipt, preflightLogPath, PreflightReceiptSchema, type PreflightReceipt } from './support/preflight-log.js';

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

/** The candidate a snapshot record holds under ref; invalid-input when it has none. */
const evidenceCandidate = (record: SnapshotRecord, ref: string): Candidate => {
  const candidate = record.candidates.find((c) => c.ref === ref);
  if (candidate === undefined) {
    throw new ToolError('invalid-input', `snapshot ${record.snapshotId} has no candidate ${ref}; cite a ref from that snapshot's candidates`, {
      snapshotId: record.snapshotId,
      ref,
    });
  }
  return candidate;
};

/**
 * The locator verified for the cited candidate: the one app.act or
 * app.assert resolved for it in this session, else the ladder's result on
 * the live page when that page still shows that snapshot. Never re-walks
 * the page (that would invalidate the agent's current refs).
 */
const verifiedFor = async (ctx: ToolContext, record: SnapshotRecord, ref: string): Promise<ResolvedLocator | undefined> => {
  const recalled = recalledResolution(record.snapshotId, ref);
  if (recalled !== undefined) return recalled;
  const handle = ctx.browser.list().find((h) => h.pageId === record.pageId);
  if (handle === undefined) return undefined;
  try {
    const { resolved } = await resolveCandidateOnPage(ctx, handle, record.snapshotId, ref, { reanchor: false });
    return resolved.verified ? resolved : undefined;
  } catch {
    return undefined;
  }
};

/** The profile that page URLs are relative to: the snapshot page's, else the default one. */
const profileFor = async (ctx: ToolContext, record: SnapshotRecord): Promise<Profile | null> => {
  const handle = ctx.browser.list().find((h) => h.pageId === record.pageId);
  if (handle?.profile !== undefined && handle.profile !== null) return handle.profile;
  return loadProfile(ctx.workspace, undefined, ctx.env).catch(() => null);
};

const pathOf = (url: string): string | null => {
  try {
    return new URL(url).pathname.replace(/\/+$/, '').toLowerCase();
  } catch {
    return null;
  }
};

/**
 * The route to store: the URL relative to the profile baseURL when it lives
 * under it, and, when the snapshot was taken on that route, the variant,
 * title, and landmarks it saw (goto() waits for main when main is listed).
 * The fingerprint is left to the first clean memory.preflight, which takes
 * it from a fresh load of the route rather than from mid-authoring state.
 */
const routeFromEvidence = async (ctx: ToolContext, route: ScreenRoute, record: SnapshotRecord): Promise<ScreenRoute> => {
  const profile = await profileFor(ctx, record);
  const url = ABSOLUTE.test(route.url) && profile !== null ? routeUrlRelativeTo(route.url, profile.baseURL) : route.url;
  const address = ((): string | null => {
    try {
      return ABSOLUTE.test(url) ? url : profile !== null ? resolveUrl(url, profile) : new URL(url.replace(/^\/+/, ''), record.url).toString();
    } catch {
      return null;
    }
  })();
  const onRoute = address !== null && pathOf(address) !== null && pathOf(address) === pathOf(record.url);
  return {
    url,
    ...(route.variant !== undefined ? { variant: route.variant } : onRoute ? { variant: record.variant } : {}),
    ...(route.title !== undefined ? { title: route.title } : onRoute && record.title.length > 0 ? { title: record.title } : {}),
    ...(route.fingerprint !== undefined ? { fingerprint: route.fingerprint } : {}),
    ...(route.landmarks !== undefined ? { landmarks: route.landmarks } : onRoute ? { landmarks: [...record.fingerprint.landmarks] } : {}),
  };
};

const regenerate = async (ctx: ToolContext, screen: string): Promise<string | null> => {
  const regeneration = await regeneratePageObject(ctx.workspace, screen, ctx.now);
  const note = regenerationNote(regeneration);
  if (regeneration.status === 'skipped' && note !== null) ctx.log(`memory: ${note}`);
  return note;
};

const query: ToolHandler<'memory.query'> = async (input, ctx) => {
  const result = await queryMemory(
    ctx.workspace,
    {
      phrase: input.phrase,
      ...(input.screen !== undefined ? { screen: input.screen } : {}),
      ...(input.kind !== undefined ? { kind: input.kind } : {}),
      ...(input.landmark !== undefined ? { landmark: input.landmark } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
    },
    { now: ctx.now },
  );
  result.warnings.forEach((warning) => ctx.log(`memory.query: ${warning}`));
  return { facets: [...result.facets], screenKnown: result.screenKnown, ...(result.route !== undefined ? { route: result.route } : {}) };
};

const mint: ToolHandler<'memory.mint'> = async (input, ctx) => {
  const record = await loadSnapshot(ctx.workspace, input.evidence.snapshotId);
  const candidate = evidenceCandidate(record, input.evidence.ref);
  const verified = await verifiedFor(ctx, record, input.evidence.ref);
  const route = input.route !== undefined ? await routeFromEvidence(ctx, input.route, record) : undefined;
  const result = await mintFacet(
    ctx.workspace,
    {
      screen: input.screen,
      draft: input.facet,
      candidate,
      snapshotId: record.snapshotId,
      ...(verified !== undefined ? { verified } : {}),
      provenance: {
        instrument: input.decision !== undefined ? 'app.act' : 'app.observe',
        session: ctx.session,
        ...(input.decision?.host?.model !== undefined ? { model: input.decision.host.model } : {}),
        ...(input.decision?.testCase !== undefined ? { testCase: input.decision.testCase } : {}),
      },
      ...(route !== undefined ? { route } : {}),
    },
    { now: ctx.now },
  );
  result.warnings.forEach((warning) => ctx.log(`memory.mint ${result.facet.id}: ${warning}`));
  await regenerate(ctx, result.facet.screen);
  return { facet: result.facet, created: result.created };
};

const enrich: ToolHandler<'memory.enrich'> = async (input, ctx) => {
  const { screen } = requireFacetId(input.facetId);
  const record = await loadSnapshot(ctx.workspace, input.evidence.snapshotId);
  evidenceCandidate(record, input.evidence.ref);
  // Only a locator the agent gives is checked against the verified one: an
  // alias-only enrich must not change the facet's locators.
  const verified = input.locator !== undefined ? await verifiedFor(ctx, record, input.evidence.ref) : undefined;
  const result = await enrichFacet(
    ctx.workspace,
    {
      facetId: input.facetId,
      ...(input.aliases !== undefined ? { aliases: input.aliases } : {}),
      ...(input.locator !== undefined ? { locator: input.locator } : {}),
      ...(verified !== undefined ? { verified } : {}),
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.retire !== undefined ? { retire: input.retire } : {}),
      evidence: { snapshotId: record.snapshotId, ref: input.evidence.ref },
    },
    { now: ctx.now },
  );
  const note = result.changes.length > 0 ? await regenerate(ctx, screen) : null;
  return { facet: result.facet, changes: [...result.changes, ...(note !== null ? [note] : [])] };
};

const preflight: ToolHandler<'memory.preflight'> = (input, ctx) => runPreflight(ctx, input);

export const memoryHandlers: Pick<ToolHandlers, 'memory.query' | 'memory.mint' | 'memory.enrich' | 'memory.preflight'> = {
  'memory.query': query,
  'memory.mint': mint,
  'memory.enrich': enrich,
  'memory.preflight': preflight,
};

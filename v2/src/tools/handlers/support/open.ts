/**
 * Opening the application: app.open's whole job, shared with
 * memory.preflight (which opens a page the same way when it is not given
 * one). A launched page gets the profile's authentication: its saved
 * storage state, or its recorded login flow run through flow.run (so the
 * flow is receipted like any other call), or none. An attached page is a
 * browser someone else owns (a paused test, a QA's Chrome) and is joined as
 * it is.
 */
import path from 'node:path';
import type { Page } from '@playwright/test';
import { ToolError, isToolError, type ErrorFamily } from '../../../core/errors.js';
import { exists } from '../../../core/fsio.js';
import type { Hydration, Variant } from '../../../contract/schemas.js';
import type { PageHandle } from '../../../browser/types.js';
import { awaitHydration, pageVariant, settle } from '../../../observe/index.js';
import { loadProfile, resolveUrl, type Profile } from '../../../workspace/profiles.js';
import { resolveInside, type Workspace } from '../../../workspace/workspace.js';
import type { ToolOutput } from '../../../contract/tools.js';
import type { ToolContext } from '../../types.js';

export type AuthMode = 'storage-state' | 'flow' | 'none';

export interface OpenRequest {
  readonly url?: string;
  readonly profile?: string;
  readonly auth?: AuthMode;
  readonly attach?: { readonly cdpEndpoint: string; readonly urlContains?: string };
  readonly pageId?: string;
  readonly headed?: boolean;
}

export interface Opened {
  readonly handle: PageHandle;
  readonly finalUrl: string;
  readonly title: string;
  readonly variant: Variant;
  readonly hydration: Hydration;
  readonly attached: boolean;
  readonly profile?: string;
  /** True when this call created the page (the caller owns closing it). */
  readonly created: boolean;
}

/** The profile name a request means: its own, else $TESSERACT_PROFILE. */
export const profileNameOf = (requested: string | undefined, env: NodeJS.ProcessEnv): string | undefined => {
  if (requested !== undefined && requested.length > 0) return requested;
  const fromEnv = env.TESSERACT_PROFILE;
  return fromEnv !== undefined && fromEnv.length > 0 ? fromEnv : undefined;
};

/** storage-state when the profile has one, else flow when it names a login flow, else none. */
export const defaultAuth = (profile: Profile | null): AuthMode =>
  profile?.storageStatePath !== undefined && profile.storageStatePath.length > 0
    ? 'storage-state'
    : profile?.loginFlow !== undefined && profile.loginFlow.length > 0
      ? 'flow'
      : 'none';

const recordingPath = (workspace: Workspace, name: string): string => {
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(name)) throw new ToolError('not-configured', `login flow name "${name}" is not a valid flow name (kebab-case)`);
  return path.join(workspace.paths.recordings, `${name}.json`);
};

/** The profile with its storage state resolved to an absolute path inside the workspace; not-configured, with how to fix it, otherwise. */
const withStorageState = async (workspace: Workspace, profile: Profile | null): Promise<Profile> => {
  if (profile === null) {
    throw new ToolError('not-configured', 'auth "storage-state" needs a profile: create .tesseract/profiles/<name>.json with baseURL and storageStatePath, and pass profile or set TESSERACT_PROFILE');
  }
  const relative = profile.storageStatePath;
  if (relative === undefined || relative.length === 0) {
    throw new ToolError(
      'not-configured',
      `profile ${profile.name} has no storageStatePath; add "storageStatePath": ".tesseract/auth/${profile.name}.json" to .tesseract/profiles/${profile.name}.json and create the file (see below), or use auth "flow" with a recorded login flow`,
      { profile: profile.name },
    );
  }
  const absolute = resolveInside(workspace, relative);
  if (!(await exists(absolute))) {
    throw new ToolError(
      'not-configured',
      `storage state ${relative} for profile ${profile.name} does not exist. Create it by signing in once and saving the session, e.g. ` +
        `npx playwright codegen --save-storage=${relative} ${profile.baseURL} (sign in, then close the window), ` +
        'or call context.storageState({ path }) after a scripted login. It holds session cookies: keep it out of version control.',
      { profile: profile.name, path: relative },
    );
  }
  return { ...profile, storageStatePath: absolute };
};

const LOGIN_FAILURE_FAMILY: Readonly<Partial<Record<ErrorFamily, ErrorFamily>>> = {
  'not-found': 'not-configured',
  'invalid-input': 'not-configured',
  'not-configured': 'not-configured',
  timeout: 'timeout',
  unavailable: 'unavailable',
};

const loginFailure = (flow: string, family: string | undefined, message: string, detail: Record<string, unknown> = {}): ToolError =>
  new ToolError(LOGIN_FAILURE_FAMILY[family as ErrorFamily] ?? 'unclassified', `login flow "${flow}" failed: ${message}`, { flow, ...detail });

/** Same document address: origin, path (trailing slash ignored), and query; the fragment does not count. */
const sameAddress = (a: string, b: string): boolean => {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const pathOf = (u: URL): string => u.pathname.replace(/\/+$/, '').toLowerCase();
    return x.origin === y.origin && pathOf(x) === pathOf(y) && x.search === y.search;
  } catch {
    return a === b;
  }
};

/** The profile's login flow name, checked to exist on disk; not-configured, with how to fix it, otherwise. */
const requireLoginFlow = async (workspace: Workspace, profile: Profile | null): Promise<string> => {
  const flow = profile?.loginFlow;
  if (flow === undefined || flow.length === 0) {
    throw new ToolError(
      'not-configured',
      `auth "flow" needs a login flow: profile ${profile?.name ?? '(none)'} has no "loginFlow". Record one with flow.record (name "login") and add "loginFlow": "login" to the profile`,
      { profile: profile?.name },
    );
  }
  if (!(await exists(recordingPath(workspace, flow)))) {
    throw new ToolError('not-configured', `profile ${profile?.name ?? '(none)'} names login flow "${flow}" but .tesseract/flows/${flow}.json does not exist; record it with flow.record`, {
      flow,
    });
  }
  return flow;
};

/**
 * Run the login flow on the page through flow.run, let whatever navigation
 * it started land, then go to the URL the caller asked for when the flow
 * ended somewhere else. Returns the handle the flow ran on.
 */
const runLoginFlow = async (ctx: ToolContext, handle: PageHandle, flow: string, profileName: string | undefined, target: string | undefined): Promise<PageHandle> => {
  let result: ToolOutput<'flow.run'>;
  try {
    result = await ctx.call('flow.run', { name: flow, pageId: handle.pageId, ...(profileName !== undefined ? { profile: profileName } : {}) });
  } catch (error) {
    const family = isToolError(error) ? error.family : undefined;
    throw loginFailure(flow, family, error instanceof Error ? error.message : String(error));
  }
  if (result.outcome === 'failed') {
    const where = result.failedStep !== undefined ? ` at step ${result.failedStep}` : '';
    throw loginFailure(flow, result.errorFamily, `${result.message ?? 'no message'}${where}`, {
      ...(result.failedStep !== undefined ? { failedStep: result.failedStep } : {}),
    });
  }
  const ran = result.pageId === handle.pageId ? handle : ctx.browser.get(result.pageId);
  // A login usually ends by scripting a navigation; let it land before deciding where we are.
  await settle(ran.page, { budgetMs: 3_000 });
  if (target !== undefined && !sameAddress(ran.page.url(), target)) {
    return ctx.browser.navigate(ran.pageId, target);
  }
  return ran;
};

const variantOf = async (page: Page): Promise<Variant> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return (await pageVariant(page)).variant;
    } catch {
      if (page.isClosed()) return 'unknown';
      await page.waitForLoadState('domcontentloaded', { timeout: 2_000 }).catch(() => undefined);
    }
  }
  return 'unknown';
};

const describe = async (
  handle: PageHandle,
  hydration: Hydration,
  profile: Profile | null,
  created: boolean,
): Promise<Opened> => ({
  handle,
  finalUrl: handle.page.url(),
  title: await handle.page.title().catch(() => ''),
  variant: await variantOf(handle.page),
  hydration,
  attached: handle.attached,
  ...(profile !== null ? { profile: profile.name } : {}),
  created,
});

const hydrate = (ctx: ToolContext, page: Page): Promise<Hydration> =>
  awaitHydration(page, { budgetMs: ctx.workspace.config.observe.hydrationBudgetMs });

/**
 * Open (or attach to, or navigate) a page and wait for the application to
 * hydrate. Throws ToolError: invalid-input (no url and no profile, a
 * relative url without a baseURL), not-configured (profile, storage state,
 * or login flow missing), not-found (unknown pageId, no attached page
 * matching urlContains), timeout / unavailable (navigation, attach).
 */
export const openApp = async (ctx: ToolContext, request: OpenRequest): Promise<Opened> => {
  const { workspace, env } = ctx;
  const profileName = profileNameOf(request.profile, env);

  if (request.attach !== undefined) {
    // Joining someone else's browser: a missing $TESSERACT_PROFILE should not stop a repair.
    const profile = request.profile !== undefined ? await loadProfile(workspace, request.profile, env) : await loadProfile(workspace, undefined, env).catch(() => null);
    const url = request.url !== undefined ? resolveUrl(request.url, profile) : undefined;
    const handle = await ctx.browser.open({ attach: request.attach, profile, ...(url !== undefined ? { url } : {}) });
    const hydration: Hydration = url !== undefined ? await hydrate(ctx, handle.page) : { settled: true, elapsedMs: 0, reason: 'attached' };
    return describe(handle, hydration, profile, false);
  }

  if (request.pageId !== undefined) {
    const existing = ctx.browser.get(request.pageId);
    if (request.auth === 'storage-state') {
      throw new ToolError('invalid-input', 'auth "storage-state" applies to a new page; omit pageId to open one with the saved session');
    }
    const profile = request.profile !== undefined ? await loadProfile(workspace, request.profile, env) : existing.profile ?? (await loadProfile(workspace, undefined, env));
    const url = resolveUrl(request.url, profile);
    const flow = request.auth === 'flow' ? await requireLoginFlow(workspace, profile) : undefined;
    const navigated = await ctx.browser.navigate(existing.pageId, url);
    // The page's own profile is named for flow.run unless it is the unnamed $TESSERACT_BASE_URL stand-in.
    const flowProfile = profileName ?? (profile !== null && profile.name !== 'env' ? profile.name : undefined);
    const handle = flow !== undefined ? await runLoginFlow(ctx, navigated, flow, flowProfile, request.url !== undefined ? url : undefined) : navigated;
    return describe(handle, await hydrate(ctx, handle.page), profile, false);
  }

  const profile = await loadProfile(workspace, request.profile, env);
  const url = resolveUrl(request.url, profile);
  const auth = request.auth ?? defaultAuth(profile);
  const openProfile = auth === 'storage-state' ? await withStorageState(workspace, profile) : profile;
  // Configuration problems fail before anything is launched.
  const flow = auth === 'flow' ? await requireLoginFlow(workspace, profile) : undefined;
  const opened = await ctx.browser.open({
    url,
    profile: openProfile,
    useStorageState: auth === 'storage-state',
    ...(request.headed !== undefined ? { headed: request.headed } : {}),
  });
  let handle = opened;
  try {
    if (flow !== undefined) handle = await runLoginFlow(ctx, opened, flow, profileName, request.url !== undefined ? url : undefined);
  } catch (error) {
    await ctx.browser.close(opened.pageId).catch(() => undefined);
    throw error;
  }
  if (handle.pageId !== opened.pageId) await ctx.browser.close(opened.pageId).catch(() => undefined);
  return describe(handle, await hydrate(ctx, handle.page), profile, true);
};

/**
 * flow.* handlers: record a path walked once into facets and a
 * deterministic flow, and run a recorded flow with no model in the loop.
 *
 * flow.record attaches to a page (pageId), or opens one (url / profile;
 * headed for a QA when stopOn is "manual"), records until its stop
 * condition, writes .tesseract/flows/<name>.json, and renders
 * flows/<name>.ts plus the page objects it uses. A page it opened itself is
 * closed afterwards: only a human could have driven it.
 *
 * flow.run loads the recording, resolves its parameters (params, then
 * TESSERACT_PARAM_<NAME>, then recorded defaults; a secret is never
 * defaulted), and runs it on the given page or a new one. What happens on
 * the page comes back as outcome "failed" with the failing step; only a
 * missing recording, missing configuration, or bad input throws.
 */
import type { PageHandle } from '../../browser/types.js';
import { ToolError } from '../../core/errors.js';
import { exists } from '../../core/fsio.js';
import { redact, redactUrl } from '../../core/pii.js';
import { awaitHydration } from '../../observe/index.js';
import { loadProfile, resolveUrl, type Profile } from '../../workspace/profiles.js';
import { resolveInside } from '../../workspace/workspace.js';
import {
  absoluteUrl,
  assertFlowName,
  displayValue,
  loadRecording,
  persistFlow,
  recordFlow,
  requireBaseUrl,
  resolveFlowParams,
  runFlow,
  screensOf,
} from '../../flow/index.js';
import type { ToolContext, ToolHandler, ToolHandlers } from '../types.js';
import { withPageObjects } from './support/page-objects.js';

const profileOf = async (ctx: ToolContext, requested: string | undefined, handle: PageHandle | null): Promise<Profile | null> => {
  if (requested !== undefined) return loadProfile(ctx.workspace, requested, ctx.env);
  if (handle?.profile !== null && handle?.profile !== undefined) return handle.profile;
  // A page opened without a profile may still be described by $TESSERACT_PROFILE; a broken one is not this call's problem.
  return handle === null ? loadProfile(ctx.workspace, undefined, ctx.env) : loadProfile(ctx.workspace, undefined, ctx.env).catch(() => null);
};

/** Use the profile's saved session unless this flow is the profile's login (which is how the session is made). */
const usesStorageState = async (ctx: ToolContext, profile: Profile | null, flow: string): Promise<boolean> => {
  if (profile === null || profile.storageStatePath === undefined || profile.storageStatePath.length === 0) return false;
  if (profile.loginFlow === flow) return false;
  return exists(resolveInside(ctx.workspace, profile.storageStatePath));
};

const hydrate = (ctx: ToolContext, handle: PageHandle): Promise<unknown> =>
  awaitHydration(handle.page, { budgetMs: ctx.workspace.config.observe.hydrationBudgetMs });

// ─── flow.record ───────────────────────────────────────────────────────────

const record: ToolHandler<'flow.record'> = async (input, ctx) => {
  const name = assertFlowName(input.name);
  if (input.stopOn === 'steps' && input.maxSteps === undefined) {
    throw new ToolError('invalid-input', 'stopOn "steps" needs maxSteps (how many actions to record)');
  }
  let handle: PageHandle;
  let opened = false;
  let profile: Profile | null;
  if (input.pageId !== undefined) {
    const existing = ctx.browser.get(input.pageId);
    profile = await profileOf(ctx, input.profile, existing);
    handle = input.url !== undefined ? await ctx.browser.navigate(existing.pageId, resolveUrl(input.url, profile)) : existing;
    if (input.url !== undefined) await hydrate(ctx, handle);
  } else {
    profile = await profileOf(ctx, input.profile, null);
    const url = resolveUrl(input.url, profile);
    handle = await ctx.browser.open({
      url,
      profile,
      useStorageState: await usesStorageState(ctx, profile, name),
      ...(input.stopOn === 'manual' ? { headed: true } : {}),
    });
    opened = true;
    await hydrate(ctx, handle);
  }

  try {
    const recorded = await recordFlow({
      workspace: ctx.workspace,
      page: handle.page,
      pageId: handle.pageId,
      name,
      baseURL: profile?.baseURL ?? null,
      stopOn: input.stopOn,
      ...(input.screen !== undefined ? { screen: input.screen } : {}),
      ...(input.maxSteps !== undefined ? { maxSteps: input.maxSteps } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.redact !== undefined ? { redact: input.redact } : {}),
      session: ctx.session,
      now: ctx.now,
      log: ctx.log,
    });
    for (const warning of recorded.warnings) ctx.log(`flow.record ${name}: ${warning}`);
    if (recorded.actions === 0) {
      const why = recorded.stoppedBy === 'timeout' ? 'timeout' : 'not-found';
      throw new ToolError(why, `no actions were recorded before the recording stopped (${recorded.stoppedBy}); flow ${name} was not written`, {
        stoppedBy: recorded.stoppedBy,
        ...(recorded.warnings.length > 0 ? { warnings: recorded.warnings } : {}),
      });
    }
    // Every screen the flow's page objects could be written for: the steps' and their facets' (ids are screen:name).
    const screens = screensOf(recorded.recording, (facetId) => facetId.split(':')[0]);
    const persisted = await withPageObjects(ctx.workspace, screens, () => persistFlow(ctx.workspace, recorded.recording, { now: ctx.now }));
    return {
      flowPath: persisted.flowPath,
      recordingPath: persisted.recordingPath,
      facetsMinted: [...recorded.facetsMinted],
      params: recorded.recording.params.map((param) => param.name),
      steps: recorded.recording.steps.map((step) => {
        const value = displayValue(step.value);
        return {
          index: step.index,
          action: step.action,
          ...(step.facetId !== undefined ? { facetId: step.facetId } : {}),
          ...(value !== undefined ? { value } : {}),
          url: step.url,
          ...(step.snapshotId !== undefined ? { snapshotId: step.snapshotId } : {}),
        };
      }),
      stoppedBy: recorded.stoppedBy,
    };
  } finally {
    if (opened && !handle.page.isClosed()) await ctx.browser.close(handle.pageId).catch(() => undefined);
  }
};

// ─── flow.run ──────────────────────────────────────────────────────────────

const run: ToolHandler<'flow.run'> = async (input, ctx) => {
  const started = Date.now();
  const name = assertFlowName(input.name);
  const recording = await loadRecording(ctx.workspace, name);
  const supplied = input.params ?? {};
  if (recording.params.some((param) => param.secret && supplied[param.name] !== undefined)) ctx.markSensitive?.('params');
  const params = resolveFlowParams(recording, supplied, ctx.env);

  const existing = input.pageId !== undefined ? ctx.browser.get(input.pageId) : null;
  const profile = await profileOf(ctx, input.profile, existing);
  const baseURL = profile?.baseURL ?? null;
  requireBaseUrl(recording, baseURL);

  let handle: PageHandle;
  if (existing !== null) {
    handle = existing;
  } else {
    // A flow that starts with a navigation opens its own first screen; otherwise start where it was recorded.
    const first = [...recording.steps].sort((a, b) => a.index - b.index)[0];
    const startsWithNavigate = first?.action === 'navigate' && first.facetId === undefined;
    const startUrl = !startsWithNavigate && recording.startUrl !== undefined ? absoluteUrl(recording.startUrl, baseURL) : null;
    handle = await ctx.browser.open({
      ...(startUrl !== null ? { url: startUrl } : {}),
      profile,
      useStorageState: await usesStorageState(ctx, profile, name),
    });
    if (startUrl !== null) await hydrate(ctx, handle);
  }

  const { pii } = ctx.workspace.config;
  const result = await runFlow({
    workspace: ctx.workspace,
    page: handle.page,
    recording,
    params,
    baseURL,
    now: ctx.now,
    log: ctx.log,
  });
  return {
    pageId: handle.pageId,
    outcome: result.outcome,
    ...(result.failedStep !== undefined ? { failedStep: result.failedStep } : {}),
    ...(result.errorFamily !== undefined ? { errorFamily: result.errorFamily } : {}),
    ...(result.message !== undefined ? { message: redact(result.message, pii) } : {}),
    // Page text leaving the browser is PII-gated, as observe gates it.
    finalUrl: result.finalUrl.length > 0 ? redactUrl(result.finalUrl, pii) : '',
    title: redact(result.title, pii),
    durationMs: Date.now() - started,
  };
};

export const flowHandlers: Pick<ToolHandlers, 'flow.record' | 'flow.run'> = {
  'flow.record': record,
  'flow.run': run,
};

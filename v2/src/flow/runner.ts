/**
 * Running a recorded flow with no model in the loop: each step on its
 * facet's best locator (from memory), with act's performAction, settling
 * after each; navigations wait for the app to hydrate. Stops at the first
 * failing step and says which and why. Every locator tried is evidence
 * (source "flow"), so a flow that keeps working raises its facets' health
 * and one that breaks marks them stale like any other use.
 */
import type { Page } from '@playwright/test';
import type { FacetLocator, FlowParamSpec, FlowRecordingSpec, FlowRecordingStepSpec } from '../contract/schemas.js';
import { ToolError, isToolError, type ErrorFamily } from '../core/errors.js';
import { redact, redactUrl, type PiiMode } from '../core/pii.js';
import { performAction, type ActionResult } from '../act/index.js';
import { paramEnvName } from '../emit/index.js';
import { locatorParams, toPlaywrightLocator } from '../locator/locator.js';
import { bareLocator, bestLocator, findFacet, loadScreen, recordResolutions, type ResolutionReport, type ResolveOutcome } from '../memory/index.js';
import { awaitHydration, navigate, settle } from '../observe/index.js';
import { navigationPath } from '../emit/flow.js';
import type { Workspace } from '../workspace/workspace.js';
import { absoluteUrl, relativeUrls } from './recording.js';

export const DEFAULT_STEP_TIMEOUT_MS = 10_000;
const SETTLE_BUDGET_MS = 3_000;

/**
 * Parameter values: given ones first, then TESSERACT_PARAM_<NAME>, then the
 * recorded default. A secret (or a parameter without a default) that has
 * none is not-configured, naming the variable to set.
 */
export const resolveFlowParams = (
  recording: Pick<FlowRecordingSpec, 'name' | 'params'>,
  supplied: Readonly<Record<string, string>>,
  env: NodeJS.ProcessEnv,
): Readonly<Record<string, string>> => {
  const unknown = Object.keys(supplied).filter((name) => !recording.params.some((p) => p.name === name));
  if (unknown.length > 0) {
    throw new ToolError(
      'invalid-input',
      `flow ${recording.name} has no parameter ${unknown.join(', ')}; its parameters are ${recording.params.map((p) => p.name).join(', ') || '(none)'}`,
      { unknown },
    );
  }
  const valueOf = (param: FlowParamSpec): string | undefined => supplied[param.name] ?? env[paramEnvName(param.name)] ?? param.default;
  const missing = recording.params.filter((param) => valueOf(param) === undefined);
  if (missing.length > 0) {
    const what = missing.map((param) => `${param.name}${param.secret ? ' (secret)' : ''}: set ${paramEnvName(param.name)}`).join('; ');
    throw new ToolError('not-configured', `flow ${recording.name} needs ${missing.length === 1 ? 'a value' : 'values'} for ${what}, or pass params`, {
      missing: missing.map((param) => ({ name: param.name, env: paramEnvName(param.name), secret: param.secret })),
    });
  }
  return Object.fromEntries(recording.params.map((param) => [param.name, valueOf(param)!]));
};

/** not-configured when the recording has relative URLs and there is no baseURL to resolve them against. */
export const requireBaseUrl = (recording: FlowRecordingSpec, baseURL: string | null): void => {
  const relative = relativeUrls(recording);
  if (relative.length > 0 && baseURL === null) {
    throw new ToolError(
      'not-configured',
      `flow ${recording.name} uses URLs relative to a profile baseURL (${relative.slice(0, 3).map((u) => JSON.stringify(u)).join(', ')}); pass profile or set TESSERACT_PROFILE / TESSERACT_BASE_URL`,
      { flow: recording.name },
    );
  }
};

export interface RunFlowOptions {
  readonly workspace: Workspace;
  readonly page: Page;
  readonly recording: FlowRecordingSpec;
  /** Resolved parameter values (resolveFlowParams). */
  readonly params: Readonly<Record<string, string>>;
  readonly baseURL: string | null;
  readonly stepTimeoutMs?: number;
  readonly now?: () => Date;
  readonly log?: (message: string) => void;
}

export interface FlowStepResult {
  readonly index: number;
  readonly action: string;
  readonly facetId?: string;
  readonly outcome: 'passed' | 'failed';
  readonly durationMs: number;
  readonly errorFamily?: ErrorFamily;
  readonly message?: string;
}

export interface FlowRunResult {
  readonly outcome: 'passed' | 'failed';
  readonly failedStep?: number;
  readonly errorFamily?: ErrorFamily;
  readonly message?: string;
  readonly finalUrl: string;
  readonly title: string;
  readonly durationMs: number;
  readonly steps: readonly FlowStepResult[];
}

type StepOutcome =
  | { readonly ok: true; readonly report?: ResolutionReport }
  | { readonly ok: false; readonly family: ErrorFamily; readonly message: string; readonly report?: ResolutionReport };

const LOCATOR_OUTCOMES: ReadonlySet<string> = new Set<ResolveOutcome>(['not-found', 'ambiguous', 'not-visible', 'not-enabled']);

const failure = (family: ErrorFamily, message: string, report?: ResolutionReport): StepOutcome => ({ ok: false, family, message, ...(report !== undefined ? { report } : {}) });

/** The text a step's value stands for: the literal, or the parameter's resolved value. */
const stepValue = (step: FlowRecordingStepSpec, params: Readonly<Record<string, string>>): string | undefined => {
  if (step.value === undefined) return undefined;
  if ('literal' in step.value) return step.value.literal;
  const value = params[step.value.param];
  if (value === undefined) throw new ToolError('not-configured', `step ${step.index} uses parameter ${step.value.param}, which has no value`);
  return value;
};

/** A resolution report for the evidence log (a committed file): the detail quotes Playwright, which quotes page text, so it is PII-gated. */
const resolution = (facetId: string, locator: FacetLocator, result: ActionResult, pii: PiiMode): ResolutionReport | undefined => {
  if (result.outcome === 'succeeded') {
    return { facetId, locator: bareLocator(locator), outcome: 'ok', ...(result.matches !== undefined ? { matches: result.matches.visible } : {}), source: 'flow' };
  }
  if (!LOCATOR_OUTCOMES.has(result.family)) return undefined;
  return {
    facetId,
    locator: bareLocator(locator),
    outcome: result.family as ResolveOutcome,
    ...(result.matches !== undefined ? { matches: result.matches.total } : {}),
    source: 'flow',
    detail: redact(result.message, pii).slice(0, 200),
  };
};

const navigateStep = async (options: RunFlowOptions, step: FlowRecordingStepSpec): Promise<StepOutcome> => {
  const { workspace, page, baseURL } = options;
  const route = (await loadScreen(workspace, step.screen).catch(() => null))?.catalog.route;
  // The emitted flow calls the screen's goto(), which opens its route; do the same.
  const target = absoluteUrl(route?.url ?? step.url, baseURL);
  if (target === null) return failure('not-configured', `step ${step.index}: ${JSON.stringify(route?.url ?? step.url)} is relative and there is no baseURL`);
  try {
    await navigate(page, target, { timeoutMs: 30_000 });
  } catch (error) {
    const family = isToolError(error) ? error.family : 'unavailable';
    return failure(family, `step ${step.index}: could not open ${target}: ${error instanceof Error ? error.message : String(error)}`);
  }
  await awaitHydration(page, { budgetMs: workspace.config.observe.hydrationBudgetMs });
  return { ok: true };
};

const facetStep = async (options: RunFlowOptions, step: FlowRecordingStepSpec, facetId: string): Promise<StepOutcome> => {
  const { workspace, page, params } = options;
  const facet = await findFacet(workspace, facetId, options.now !== undefined ? { now: options.now } : {});
  if (facet === null) return failure('not-found', `step ${step.index}: facet ${facetId} is not in memory; record the flow again`);
  if (facet.status === 'retired') return failure('not-found', `step ${step.index}: facet ${facetId} is retired; record the flow again`);
  const locator = bestLocator(facet);
  if (locator === undefined) return failure('not-found', `step ${step.index}: facet ${facetId} has no locator`);
  const value = stepValue(step, params);
  // A row facet's {placeholder} is filled by the step's value (the row it acts on), else by a parameter of the same name.
  const placeholders = locatorParams(locator);
  const locatorValues: Record<string, string> = {
    ...params,
    ...(placeholders.length > 0 && value !== undefined && ['click', 'hover', 'check', 'uncheck'].includes(step.action) ? { [placeholders[0]!]: value } : {}),
  };
  let target;
  try {
    target = toPlaywrightLocator(page, bareLocator(locator), locatorValues);
  } catch (error) {
    return failure(isToolError(error) ? error.family : 'invalid-input', `step ${step.index}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const actionValue = step.action === 'fill' || step.action === 'select' || step.action === 'press' ? value : undefined;
  if ((step.action === 'fill' || step.action === 'select' || step.action === 'press') && actionValue === undefined) {
    return failure('invalid-input', `step ${step.index}: ${step.action} has no value`);
  }
  const result = await performAction(page, target, step.action as Exclude<FlowRecordingStepSpec['action'], 'navigate'>, actionValue, {
    timeoutMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS,
  });
  const report = resolution(facet.id, locator, result, workspace.config.pii);
  if (result.outcome === 'failed') {
    return failure(result.family, `step ${step.index} (${step.action} ${facet.id}): ${result.message}`, report);
  }
  return { ok: true, ...(report !== undefined ? { report } : {}) };
};

const pressStep = async (options: RunFlowOptions, step: FlowRecordingStepSpec): Promise<StepOutcome> => {
  const key = stepValue(step, options.params);
  if (key === undefined) return failure('invalid-input', `step ${step.index}: press has no key`);
  const result = await performAction(options.page, null, 'press', key, { timeoutMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS });
  return result.outcome === 'succeeded' ? { ok: true } : failure(result.family, `step ${step.index} (press ${key}): ${result.message}`);
};

/**
 * Like the emitted flow: a navigate step opens its screen's route, unless it
 * names an element facet (a link the recording followed), which is clicked.
 */
const navigateOrClick = async (options: RunFlowOptions, step: FlowRecordingStepSpec, facetId: string): Promise<StepOutcome> => {
  const facet = await findFacet(options.workspace, facetId, options.now !== undefined ? { now: options.now } : {});
  if (facet === null || facet.kind === 'route') return navigateStep(options, facet === null ? step : { ...step, screen: facet.screen });
  return facetStep(options, { ...step, action: 'click' }, facetId);
};

const runStep = async (options: RunFlowOptions, step: FlowRecordingStepSpec): Promise<StepOutcome> => {
  try {
    if (step.action === 'navigate') {
      return step.facetId === undefined ? await navigateStep(options, step) : await navigateOrClick(options, step, step.facetId);
    }
    if (step.facetId === undefined) {
      if (step.action === 'press') return await pressStep(options, step);
      return failure('invalid-input', `step ${step.index}: ${step.action} has no facet`);
    }
    return await facetStep(options, step, step.facetId);
  } catch (error) {
    if (options.page.isClosed()) return failure('unavailable', `step ${step.index}: the page closed`);
    const family = isToolError(error) ? error.family : 'unclassified';
    return failure(family, `step ${step.index}: ${error instanceof Error ? error.message : String(error)}`);
  }
};

/**
 * Run the recording's steps on `page`. Returns (never throws for what
 * happens on the page): passed, or failed with the first failing step, its
 * error family and message.
 */
export const runFlow = async (options: RunFlowOptions): Promise<FlowRunResult> => {
  const started = Date.now();
  const { page, recording, workspace } = options;
  const steps = [...recording.steps].sort((a, b) => a.index - b.index);
  const results: FlowStepResult[] = [];
  const reports: ResolutionReport[] = [];
  let failed: { readonly step: FlowRecordingStepSpec; readonly family: ErrorFamily; readonly message: string } | null = null;
  for (const step of steps) {
    const stepStarted = Date.now();
    const outcome = await runStep(options, step);
    if (outcome.report !== undefined) reports.push(outcome.report);
    const base = { index: step.index, action: step.action, ...(step.facetId !== undefined ? { facetId: step.facetId } : {}), durationMs: Date.now() - stepStarted };
    if (!outcome.ok) {
      results.push({ ...base, outcome: 'failed', errorFamily: outcome.family, message: outcome.message });
      failed = { step, family: outcome.family, message: outcome.message };
      break;
    }
    if (step.navigatesTo !== undefined && !page.isClosed()) {
      // The recording saw this step navigate; wait for the new page before the next step races it.
      const path = navigationPath(step.navigatesTo);
      const arrived = await page
        .waitForURL((url) => url.pathname.endsWith(path), { timeout: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS })
        .then(() => true, () => false);
      if (!arrived) {
        const message = `step ${step.index}: expected to navigate to ${path} but stayed on ${redactUrl(page.url(), workspace.config.pii)}`;
        results.push({ ...base, outcome: 'failed', errorFamily: 'timeout', message });
        failed = { step, family: 'timeout', message };
        break;
      }
      await awaitHydration(page, { budgetMs: options.stepTimeoutMs ?? DEFAULT_STEP_TIMEOUT_MS }).catch(() => undefined);
    } else if (step.action !== 'navigate' && !page.isClosed()) {
      await settle(page, { budgetMs: SETTLE_BUDGET_MS }).catch(() => undefined);
    }
    results.push({ ...base, outcome: 'passed' });
  }
  if (reports.length > 0) {
    await recordResolutions(workspace, reports, options.now !== undefined ? { now: options.now } : {}).catch((error: unknown) => {
      options.log?.(`flow.run: could not record evidence: ${error instanceof Error ? error.message : String(error)}`);
    });
  }
  const finalUrl = page.isClosed() ? '' : page.url();
  const title = page.isClosed() ? '' : await page.title().catch(() => '');
  return {
    outcome: failed === null ? 'passed' : 'failed',
    ...(failed !== null ? { failedStep: failed.step.index, errorFamily: failed.family, message: failed.message } : {}),
    finalUrl,
    title,
    durationMs: Date.now() - started,
    steps: results,
  };
};

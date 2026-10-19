/**
 * The recording itself: .tesseract/flows/<name>.json, in the contract's
 * FlowRecordingSchema, written by flow.record and read by flow.run and
 * emission. This module is the pure part: building the step list and its
 * parameters as events arrive, URL bookkeeping, and the file I/O.
 *
 * Parameters. Every value typed into a field becomes a parameter named
 * after the facet's page-object member (camelCase): a secret one (password
 * fields, redacted names) has no default and is supplied at run time from
 * TESSERACT_PARAM_<NAME>; any other has the typed text as its default.
 * Typing into the same field again right after (a correction, or a pause
 * mid-word) replaces the previous fill instead of adding a step.
 */
import path from 'node:path';
import { ToolError } from '../core/errors.js';
import { readJson, relativePosix, writeJson } from '../core/fsio.js';
import { camelCase } from '../core/text.js';
import {
  FlowRecordingSchema,
  type FlowParamSpec,
  type FlowRecordingSpec,
  type FlowRecordingStepSpec,
} from '../contract/schemas.js';
import type { Workspace } from '../workspace/workspace.js';

export const FLOW_NAME = /^[a-z0-9][a-z0-9-]{0,62}$/;

export const assertFlowName = (name: string): string => {
  if (!FLOW_NAME.test(name)) throw new ToolError('invalid-input', `flow name must be kebab-case (a-z, 0-9, -), e.g. "login": ${JSON.stringify(name)}`);
  return name;
};

/** Absolute path of .tesseract/flows/<name>.json. */
export const recordingFile = (workspace: Workspace, name: string): string =>
  path.join(workspace.paths.recordings, `${assertFlowName(name)}.json`);

/** Workspace-relative POSIX path of the recording, for tool outputs. */
export const recordingPathOf = (workspace: Workspace, name: string): string => relativePosix(workspace.paths.root, recordingFile(workspace, name));

/** Read and validate a recording. Missing → not-found; unreadable or off-contract → invalid-input. */
export const loadRecording = async (workspace: Workspace, name: string): Promise<FlowRecordingSpec> => {
  const file = recordingFile(workspace, name);
  let raw: unknown;
  try {
    raw = await readJson<unknown>(file);
  } catch (error) {
    throw new ToolError('invalid-input', `${recordingPathOf(workspace, name)} is not valid JSON: ${error instanceof Error ? error.message : String(error)}; record the flow again`, { flow: name });
  }
  if (raw === null) {
    throw new ToolError('not-found', `no recorded flow "${name}": ${recordingPathOf(workspace, name)} does not exist; record it with flow.record`, { flow: name });
  }
  const parsed = FlowRecordingSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ToolError(
      'invalid-input',
      `${recordingPathOf(workspace, name)} is not a flow recording (${issue === undefined ? 'invalid' : `${issue.path.join('.') || '(root)'}: ${issue.message}`}); record the flow again`,
      { flow: name },
    );
  }
  if (parsed.data.name !== name) {
    throw new ToolError('invalid-input', `${recordingPathOf(workspace, name)} records flow "${parsed.data.name}", not "${name}"`, { flow: name });
  }
  return parsed.data;
};

/** Validate against the contract and write; returns the absolute path. */
export const saveRecording = async (workspace: Workspace, recording: FlowRecordingSpec): Promise<string> => {
  const checked = FlowRecordingSchema.parse(recording);
  const file = recordingFile(workspace, checked.name);
  await writeJson(file, checked);
  return file;
};

// ─── URLs ──────────────────────────────────────────────────────────────────

const ABSOLUTE = /^[a-z][a-z0-9+.-]*:/i;

export const isAbsoluteUrl = (url: string): boolean => ABSOLUTE.test(url);

export const isWebUrl = (url: string): boolean => /^https?:\/\//i.test(url);

const withoutHash = (url: string): string => {
  const hash = url.indexOf('#');
  return hash < 0 ? url : url.slice(0, hash);
};

const withoutQuery = (url: string): string => {
  const cut = url.search(/[?#]/);
  return cut < 0 ? url : url.slice(0, cut);
};

/** `url` relative to `baseURL` (no leading slash) when it lives under it; absolute otherwise. The fragment is dropped. */
export const relativeToBase = (url: string, baseURL: string | null): string => {
  const plain = withoutHash(url);
  if (baseURL === null) return plain;
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  if (plain === baseURL || plain === base) return '';
  return plain.startsWith(base) ? plain.slice(base.length) : plain;
};

/** A screen's route: the page URL without query or fragment, relative to baseURL when possible. */
export const routeUrlOf = (url: string, baseURL: string | null): string => relativeToBase(withoutQuery(url), baseURL);

/** An absolute URL for a recorded (possibly relative) one; null when it is relative and there is no baseURL. */
export const absoluteUrl = (url: string, baseURL: string | null): string | null => {
  if (isAbsoluteUrl(url)) return url;
  if (baseURL === null) return null;
  const base = baseURL.endsWith('/') ? baseURL : `${baseURL}/`;
  return url.length === 0 ? baseURL : new URL(url.replace(/^\/+/, ''), base).toString();
};

/** The path of a URL, without a trailing slash; the URL itself when it does not parse. */
export const pathOf = (url: string): string => {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
  } catch {
    return withoutQuery(url).replace(/\/+$/, '');
  }
};

export const samePath = (a: string, b: string): boolean => pathOf(a) === pathOf(b);

/** Every URL in a recording that needs a baseURL to be opened. */
export const relativeUrls = (recording: FlowRecordingSpec): readonly string[] =>
  [
    ...(recording.startUrl !== undefined ? [recording.startUrl] : []),
    ...recording.steps.filter((step) => step.action === 'navigate').map((step) => step.url),
  ].filter((url) => !isAbsoluteUrl(url));

// ─── Building the step list ────────────────────────────────────────────────

export interface RecordingDraft {
  readonly steps: readonly FlowRecordingStepSpec[];
  readonly params: readonly FlowParamSpec[];
}

export const EMPTY_DRAFT: RecordingDraft = { steps: [], params: [] };

/** What one recorded event contributes. */
export interface StepInput {
  readonly action: FlowRecordingStepSpec['action'];
  readonly screen: string;
  readonly url: string;
  readonly facetId?: string;
  /** Page-object member of the facet; names the parameter of a fill. */
  readonly member?: string;
  readonly snapshotId?: string;
  /** fill: the typed text, or a secret whose text never left the page. */
  readonly fill?: { readonly value: string } | { readonly secret: true };
  /** select: the option label; press: the key. */
  readonly literal?: string;
}

export interface Appended {
  readonly draft: RecordingDraft;
  /** True when the event replaced the previous fill of the same field instead of adding a step. */
  readonly merged: boolean;
}

const paramNamed = (params: readonly FlowParamSpec[], name: string): FlowParamSpec | undefined => params.find((p) => p.name === name);

const usesOf = (steps: readonly FlowRecordingStepSpec[], name: string): number =>
  steps.filter((step) => step.value !== undefined && 'param' in step.value && step.value.param === name).length;

/** A fresh parameter name: the member name, then member2, member3, … */
const freshName = (params: readonly FlowParamSpec[], base: string): string => {
  const stem = camelCase(base);
  const taken = new Set(params.map((p) => p.name));
  if (!taken.has(stem)) return stem;
  let n = 2;
  while (taken.has(`${stem}${n}`)) n += 1;
  return `${stem}${n}`;
};

const paramFor = (fill: NonNullable<StepInput['fill']>): Omit<FlowParamSpec, 'name'> =>
  'secret' in fill ? { secret: true } : { secret: false, default: fill.value };

const valueOfParam = (param: FlowParamSpec): FlowRecordingStepSpec['value'] =>
  param.secret ? { param: param.name, secret: true } : { param: param.name };

/**
 * Add one recorded event. A fill reuses the field's parameter when it holds
 * the same value (or both are secrets); a fill right after a fill of the
 * same facet replaces it.
 */
/**
 * Mark the last recorded step as the one that caused a navigation, so replay
 * (flow.run and the emitted flow) waits for the new page instead of racing
 * it. Returns the draft unchanged when there is no step or it already has one.
 */
export const markNavigation = (draft: RecordingDraft, url: string): RecordingDraft => {
  const last = draft.steps[draft.steps.length - 1];
  if (last === undefined || last.action === 'navigate' || last.navigatesTo !== undefined || last.url === url) return draft;
  return { ...draft, steps: [...draft.steps.slice(0, -1), { ...last, navigatesTo: url }] };
};

export const appendStep = (draft: RecordingDraft, input: StepInput): Appended => {
  const base = {
    screen: input.screen,
    url: input.url,
    ...(input.facetId !== undefined ? { facetId: input.facetId } : {}),
    ...(input.snapshotId !== undefined ? { snapshotId: input.snapshotId } : {}),
  };
  if (input.action === 'fill' && input.fill !== undefined) {
    const fill = input.fill;
    const memberName = input.member ?? input.facetId?.split(':').pop() ?? 'value';
    const last = draft.steps[draft.steps.length - 1];
    if (last !== undefined && last.action === 'fill' && last.facetId !== undefined && last.facetId === input.facetId && last.value !== undefined && 'param' in last.value) {
      const previous = paramNamed(draft.params, last.value.param);
      if (previous !== undefined && usesOf(draft.steps, previous.name) === 1) {
        const replaced: FlowParamSpec = { name: previous.name, ...paramFor(fill) };
        const step: FlowRecordingStepSpec = { ...last, ...base, index: last.index, action: 'fill', value: valueOfParam(replaced) };
        return {
          draft: {
            steps: [...draft.steps.slice(0, -1), step],
            params: draft.params.map((p) => (p.name === previous.name ? replaced : p)),
          },
          merged: true,
        };
      }
    }
    const reusable = draft.steps
      .filter((step) => step.action === 'fill' && step.facetId !== undefined && step.facetId === input.facetId && step.value !== undefined && 'param' in step.value)
      .map((step) => paramNamed(draft.params, (step.value as { readonly param: string }).param))
      .find((p): p is FlowParamSpec => p !== undefined && ('secret' in fill ? p.secret : !p.secret && p.default === fill.value));
    const param: FlowParamSpec = reusable ?? { name: freshName(draft.params, memberName), ...paramFor(fill) };
    const step: FlowRecordingStepSpec = { index: draft.steps.length + 1, action: 'fill', ...base, value: valueOfParam(param) };
    return {
      draft: { steps: [...draft.steps, step], params: reusable === undefined ? [...draft.params, param] : draft.params },
      merged: false,
    };
  }
  const step: FlowRecordingStepSpec = {
    index: draft.steps.length + 1,
    action: input.action,
    ...base,
    ...(input.literal !== undefined ? { value: { literal: input.literal } } : {}),
  };
  return { draft: { ...draft, steps: [...draft.steps, step] }, merged: false };
};

/** How a step's value reads in a tool output: the literal, or "{param}" (secrets never have one). */
export const displayValue = (value: FlowRecordingStepSpec['value']): string | undefined =>
  value === undefined ? undefined : 'literal' in value ? value.literal : `{${value.param}}`;

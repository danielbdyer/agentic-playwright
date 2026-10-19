/**
 * The pure parts of flows: building steps and parameters from recorded
 * events, URL bookkeeping, parameter resolution for a run, validation of
 * what the page reports, naming, and the recording file.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Candidate, FlowRecordingSpec } from '../../../src/contract/schemas.js';
import { isToolError } from '../../../src/core/errors.js';
import {
  EMPTY_DRAFT,
  RecorderMessageSchema,
  absoluteUrl,
  appendStep,
  assertFlowName,
  candidateFromDescriptor,
  displayNameOf,
  displayValue,
  loadRecording,
  relativeToBase,
  relativeUrls,
  requireBaseUrl,
  resolveFlowParams,
  routeUrlOf,
  samePath,
  saveRecording,
  screenFor,
  type RecordingDraft,
  type StepInput,
} from '../../../src/flow/index.js';
import type { Workspace } from '../../../src/workspace/workspace.js';
import { removeWorkspace, tempWorkspace } from './helpers.js';

const BASE = 'https://qa.example.com/PolicyApp/';

const fold = (inputs: readonly StepInput[]): RecordingDraft => inputs.reduce((draft, input) => appendStep(draft, input).draft, EMPTY_DRAFT);

const fill = (facetId: string, value: string | null, extra: Partial<StepInput> = {}): StepInput => ({
  action: 'fill',
  screen: 'login',
  url: 'Login',
  facetId,
  member: facetId.split(':')[1]!.replace(/-(\w)/g, (_m, c: string) => c.toUpperCase()),
  fill: value === null ? { secret: true } : { value },
  ...extra,
});

const familyOf = (fn: () => unknown): string | null => {
  try {
    fn();
    return null;
  } catch (error) {
    return isToolError(error) ? error.family : 'thrown';
  }
};

describe('appendStep', () => {
  it('turns typed values into parameters named after the member, secrets without a default', () => {
    const draft = fold([
      fill('login:user-name', 'qa.user'),
      fill('login:password', null),
      { action: 'click', screen: 'login', url: 'Login', facetId: 'login:log-in' },
      { action: 'press', screen: 'home', url: 'Home', literal: 'Escape' },
      { action: 'select', screen: 'home', url: 'Home', facetId: 'home:status', literal: 'Open' },
    ]);
    expect(draft.params).toEqual([
      { name: 'userName', secret: false, default: 'qa.user' },
      { name: 'password', secret: true },
    ]);
    expect(draft.steps.map((s) => [s.index, s.action, s.value ?? null])).toEqual([
      [1, 'fill', { param: 'userName' }],
      [2, 'fill', { param: 'password', secret: true }],
      [3, 'click', null],
      [4, 'press', { literal: 'Escape' }],
      [5, 'select', { literal: 'Open' }],
    ]);
  });

  it('replaces a fill of the same field that came right before it', () => {
    const first = appendStep(EMPTY_DRAFT, fill('search:query', 'POL'));
    const second = appendStep(first.draft, fill('search:query', 'POL-001'));
    expect(second.merged).toBe(true);
    expect(second.draft.steps).toHaveLength(1);
    expect(second.draft.params).toEqual([{ name: 'query', secret: false, default: 'POL-001' }]);
  });

  it('reuses a parameter for the same field and value, and numbers a different value', () => {
    const draft = fold([
      fill('search:query', 'POL-001'),
      { action: 'click', screen: 'search', url: 'Search', facetId: 'search:go' },
      fill('search:query', 'POL-001'),
      { action: 'click', screen: 'search', url: 'Search', facetId: 'search:go' },
      fill('search:query', 'POL-002'),
    ]);
    expect(draft.params).toEqual([
      { name: 'query', secret: false, default: 'POL-001' },
      { name: 'query2', secret: false, default: 'POL-002' },
    ]);
    expect(draft.steps.filter((s) => s.action === 'fill').map((s) => s.value)).toEqual([{ param: 'query' }, { param: 'query' }, { param: 'query2' }]);
  });

  it('does not rewrite a parameter an earlier step shares when merging', () => {
    const draft = fold([
      fill('search:query', 'A'),
      { action: 'click', screen: 'search', url: 'Search', facetId: 'search:go' },
      fill('search:query', 'A'),
      fill('search:query', 'B'),
    ]);
    expect(draft.params).toEqual([
      { name: 'query', secret: false, default: 'A' },
      { name: 'query2', secret: false, default: 'B' },
    ]);
    expect(draft.steps).toHaveLength(4);
  });

  it('shows values the way tool outputs read them', () => {
    expect(displayValue({ literal: 'Enter' })).toBe('Enter');
    expect(displayValue({ param: 'password', secret: true })).toBe('{password}');
    expect(displayValue(undefined)).toBeUndefined();
  });
});

describe('URLs', () => {
  it('are kept relative to the baseURL, without the fragment', () => {
    expect(relativeToBase(`${BASE}Login`, BASE)).toBe('Login');
    expect(relativeToBase(`${BASE}PolicyDetail?id=POL-1#top`, BASE)).toBe('PolicyDetail?id=POL-1');
    expect(relativeToBase(BASE, BASE)).toBe('');
    expect(relativeToBase('https://other.example.com/x', BASE)).toBe('https://other.example.com/x');
    expect(relativeToBase(`${BASE}Login`, null)).toBe(`${BASE}Login`);
  });

  it('give routes without query or fragment', () => {
    expect(routeUrlOf(`${BASE}PolicyDetail?id=POL-1#top`, BASE)).toBe('PolicyDetail');
  });

  it('resolve back against the baseURL, and need one when relative', () => {
    expect(absoluteUrl('Login', BASE)).toBe(`${BASE}Login`);
    expect(absoluteUrl('/Login', BASE)).toBe(`${BASE}Login`);
    expect(absoluteUrl('', BASE)).toBe(BASE);
    expect(absoluteUrl('https://x.example.com/a', null)).toBe('https://x.example.com/a');
    expect(absoluteUrl('Login', null)).toBeNull();
  });

  it('compare by path', () => {
    expect(samePath(`${BASE}Login`, `${BASE}Login/?next=1`)).toBe(true);
    expect(samePath(`${BASE}Login`, `${BASE}PolicySearch`)).toBe(false);
  });

  it('a recording with relative URLs needs a baseURL to run', () => {
    const recording: FlowRecordingSpec = {
      name: 'login',
      startUrl: 'Login',
      steps: [{ index: 1, action: 'navigate', screen: 'login', url: 'Login' }],
      params: [],
    };
    expect(relativeUrls(recording)).toEqual(['Login', 'Login']);
    expect(familyOf(() => requireBaseUrl(recording, null))).toBe('not-configured');
    expect(familyOf(() => requireBaseUrl(recording, BASE))).toBeNull();
  });
});

describe('resolveFlowParams', () => {
  const recording = {
    name: 'login',
    params: [
      { name: 'userName', secret: false, default: 'qa.user' },
      { name: 'password', secret: true },
    ],
  };

  it('takes params, then TESSERACT_PARAM_<NAME>, then the default', () => {
    expect(resolveFlowParams(recording, {}, { TESSERACT_PARAM_PASSWORD: 'pw' })).toEqual({ userName: 'qa.user', password: 'pw' });
    expect(resolveFlowParams(recording, { userName: 'other', password: 'given' }, { TESSERACT_PARAM_PASSWORD: 'pw', TESSERACT_PARAM_USERNAME: 'env' })).toEqual({
      userName: 'other',
      password: 'given',
    });
    expect(resolveFlowParams(recording, {}, { TESSERACT_PARAM_PASSWORD: 'pw', TESSERACT_PARAM_USERNAME: 'env' }).userName).toBe('env');
  });

  it('is not-configured for a secret with no value, naming the variable, and invalid-input for an unknown name', () => {
    try {
      resolveFlowParams(recording, {}, {});
      expect.unreachable();
    } catch (error) {
      expect(isToolError(error) && error.family).toBe('not-configured');
      expect((error as Error).message).toContain('TESSERACT_PARAM_PASSWORD');
    }
    expect(familyOf(() => resolveFlowParams(recording, { pasword: 'x' }, {}))).toBe('invalid-input');
  });
});

describe('messages from the page', () => {
  const action = {
    type: 'action',
    token: 't',
    doc: 'd1',
    seq: 1,
    action: 'fill',
    element: 'd1:1',
    url: `${BASE}Login`,
    at: 1,
    snapshotId: null,
    ref: null,
    descriptor: null,
    value: 'qa.user',
  };

  it('are validated before Node acts on them', () => {
    expect(RecorderMessageSchema.safeParse(action).success).toBe(true);
    expect(RecorderMessageSchema.safeParse({ type: 'hello' }).success).toBe(true);
    expect(RecorderMessageSchema.safeParse({ ...action, action: 'drag' }).success).toBe(false);
    expect(RecorderMessageSchema.safeParse({ ...action, seq: 'one' }).success).toBe(false);
    expect(RecorderMessageSchema.safeParse({ ...action, secret: false }).success).toBe(false);
    expect(RecorderMessageSchema.safeParse({ ...action, value: 'x'.repeat(10_001) }).success).toBe(false);
    expect(RecorderMessageSchema.safeParse({ type: 'stop' }).success).toBe(false);
    expect(RecorderMessageSchema.safeParse('stop').success).toBe(false);
  });
});

describe('naming', () => {
  const candidate = (overrides: Partial<Candidate>): Candidate => ({
    ref: 'c1',
    role: 'textbox',
    name: '',
    namingSource: 'none',
    affordance: 'native',
    interactive: true,
    tag: 'input',
    visible: true,
    enabled: true,
    inViewport: true,
    ...overrides,
  });

  it('names a facet by its accessible name, then placeholder, test id, designer id, role', () => {
    expect(displayNameOf(candidate({ name: 'Username' }))).toBe('Username');
    expect(displayNameOf(candidate({ name: '<email>', placeholder: 'Email address' }))).toBe('Email address');
    expect(displayNameOf(candidate({ testId: 'search-box' }))).toBe('search-box');
    expect(displayNameOf(candidate({ id: 'Input_Discount', idKind: 'designer' }))).toBe('Input Discount');
    expect(displayNameOf(candidate({ id: 'b3-Input_Search', idKind: 'structural' }))).toBe('textbox control');
  });

  it('derives the screen from the URL path, or takes the given one on the start page', () => {
    const start = { url: `${BASE}Login` };
    expect(screenFor(`${BASE}Login`, BASE, start)).toBe('login');
    expect(screenFor(`${BASE}PolicySearch`, BASE, start)).toBe('policy-search');
    expect(screenFor(`${BASE}Login?x=1`, BASE, { ...start, screen: 'sign-in' })).toBe('sign-in');
    expect(screenFor(`${BASE}PolicySearch`, BASE, { ...start, screen: 'sign-in' })).toBe('policy-search');
  });

  it('builds a PII-gated candidate from an in-page description', () => {
    const built = candidateFromDescriptor(
      {
        ref: 'recorded',
        role: 'textbox',
        name: 'jane.doe@example.com',
        namingSource: 'value',
        affordance: 'native',
        interactive: true,
        category: 'control',
        tag: 'input',
        landmark: 'main',
        placeholder: 'Email',
        visible: true,
      },
      'recorded-3',
      'standard',
    );
    expect(built.ref).toBe('recorded-3');
    expect(built.name).not.toContain('jane.doe');
    expect(built.landmark).toBe('main');
    expect(displayNameOf(built)).toBe('Email');
  });

  it('accepts kebab-case flow names only', () => {
    expect(assertFlowName('login')).toBe('login');
    expect(familyOf(() => assertFlowName('../etc/passwd'))).toBe('invalid-input');
    expect(familyOf(() => assertFlowName('Login'))).toBe('invalid-input');
  });
});

describe('the recording file', () => {
  let workspace: Workspace;

  beforeAll(async () => {
    workspace = await tempWorkspace();
  });

  afterAll(async () => {
    await removeWorkspace(workspace);
  });

  it('round-trips through the contract schema', async () => {
    const recording: FlowRecordingSpec = {
      name: 'login',
      startUrl: 'Login',
      recordedAt: '2026-10-19T00:00:00.000Z',
      steps: [
        { index: 1, action: 'navigate', screen: 'login', url: 'Login' },
        { index: 2, action: 'fill', facetId: 'login:password', screen: 'login', url: 'Login', value: { param: 'password', secret: true } },
      ],
      params: [{ name: 'password', secret: true }],
    };
    const file = await saveRecording(workspace, recording);
    expect(path.relative(workspace.paths.root, file)).toBe(path.join('.tesseract', 'flows', 'login.json'));
    expect(await loadRecording(workspace, 'login')).toEqual(recording);
  });

  it('is not-found when missing and invalid-input when it is not a recording', async () => {
    await expect(loadRecording(workspace, 'nope')).rejects.toMatchObject({ family: 'not-found' });
    await fs.writeFile(path.join(workspace.paths.recordings, 'bad.json'), '{"name":"bad","steps":[{"index":0}]}');
    await expect(loadRecording(workspace, 'bad')).rejects.toMatchObject({ family: 'invalid-input' });
    await fs.writeFile(path.join(workspace.paths.recordings, 'torn.json'), '{"name":');
    await expect(loadRecording(workspace, 'torn')).rejects.toMatchObject({ family: 'invalid-input' });
  });
});

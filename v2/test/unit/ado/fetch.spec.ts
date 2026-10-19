import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { TestCaseSchema } from '../../../src/contract/schemas.js';
import { loadWorkspace, type Workspace } from '../../../src/workspace/workspace.js';
import { createAdoClient, type AdoClient } from '../../../src/ado/client.js';
import { fetchTestCases, fetchTestCasesByIds, fetchTestCasesBySuite, fetchTestCasesByWiql, fetchTestPoints } from '../../../src/ado/fetch.js';
import { casePath, fetchWithCache, listCachedCases, loadCase, saveCase } from '../../../src/ado/cache.js';
import { dataSourceXml, parametersXml, startMockAdo, stepsXml, type MockAdo, type MockCase } from '../../support/mock-ado.js';

/** Appendix C, as the e2e test serves it. */
const APPENDIX_C_STEPS = `<steps id="0" last="5">
  <step id="2" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Navigate to Policy Search screen&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Policy Search screen loads&lt;/P&gt;</parameterizedString><description/></step>
  <step id="3" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Enter @policyNumber in search field&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Policy Number accepts a valid policy&lt;/P&gt;</parameterizedString><description/></step>
  <step id="4" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Click Search button&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Search runs&lt;/P&gt;</parameterizedString><description/></step>
  <step id="5" type="ValidateStep"><parameterizedString isformatted="true">&lt;P&gt;Verify search results show policy&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Matching policy appears in Search Results&lt;/P&gt;</parameterizedString><description/></step>
</steps>`;

const POLICY_CASE: MockCase = {
  id: 10001,
  rev: 3,
  title: 'Verify policy search returns matching policy',
  tags: 'smoke; billing',
  priority: 1,
  steps: APPENDIX_C_STEPS,
  parameters: parametersXml(['policyNumber']),
  dataSource: '<NewDataSet><Table1><policyNumber>POL-001</policyNumber></Table1></NewDataSet>',
};

const LOGIN_CASE: MockCase = {
  id: 9999,
  rev: 2,
  title: 'Log in and open the dashboard',
  tags: 'smoke',
  steps: stepsXml([{ compref: 2, ref: 900 }, { id: 7, action: 'Open the dashboard', expected: 'Dashboard shows' }]),
  parameters: parametersXml(['region']),
  dataSource: dataSourceXml([{ region: 'EU', username: 'eu.user' }, { region: 'US', username: '' }], ['region', 'username']),
};

const OTHER_CASE: MockCase = { id: 10002, title: 'Archive a policy', tags: 'regression', steps: stepsXml([{ id: 1, action: 'Archive', expected: 'Archived' }]) };

const SHARED_LOGIN = {
  id: 900,
  rev: 4,
  title: 'Log in',
  steps: stepsXml([
    { id: 1, action: 'Open the login page', expected: 'Login form shows' },
    { id: 3, action: 'Sign in as @username', expected: 'Signed in' },
  ]),
  parameters: parametersXml(['username']),
};

const POINTS = [
  { planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 },
  { planId: 7, suiteId: 8, testCaseId: 9999, pointId: 1201, configurationName: 'Chrome' },
  { planId: 7, suiteId: 8, testCaseId: 9999, pointId: 1202, configurationName: 'Edge', configurationId: 2 },
  { planId: 7, suiteId: 9, testCaseId: 10002, pointId: 1301 },
];

const caught = async (promise: Promise<unknown>): Promise<ToolError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error('expected a ToolError');
};

describe('fetching test cases from the mock', () => {
  let mock: MockAdo;
  let client: AdoClient;
  const waits: number[] = [];

  beforeAll(async () => {
    mock = await startMockAdo({ cases: [POLICY_CASE, LOGIN_CASE, OTHER_CASE], sharedSteps: [SHARED_LOGIN], points: POINTS, pageSize: 1 });
    client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat', sleep: async (ms) => void waits.push(ms) });
  });
  afterAll(async () => mock.close());
  beforeEach(() => {
    mock.clearRequests();
    waits.length = 0;
  });

  it('fetches by ids in one batch, expands shared steps from one more batch, and sorts numerically', async () => {
    const result = await fetchTestCasesByIds(client, ['10001', '9999']);
    expect(result.testCases.map((testCase) => testCase.id)).toEqual(['9999', '10001']);
    for (const testCase of result.testCases) expect(TestCaseSchema.strict().parse(testCase)).toEqual(testCase);

    const policy = result.testCases[1]!;
    expect(policy.steps.map((step) => [step.index, step.stepIdentifier, step.action, step.expected])).toEqual([
      [1, '2', 'Navigate to Policy Search screen', 'Policy Search screen loads'],
      [2, '3', 'Enter @policyNumber in search field', 'Policy Number accepts a valid policy'],
      [3, '4', 'Click Search button', 'Search runs'],
      [4, '5', 'Verify search results show policy', 'Matching policy appears in Search Results'],
    ]);
    expect(policy).toMatchObject({ revision: 3, tags: ['smoke', 'billing'], priority: 1, parameters: ['policyNumber'], dataRows: [{ policyNumber: 'POL-001' }] });
    expect(policy.url).toBe(`${mock.url}/demo/_workitems/edit/10001`);
    expect(policy.points).toBeUndefined();

    const login = result.testCases[0]!;
    expect(login.steps.map((step) => [step.stepIdentifier, step.sharedStepId])).toEqual([
      ['2;1', 900],
      ['2;3', 900],
      ['7', undefined],
    ]);
    expect(login.parameters).toEqual(['region', 'username']);
    expect(login.dataRows).toEqual([
      { region: 'EU', username: 'eu.user' },
      { region: 'US', username: '' },
    ]);

    const batches = mock.requests.filter((request) => request.path === '/_apis/wit/workitemsbatch');
    expect(batches).toHaveLength(2);
    expect(batches[0]!.body).toMatchObject({ ids: [10001, 9999], errorPolicy: 'omit' });
    expect((batches[0]!.body as { fields: string[] }).fields).toEqual(expect.arrayContaining(['Microsoft.VSTS.TCM.Steps', 'Microsoft.VSTS.TCM.LocalDataSource', 'System.Rev']));
    expect(batches[1]!.body).toMatchObject({ ids: [900], errorPolicy: 'omit' });
    expect(mock.requests.every((request) => request.query['api-version'] === '7.1')).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it('warns about ids that do not exist or are not test cases, and fails only when nothing came back', async () => {
    const result = await fetchTestCasesByIds(client, [10001, 424242, 900]);
    expect(result.testCases.map((testCase) => testCase.id)).toEqual(['10001']);
    expect(result.warnings).toEqual([
      'work item 424242 not returned (deleted, not visible to the token, or nonexistent)',
      'work item 900 is a Shared Steps, not a Test Case; skipped',
    ]);
    const error = await caught(fetchTestCasesByIds(client, ['424242']));
    expect(error.family).toBe('not-found');
    expect((await caught(fetchTestCasesByIds(client, ['abc']))).family).toBe('invalid-input');
  });

  it('runs WIQL with $top and fetches what it names', async () => {
    const result = await fetchTestCasesByWiql(client, "SELECT [System.Id] FROM WorkItems WHERE [System.WorkItemType] = 'Test Case' AND [System.Tags] CONTAINS 'smoke'", 50);
    expect(result.testCases.map((testCase) => testCase.id)).toEqual(['9999', '10001']);
    const wiql = mock.requests.find((request) => request.path === '/_apis/wit/wiql')!;
    expect(wiql.method).toBe('POST');
    expect(wiql.query.$top).toBe('50');
    expect(wiql.body).toEqual({ query: expect.stringContaining('CONTAINS') });
  });

  it('reports a WIQL syntax error as invalid input and an empty result as a warning', async () => {
    expect((await caught(fetchTestCasesByWiql(client, 'DELETE everything'))).family).toBe('invalid-input');
    const empty = await fetchTestCasesByWiql(client, "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'nothing'");
    expect(empty).toEqual({ testCases: [], warnings: ['the WIQL query returned no matching work items'] });
  });

  it('reads a suite through continuation tokens and attaches test points per configuration', async () => {
    const result = await fetchTestCasesBySuite(client, 7, 8);
    expect(result.testCases.map((testCase) => [testCase.id, testCase.points])).toEqual([
      [
        '9999',
        [
          { pointId: 1201, planId: 7, suiteId: 8, configurationName: 'Chrome' },
          { pointId: 1202, planId: 7, suiteId: 8, configurationName: 'Edge' },
        ],
      ],
      ['10001', [{ pointId: 1203, planId: 7, suiteId: 8, configurationName: 'Windows 10' }]],
    ]);
    const pages = mock.requests.filter((request) => /\/testplan\/Plans\/7\/Suites\/8\/TestCase$/i.test(request.path));
    expect(pages.map((request) => request.query.continuationToken)).toEqual([undefined, '1']);
  });

  it('reads every suite of a plan when no suite is given', async () => {
    const result = await fetchTestCasesBySuite(client, 7);
    expect(result.testCases.map((testCase) => testCase.id)).toEqual(['9999', '10001', '10002']);
    expect(result.testCases[2]!.points).toEqual([{ pointId: 1301, planId: 7, suiteId: 9, configurationName: 'Windows 10' }]);
  });

  it('applies ids and WIQL as filters on a suite before fetching work items', async () => {
    const byIds = await fetchTestCases(client, { planId: 7, suiteId: 8, ids: ['10001', '10002'] });
    expect(byIds.testCases.map((testCase) => testCase.id)).toEqual(['10001']);
    expect(byIds.warnings).toEqual(['case 10002 not in suite 8 of test plan 7']);
    const batch = mock.requests.find((request) => request.path === '/_apis/wit/workitemsbatch')!;
    expect(batch.body).toMatchObject({ ids: [10001] });

    const byWiql = await fetchTestCases(client, { planId: 7, wiql: "SELECT [System.Id] FROM WorkItems WHERE [System.Tags] CONTAINS 'regression'" });
    expect(byWiql.testCases.map((testCase) => testCase.id)).toEqual(['10002']);
  });

  it('validates the selector', async () => {
    expect((await caught(fetchTestCases(client, {}))).message).toMatch(/nothing to fetch/);
    expect((await caught(fetchTestCases(client, { suiteId: 8 }))).message).toMatch(/suiteId needs planId/);
  });

  it('reports an unknown suite as not-found', async () => {
    const error = await caught(fetchTestCasesBySuite(client, 7, 99));
    expect(error.family).toBe('not-found');
    expect(error.message).toMatch(/test plan 7 suite 99/);
  });

  it('resolves the points of one case', async () => {
    expect(await fetchTestPoints(client, 7, 8, 9999)).toEqual([
      { pointId: 1201, planId: 7, suiteId: 8, configurationName: 'Chrome' },
      { pointId: 1202, planId: 7, suiteId: 8, configurationName: 'Edge' },
    ]);
  });

  it('retries a throttled batch after Retry-After', async () => {
    mock.fail({ method: 'POST', path: '/_apis/wit/workitemsbatch', status: 429, retryAfter: 1 });
    const result = await fetchTestCasesByIds(client, ['10002']);
    expect(result.testCases.map((testCase) => testCase.id)).toEqual(['10002']);
    expect(waits).toEqual([1000]);
    expect(mock.requests.filter((request) => request.path === '/_apis/wit/workitemsbatch')).toHaveLength(2);
  });

  it('reports a server outage as unavailable after the retry budget', async () => {
    mock.fail({ method: 'POST', path: '/_apis/wit/workitemsbatch', status: 503, times: 3 });
    const fragile = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat', maxRetries: 2, sleep: async () => undefined });
    const error = await caught(fetchTestCasesByIds(fragile, ['10002']));
    expect(error.family).toBe('unavailable');
    expect(error.detail).toMatchObject({ attempts: 3, status: 503 });
  });
});

describe('batching beyond 200 ids', () => {
  it('splits workitemsbatch calls at 200 ids', async () => {
    const cases: MockCase[] = Array.from({ length: 205 }, (_, i) => ({ id: 20_000 + i, steps: stepsXml([{ id: 1, action: `Step of ${i}` }]) }));
    const mock = await startMockAdo({ cases });
    try {
      const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
      const result = await fetchTestCasesByIds(client, cases.map((item) => String(item.id)));
      expect(result.testCases).toHaveLength(205);
      const sizes = mock.requests.map((request) => (request.body as { ids: number[] }).ids.length);
      expect(sizes).toEqual([200, 5]);
    } finally {
      await mock.close();
    }
  });
});

describe('authentication against the mock', () => {
  it('turns a rejected PAT into a not-configured error that names the variable', async () => {
    const mock = await startMockAdo({ cases: [POLICY_CASE], pat: 'the-right-one' });
    try {
      const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'stale-token' });
      const error = await caught(fetchTestCasesByIds(client, ['10001']));
      expect(error.family).toBe('not-configured');
      expect(error.message).toMatch(/HTTP 401/);
      expect(error.message).toMatch(/AZURE_DEVOPS_PAT/);
      const good = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'the-right-one' });
      expect((await fetchTestCasesByIds(good, ['10001'])).testCases).toHaveLength(1);
    } finally {
      await mock.close();
    }
  });
});

describe('the case cache', () => {
  let root: string;
  let workspace: Workspace;
  let mock: MockAdo;
  let client: AdoClient;

  beforeAll(async () => {
    mock = await startMockAdo({ cases: [POLICY_CASE, LOGIN_CASE], sharedSteps: [SHARED_LOGIN], points: POINTS });
    client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
  });
  afterAll(async () => mock.close());
  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), 'tqa-ado-cache-'));
    workspace = await loadWorkspace(root, {});
    mock.clearRequests();
  });
  afterEach(async () => rm(root, { recursive: true, force: true }));

  it('round-trips a case and lists cached ids numerically', async () => {
    const { testCases } = await fetchTestCasesByIds(client, ['10001', '9999']);
    for (const testCase of testCases) await saveCase(workspace, testCase);
    expect(await loadCase(workspace, '10001')).toEqual(testCases[1]);
    expect(await loadCase(workspace, '12345')).toBeNull();
    expect(await listCachedCases(workspace)).toEqual(['9999', '10001']);
    expect(casePath(workspace, '10001')).toBe(path.join(root, '.tesseract', 'cases', '10001.json'));
  });

  it('refuses ids that would escape the cache directory and reports a corrupt file', async () => {
    expect(() => casePath(workspace, '../config')).toThrow(ToolError);
    await mkdir(workspace.paths.cases, { recursive: true });
    await writeFile(path.join(workspace.paths.cases, '777.json'), '{"id":"777"}');
    const error = await caught(loadCase(workspace, '777'));
    expect(error.family).toBe('malformed-response');
    expect(error.message).toMatch(/refresh/);
    await writeFile(path.join(workspace.paths.cases, '778.json'), '{not json');
    expect((await caught(loadCase(workspace, '778'))).family).toBe('malformed-response');
  });

  it('answers id requests from the cache unless refresh is set, and writes every fetched case', async () => {
    const first = await fetchWithCache(workspace, client, { ids: ['10001'] });
    expect(first.source).toBe('ado');
    expect(await listCachedCases(workspace)).toEqual(['10001']);
    mock.clearRequests();

    const second = await fetchWithCache(workspace, client, { ids: ['10001'] });
    expect(second).toEqual({ testCases: first.testCases, source: 'cache', warnings: [] });
    expect(mock.requests).toHaveLength(0);

    const refreshed = await fetchWithCache(workspace, client, { ids: ['10001'], refresh: true });
    expect(refreshed.source).toBe('ado');
    expect(mock.requests.length).toBeGreaterThan(0);

    const suite = await fetchWithCache(workspace, client, { planId: 7, suiteId: 8 });
    expect(suite.source).toBe('ado');
    expect(await listCachedCases(workspace)).toEqual(['9999', '10001']);
    expect((await loadCase(workspace, '9999'))?.points).toHaveLength(2);
  });

  it('serves cached cases when Azure DevOps is not configured, and says what to set otherwise', async () => {
    await fetchWithCache(workspace, client, { ids: ['10001'] });
    const offline = await fetchWithCache(workspace, null, { ids: ['10001'], refresh: true });
    expect(offline.source).toBe('cache');
    expect(offline.warnings).toEqual(['Azure DevOps is not configured; returned the cached copies']);
    const error = await caught(fetchWithCache(workspace, null, { ids: ['10001', '9999'] }));
    expect(error.family).toBe('not-configured');
    expect(error.message).toMatch(/AZURE_DEVOPS_PAT/);
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ToolError } from '../../../src/core/errors.js';
import { readJsonl } from '../../../src/core/fsio.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import type { TestCase } from '../../../src/contract/schemas.js';
import { createAdoClient, type AdoClient } from '../../../src/ado/client.js';
import { fetchTestCasesByIds, fetchTestCasesBySuite } from '../../../src/ado/fetch.js';
import { publishResults, type PublishOptions } from '../../../src/ado/publish.js';
import { memoryLedger, workspaceLedger, type PublishLedgerEntry } from '../../../src/ado/ledger.js';
import { automatedTestId } from '../../../src/ado/automation.js';
import { dataSourceXml, parametersXml, startMockAdo, stepsXml, type MockAdo, type MockAdoOptions, type MockRequest } from '../../support/mock-ado.js';

const NOW = new Date('2026-10-19T10:00:00.000Z');
const now = (): Date => NOW;

const POLICY_STEPS = stepsXml([
  { id: 2, action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
  { id: 3, action: 'Enter @policyNumber in search field', expected: 'Policy Number accepts a valid policy' },
  { id: 4, action: 'Click Search button', expected: 'Search runs' },
  { id: 5, action: 'Verify search results show policy', expected: 'Matching policy appears in Search Results', type: 'ValidateStep' },
]);

const MOCK: MockAdoOptions = {
  cases: [
    {
      id: 10001,
      rev: 3,
      title: 'Verify policy search returns matching policy',
      steps: POLICY_STEPS,
      parameters: parametersXml(['policyNumber']),
      dataSource: dataSourceXml([{ policyNumber: 'POL-001' }]),
    },
    {
      id: 9999,
      rev: 2,
      title: 'Log in and open the dashboard',
      steps: stepsXml([{ compref: 2, ref: 900 }, { id: 7, action: 'Open the dashboard', expected: 'Dashboard shows' }]),
      parameters: parametersXml(['region']),
      dataSource: dataSourceXml([{ region: 'EU', username: 'eu.user' }, { region: 'US', username: 'us.user' }]),
    },
    { id: 10002, title: 'Not in the suite', steps: stepsXml([{ id: 1, action: 'x' }]) },
  ],
  sharedSteps: [
    {
      id: 900,
      rev: 4,
      steps: stepsXml([
        { id: 1, action: 'Open the login page', expected: 'Login form shows' },
        { id: 3, action: 'Sign in as @username', expected: 'Signed in' },
      ]),
      parameters: parametersXml(['username']),
    },
  ],
  points: [
    { planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 },
    { planId: 7, suiteId: 8, testCaseId: 9999, pointId: 1201, configurationName: 'Chrome' },
    { planId: 7, suiteId: 8, testCaseId: 9999, pointId: 1202, configurationName: 'Edge', configurationId: 2 },
  ],
};

const passedPolicy = {
  testCaseId: '10001',
  outcome: 'Passed' as const,
  durationMs: 5321,
  traceRef: 'test-results/policy/trace.zip',
  steps: [
    { stepIdentifier: '2', outcome: 'Passed' as const, durationMs: 800 },
    { stepIdentifier: '3', outcome: 'Passed' as const, durationMs: 400 },
    { stepIdentifier: '4', outcome: 'Passed' as const, durationMs: 300 },
    { stepIdentifier: '5', outcome: 'Passed' as const, durationMs: 900 },
  ],
};

const summary = (requests: readonly MockRequest[]): readonly string[] => requests.map((request) => `${request.method} ${request.path}`);

const caught = async (promise: Promise<unknown>): Promise<ToolError> => {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error('expected a ToolError');
};

describe('publishResults', () => {
  let mock: MockAdo;
  let client: AdoClient;
  const options = (overrides: Partial<PublishOptions> = {}): PublishOptions => ({
    planId: 7,
    suiteId: 8,
    runName: 'nightly 1',
    results: [passedPolicy],
    now,
    ...overrides,
  });

  const start = async (extra: Partial<MockAdoOptions> = {}): Promise<void> => {
    mock = await startMockAdo({ ...MOCK, ...extra });
    client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat', sleep: async () => undefined });
  };
  afterEach(async () => mock?.close());

  it('creates the run, maps points to results, updates them, and completes the run, in that order', async () => {
    await start();
    const ledger = memoryLedger();
    const published = await publishResults(client, options(), ledger);

    expect(published).toEqual({
      runId: 4711,
      url: `${mock.url}/demo/_TestManagement/Runs?runId=4711&_a=runCharts`,
      resultIds: [100000],
      alreadyPublished: false,
    });
    expect(summary(mock.requests)).toEqual([
      'GET /_apis/testplan/Plans/7/Suites/8/TestPoint',
      'POST /_apis/test/runs',
      'GET /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/runs/4711',
    ]);
    const [points, create, list, update, complete] = mock.requests;
    expect(points!.query).toMatchObject({ testCaseId: '10001', 'api-version': '7.1' });
    expect(create!.body).toEqual({
      name: 'nightly 1',
      plan: { id: '7' },
      pointIds: [1203],
      automated: true,
      state: 'InProgress',
      startedDate: '2026-10-19T10:00:00.000Z',
      comment: 'Published by tesseract-qa',
    });
    expect(list!.query).toMatchObject({ $top: '1000', $skip: '0' });
    expect(update!.contentType).toBe('application/json');
    expect(update!.body).toEqual([
      {
        id: 100000,
        state: 'Completed',
        outcome: 'Passed',
        durationInMs: 5321,
        startedDate: '2026-10-19T09:59:54.679Z',
        completedDate: '2026-10-19T10:00:00.000Z',
        comment: '[tesseract-qa] trace: test-results/policy/trace.zip',
        iterationDetails: [
          {
            id: 1,
            outcome: 'Passed',
            durationInMs: 5321,
            startedDate: '2026-10-19T09:59:54.679Z',
            completedDate: '2026-10-19T10:00:00.000Z',
            comment: 'trace: test-results/policy/trace.zip',
            actionResults: [
              { actionPath: '00000002', iterationId: 1, stepIdentifier: '2', outcome: 'Passed', durationInMs: 800 },
              { actionPath: '00000003', iterationId: 1, stepIdentifier: '3', outcome: 'Passed', durationInMs: 400 },
              { actionPath: '00000004', iterationId: 1, stepIdentifier: '4', outcome: 'Passed', durationInMs: 300 },
              { actionPath: '00000005', iterationId: 1, stepIdentifier: '5', outcome: 'Passed', durationInMs: 900 },
            ],
          },
        ],
      },
    ]);
    expect(complete!.body).toEqual({ state: 'Completed', completedDate: '2026-10-19T10:00:00.000Z' });

    expect(mock.runs()[0]).toMatchObject({ id: 4711, name: 'nightly 1', state: 'Completed', automated: true, pointIds: [1203] });
    expect(mock.results(4711)[0]).toMatchObject({ id: 100000, outcome: 'Passed', state: 'Completed', testPoint: { id: '1203' } });
    expect(ledger.snapshot().map((entry) => [entry.state, entry.runId])).toEqual([
      ['pending', undefined],
      ['created', 4711],
      ['completed', 4711],
    ]);
  });

  it('is idempotent per run name: a second publish sends nothing and returns the recorded run', async () => {
    await start();
    const root = await mkdtemp(path.join(os.tmpdir(), 'tqa-ado-ledger-'));
    try {
      const workspace = await loadWorkspace(root, {});
      const first = await publishResults(client, options(), workspaceLedger(workspace));
      const sent = mock.requests.length;
      const second = await publishResults(client, options({ results: [{ ...passedPolicy, outcome: 'Failed' }] }), workspaceLedger(workspace));
      expect(second).toEqual({ ...first, alreadyPublished: true });
      expect(mock.requests).toHaveLength(sent);
      const lines = await readJsonl<PublishLedgerEntry>(workspace.paths.publishReceipts);
      expect(lines.map((line) => line.state)).toEqual(['pending', 'created', 'completed']);
      expect(lines[2]).toMatchObject({ runName: 'nightly 1', planId: 7, suiteId: 8, runId: 4711, resultIds: [100000], pointIds: [1203] });

      const reused = await caught(publishResults(client, options({ suiteId: 9 }), workspaceLedger(workspace)));
      expect(reused.family).toBe('invalid-input');
      expect(reused.message).toMatch(/already used for test plan 7 suite 8/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('recovers from a crash after the run was created by finding it by title instead of creating a second run', async () => {
    await start({ failures: [{ method: 'POST', path: /\/_apis\/test\/runs\?/, mode: 'process-then-drop' }] });
    const ledger = memoryLedger();
    const live = options({ now: undefined });

    const crashed = await caught(publishResults(client, live, ledger));
    expect(crashed.family).toBe('unavailable');
    expect(ledger.snapshot().map((entry) => entry.state)).toEqual(['pending']);
    expect(mock.runs()).toHaveLength(1); // ADO did create it; we never heard back
    expect(mock.requests.filter((request) => request.method === 'POST' && request.path === '/_apis/test/runs')).toHaveLength(1);

    mock.clearRequests();
    const recovered = await publishResults(client, live, ledger);
    expect(recovered).toMatchObject({ runId: 4711, resultIds: [100000], alreadyPublished: false });
    expect(summary(mock.requests)).toEqual([
      'GET /_apis/testplan/Plans/7/Suites/8/TestPoint',
      'GET /_apis/test/runs',
      'GET /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/runs/4711',
    ]);
    const lookup = mock.requests[1]!;
    expect(lookup.query).toMatchObject({ runTitle: 'nightly 1', planIds: '7' });
    const window = Date.parse(lookup.query.maxLastUpdatedDate!) - Date.parse(lookup.query.minLastUpdatedDate!);
    expect(window).toBeLessThanOrEqual(7 * 24 * 60 * 60 * 1000);
    expect(mock.runs()).toHaveLength(1);
    expect(mock.runs()[0]!.state).toBe('Completed');
    expect(ledger.snapshot().map((entry) => entry.state)).toEqual(['pending', 'created', 'completed']);
  });

  it('creates a new run when a pending attempt left nothing behind', async () => {
    await start({ failures: [{ method: 'POST', path: /\/_apis\/test\/runs\?/, mode: 'drop' }] });
    const ledger = memoryLedger();
    const live = options({ now: undefined });
    expect((await caught(publishResults(client, live, ledger))).family).toBe('unavailable');
    expect(mock.runs()).toHaveLength(0);
    const second = await publishResults(client, live, ledger);
    expect(second.runId).toBe(4711);
    expect(mock.runs()).toHaveLength(1);
  });

  it('resumes a created run directly, and only records a run that is already complete', async () => {
    await start();
    const inProgress = mock.addRun({ name: 'nightly 2', planId: 7, pointIds: [1203] });
    const ledger = memoryLedger([{ at: NOW.toISOString(), runName: 'nightly 2', state: 'created', planId: 7, suiteId: 8, runId: inProgress.id, url: 'u' }]);
    const resumed = await publishResults(client, options({ runName: 'nightly 2' }), ledger);
    expect(resumed).toMatchObject({ runId: inProgress.id, alreadyPublished: false });
    expect(mock.requests.some((request) => request.method === 'POST')).toBe(false);
    expect(mock.runs()[0]!.state).toBe('Completed');

    const done = mock.addRun({ name: 'nightly 3', planId: 7, pointIds: [1203], state: 'Completed' });
    mock.clearRequests();
    const doneLedger = memoryLedger([{ at: NOW.toISOString(), runName: 'nightly 3', state: 'created', planId: 7, suiteId: 8, runId: done.id }]);
    const recorded = await publishResults(client, options({ runName: 'nightly 3' }), doneLedger);
    expect(recorded).toMatchObject({ runId: done.id, alreadyPublished: true });
    expect(mock.requests.filter((request) => request.method !== 'GET')).toHaveLength(0);
    expect(doneLedger.snapshot().at(-1)!.state).toBe('completed');
  });

  it('dry run: performs only the read-only lookups, lists every request with placeholders, writes no ledger entry', async () => {
    await start();
    const ledger = memoryLedger();
    const planned = await publishResults(
      client,
      options({ dryRun: true, associateAutomation: true, specByCase: { '10001': { specPath: 'tests/policy/10001-verify.spec.ts', testTitle: 'ADO 10001 — Verify policy search' } } }),
      ledger,
    );
    expect(planned).toMatchObject({ runId: 0, url: '', resultIds: [], alreadyPublished: false });
    expect(summary(mock.requests)).toEqual(['GET /_apis/testplan/Plans/7/Suites/8/TestPoint']);
    expect(ledger.snapshot()).toEqual([]);
    expect(mock.runs()).toHaveLength(0);
    const requests = planned.requests ?? [];
    expect(requests.map((request) => `${request.method} ${request.url.replace(`${mock.url}/demo/`, '').replace(/\?.*$/, '')}`)).toEqual([
      'GET _apis/testplan/Plans/7/Suites/8/TestPoint',
      'PATCH _apis/wit/workitems/10001',
      'POST _apis/test/runs',
      'PATCH _apis/test/Runs/{runId}/results',
      'PATCH _apis/test/runs/{runId}',
    ]);
    expect(requests[3]!.body).toEqual([expect.objectContaining({ id: '{resultId of point 1203}', outcome: 'Passed', automatedTestName: 'ADO 10001 — Verify policy search' })]);
    expect(requests.every((request) => request.url.includes('api-version=7.1'))).toBe(true);
  });

  it('publishes data rows as iterations of one point, with parameters and shared-step action paths', async () => {
    await start();
    const { testCases } = await fetchTestCasesBySuite(client, 7, 8);
    const login = testCases.find((testCase) => testCase.id === '9999')!;
    mock.clearRequests();
    const steps = (outcomes: readonly ('Passed' | 'Failed' | 'NotExecuted')[]) =>
      login.steps.map((step, i) => ({ stepIdentifier: step.stepIdentifier, outcome: outcomes[i]!, durationMs: 100 * (i + 1) }));
    const published = await publishResults(
      client,
      options({
        runName: 'rows',
        cases: testCases,
        configurationNames: ['Chrome'],
        results: [
          { testCaseId: '9999', outcome: 'Failed', durationMs: 900, dataRow: 1, errorMessage: 'Signed in banner missing', failureType: 'candidate-bug', steps: steps(['Passed', 'Failed', 'NotExecuted']) },
          { testCaseId: '9999', outcome: 'Passed', durationMs: 600, dataRow: 0, traceRef: 'trace-eu.zip', steps: steps(['Passed', 'Passed', 'Passed']) },
        ],
      }),
      memoryLedger(),
    );
    expect(published.resultIds).toHaveLength(1);
    // Points came from the cached case; the shared-step revision was read once.
    expect(summary(mock.requests)).toEqual([
      'POST /_apis/wit/workitemsbatch',
      'POST /_apis/test/runs',
      'GET /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/runs/4711',
    ]);
    expect(mock.requests[0]!.body).toEqual({ ids: [900], fields: ['System.Id', 'System.Rev'], errorPolicy: 'omit' });
    expect(mock.requests[1]!.body).toMatchObject({ pointIds: [1201] });

    const [result] = mock.requests[3]!.body as Record<string, unknown>[];
    expect(result).toMatchObject({
      outcome: 'Failed',
      durationInMs: 1500,
      testCaseRevision: 2,
      errorMessage: 'row 2: Signed in banner missing',
      comment: '[tesseract-qa] row 1: trace: trace-eu.zip | row 2: failureType: candidate-bug',
    });
    const iterations = result!.iterationDetails as Record<string, unknown>[];
    expect(iterations.map((iteration) => [iteration.id, iteration.outcome, iteration.durationInMs])).toEqual([
      [1, 'Passed', 600],
      [2, 'Failed', 900],
    ]);
    expect(iterations[0]!.parameters).toEqual([
      { parameterName: 'region', value: 'EU', iterationId: 1 },
      { parameterName: 'username', value: 'eu.user', iterationId: 1 },
    ]);
    expect(iterations[1]!.parameters).toEqual([
      { parameterName: 'region', value: 'US', iterationId: 2 },
      { parameterName: 'username', value: 'us.user', iterationId: 2 },
    ]);
    expect(iterations[1]!.actionResults).toEqual([
      { actionPath: '00000002', iterationId: 2, stepIdentifier: '2', outcome: 'Failed', durationInMs: 300, sharedStepModel: { id: 900, revision: 4 } },
      { actionPath: '0000000200000001', iterationId: 2, stepIdentifier: '2;1', outcome: 'Passed', durationInMs: 100 },
      { actionPath: '0000000200000003', iterationId: 2, stepIdentifier: '2;3', outcome: 'Failed', durationInMs: 200 },
      { actionPath: '00000007', iterationId: 2, stepIdentifier: '7', outcome: 'NotExecuted', durationInMs: 300 },
    ]);
  });

  it('publishes to every configuration point of a case by default', async () => {
    await start();
    const published = await publishResults(client, options({ results: [{ testCaseId: '9999', outcome: 'Passed', durationMs: 10 }] }), memoryLedger());
    expect(published.resultIds).toHaveLength(2);
    expect(mock.requests.find((request) => request.method === 'POST')!.body).toMatchObject({ pointIds: [1201, 1202] });
  });

  it('associates automation with json-patch before creating the run', async () => {
    await start();
    const spec = { specPath: 'tests/policy/10001-verify-policy-search.spec.ts', testTitle: 'ADO 10001 — Verify policy search returns matching policy' };
    await publishResults(client, options({ runName: 'assoc', associateAutomation: true, specByCase: { '10001': spec } }), memoryLedger());
    expect(summary(mock.requests).slice(0, 3)).toEqual(['GET /_apis/testplan/Plans/7/Suites/8/TestPoint', 'PATCH /_apis/wit/workitems/10001', 'POST /_apis/test/runs']);
    const patch = mock.requests[1]!;
    expect(patch.contentType).toBe('application/json-patch+json');
    const id = automatedTestId('10001');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(automatedTestId('10001')).toBe(id);
    expect(automatedTestId('10002')).not.toBe(id);
    expect(patch.body).toEqual([
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestName', value: spec.testTitle },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestStorage', value: spec.specPath },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestId', value: id },
      { op: 'add', path: '/fields/Microsoft.VSTS.TCM.AutomatedTestType', value: 'Playwright' },
    ]);
    expect(mock.workItem(10001)).toMatchObject({ rev: 4, fields: { 'Microsoft.VSTS.TCM.AutomationStatus': 'Automated', 'Microsoft.VSTS.TCM.AutomatedTestId': id } });
    const update = mock.requests.find((request) => request.method === 'PATCH' && request.path.endsWith('/results'))!;
    const [result] = update.body as Record<string, unknown>[];
    expect(result).toMatchObject({ automatedTestName: spec.testTitle, automatedTestStorage: spec.specPath });
    expect(result).not.toHaveProperty('testCaseRevision'); // no cached case and none given: left to ADO
  });

  it('refuses association without a spec, and results for cases outside the suite, before writing anything', async () => {
    await start();
    const noSpec = await caught(publishResults(client, options({ associateAutomation: true }), memoryLedger()));
    expect(noSpec.family).toBe('invalid-input');
    expect(noSpec.message).toMatch(/missing for 10001/);
    expect(mock.requests).toHaveLength(0);

    const outside = await caught(publishResults(client, options({ results: [{ testCaseId: '10002', outcome: 'Passed', durationMs: 1 }] }), memoryLedger()));
    expect(outside.family).toBe('not-found');
    expect(outside.message).toMatch(/case 10002/);
    expect(mock.requests.every((request) => request.method === 'GET')).toBe(true);

    const invalid = await caught(publishResults(client, options({ results: [] }), memoryLedger()));
    expect(invalid.message).toMatch(/no results to publish/);
    expect((await caught(publishResults(client, options({ results: [{ ...passedPolicy, testCaseId: 'abc' }] }), memoryLedger()))).family).toBe('invalid-input');
  });

  it('adds results for points ADO did not create one for', async () => {
    await start({ createResultsForPoints: false });
    const published = await publishResults(client, options({ runName: 'b2' }), memoryLedger());
    expect(summary(mock.requests)).toEqual([
      'GET /_apis/testplan/Plans/7/Suites/8/TestPoint',
      'POST /_apis/test/runs',
      'GET /_apis/test/Runs/4711/results',
      'POST /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/Runs/4711/results',
      'PATCH /_apis/test/runs/4711',
    ]);
    expect(mock.requests[3]!.body).toEqual([{ testPoint: { id: '1203' }, testCase: { id: '10001' }, testCaseTitle: 'ADO 10001', state: 'Pending' }]);
    expect(published.resultIds).toEqual([100000]);
    expect(mock.results(4711)[0]).toMatchObject({ outcome: 'Passed', state: 'Completed' });
  });

  it('uses an explicit testPointId without resolving points', async () => {
    await start();
    await publishResults(client, options({ runName: 'explicit', results: [{ ...passedPolicy, testPointId: 1203, testCaseRevision: 3 }] }), memoryLedger());
    expect(summary(mock.requests)[0]).toBe('POST /_apis/test/runs');
    const update = mock.requests.find((request) => request.method === 'PATCH' && request.path.endsWith('/results'))!;
    expect((update.body as Record<string, unknown>[])[0]).toMatchObject({ testCaseRevision: 3 });
  });
});

describe('publishing what fetch returned', () => {
  let mock: MockAdo;
  afterAll(async () => mock?.close());

  it('carries the case revision and parameters through from a fetched case', async () => {
    mock = await startMockAdo(MOCK);
    const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
    const { testCases } = await fetchTestCasesByIds(client, ['10001']);
    const cases: readonly TestCase[] = testCases;
    mock.clearRequests();
    await publishResults(client, { planId: 7, suiteId: 8, runName: 'with cases', results: [passedPolicy], cases, now }, memoryLedger());
    const update = mock.requests.find((request) => request.method === 'PATCH' && request.path.endsWith('/results'))!;
    const [result] = update.body as Record<string, unknown>[];
    expect(result).toMatchObject({ testCaseRevision: 3 });
    expect((result!.iterationDetails as Record<string, unknown>[])[0]!.parameters).toEqual([{ parameterName: 'policyNumber', value: 'POL-001', iterationId: 1 }]);
  });
});

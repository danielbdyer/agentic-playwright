import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readJsonl } from '../../../src/core/fsio.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import { fetchWithCache } from '../../../src/ado/cache.js';
import { ToolError } from '../../../src/core/errors.js';
import type { Handoff, RunReceipt, TestCase } from '../../../src/contract/schemas.js';
import { outcomeOfReceipt, receiptsToPublishResults, specsFromReceipts } from '../../../src/ado/results.js';
import { actionPathSegment, buildActionResults, groupByPoint, resultComment, worstOutcome } from '../../../src/ado/publish-plan.js';
import { publishReceipts, publishResults } from '../../../src/ado/publish.js';
import { memoryLedger } from '../../../src/ado/ledger.js';
import { commentOnWorkItem, formatHandoffComment } from '../../../src/ado/comments.js';
import { createAdoClient, type AdoClient } from '../../../src/ado/client.js';
import { startMockAdo, stepsXml, type MockAdo } from '../../support/mock-ado.js';

const CASE: TestCase = {
  id: '10001',
  title: 'Verify policy search returns matching policy',
  revision: 3,
  contentHash: 'sha256:x',
  tags: [],
  steps: [
    { index: 1, stepIdentifier: '2;1', action: 'Open login', expected: '', sharedStepId: 900 },
    { index: 2, stepIdentifier: '2;3', action: 'Sign in', expected: '', sharedStepId: 900 },
    { index: 3, stepIdentifier: '4', action: 'Search', expected: '' },
    { index: 4, stepIdentifier: '5', action: 'Verify', expected: 'Row shows' },
  ],
  parameters: ['policyNumber'],
  dataRows: [{ policyNumber: 'POL-001' }, { policyNumber: 'POL-002' }],
};

const receipt = (overrides: Partial<RunReceipt> = {}): RunReceipt => ({
  runId: 'r-1',
  at: '2026-10-19T10:00:00.000Z',
  testCase: '10001',
  title: 'ADO 10001 — Verify policy search returns matching policy',
  spec: 'tests/policy/10001-verify-policy-search.spec.ts',
  outcome: 'passed',
  durationMs: 2000,
  retries: 0,
  steps: [
    { index: 1, title: 'Open login', outcome: 'passed', durationMs: 100, facets: [] },
    { index: 2, title: 'Sign in', outcome: 'passed', durationMs: 200, facets: [] },
    { index: 3, title: 'Search', outcome: 'passed', durationMs: 300, facets: [] },
    { index: 4, title: 'Verify', outcome: 'passed', durationMs: 400, facets: [] },
  ],
  ...overrides,
});

describe('receiptsToPublishResults', () => {
  it('maps every test outcome per the reader table', () => {
    const outcomes: readonly [RunReceipt['outcome'], string][] = [
      ['passed', 'Passed'],
      ['failed', 'Failed'],
      ['timedOut', 'Timeout'],
      ['interrupted', 'Aborted'],
      ['skipped', 'NotExecuted'],
      ['flaky', 'Passed'],
    ];
    for (const [outcome, expected] of outcomes) expect(outcomeOfReceipt(receipt({ outcome }))).toBe(expected);
  });

  it('maps a passing receipt with step identifiers, durations, revision, trace and shared-step origin', () => {
    const [result] = receiptsToPublishResults([receipt({ trace: 'test-results/a/trace.zip' })], [CASE]);
    expect(result).toEqual({
      testCaseId: '10001',
      testCaseRevision: 3,
      outcome: 'Passed',
      durationMs: 2000,
      traceRef: 'test-results/a/trace.zip',
      steps: [
        { stepIdentifier: '2;1', outcome: 'Passed', durationMs: 100, sharedStepId: 900 },
        { stepIdentifier: '2;3', outcome: 'Passed', durationMs: 200, sharedStepId: 900 },
        { stepIdentifier: '4', outcome: 'Passed', durationMs: 300 },
        { stepIdentifier: '5', outcome: 'Passed', durationMs: 400 },
      ],
    });
  });

  it('carries the failure message, failure type, data row, and per-step errors', () => {
    const [result] = receiptsToPublishResults(
      [
        receipt({
          outcome: 'failed',
          dataRow: 1,
          error: { message: 'expected row POL-002', family: 'assertion-like', failureType: 'candidate-bug' },
          steps: [
            { index: 3, title: 'Search', outcome: 'passed', durationMs: 300, facets: [] },
            { index: 4, title: 'Verify', outcome: 'failed', durationMs: 5000, facets: ['policy-search:results'], error: 'expected row POL-002' },
          ],
        }),
      ],
      [CASE],
    );
    expect(result).toMatchObject({ outcome: 'Failed', errorMessage: 'expected row POL-002', failureType: 'candidate-bug', dataRow: 1 });
    expect(result!.steps).toEqual([
      { stepIdentifier: '4', outcome: 'Passed', durationMs: 300 },
      { stepIdentifier: '5', outcome: 'Failed', durationMs: 5000, errorMessage: 'expected row POL-002' },
    ]);
  });

  it('marks a test skipped by a handoff Blocked, with the fixme step Blocked', () => {
    const [result] = receiptsToPublishResults(
      [
        receipt({
          outcome: 'skipped',
          steps: [
            { index: 3, title: 'Search', outcome: 'passed', durationMs: 300, facets: [] },
            { index: 4, title: 'Verify', outcome: 'fixme', durationMs: 0, facets: [] },
          ],
        }),
      ],
      [CASE],
    );
    expect(result).toMatchObject({ outcome: 'Blocked', comment: 'blocked: step 4 awaiting a human (handoff)' });
    expect(result!.steps![1]).toEqual({ stepIdentifier: '5', outcome: 'Blocked', durationMs: 0 });
  });

  it('notes flaky passes, skips steps that do not map, and skips receipts with no test case', () => {
    const results = receiptsToPublishResults(
      [
        receipt({ outcome: 'flaky', retries: 1, steps: [{ index: 0, title: 'setup', outcome: 'passed', durationMs: 1, facets: [] }, { index: 9, title: 'extra', outcome: 'passed', durationMs: 1, facets: [] }] }),
        receipt({ testCase: undefined }),
        receipt({ testCase: '555' }),
      ],
      [CASE],
    );
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ outcome: 'Passed', comment: 'flaky: passed after 1 retry' });
    expect(results[0]).not.toHaveProperty('steps');
    expect(results[1]).toEqual({ testCaseId: '555', outcome: 'Passed', durationMs: 2000 });
  });

  it('derives spec refs per case from receipts (first receipt wins for data-driven cases)', () => {
    expect(specsFromReceipts([receipt(), receipt({ title: 'row 2', dataRow: 1 }), receipt({ testCase: undefined })])).toEqual({
      '10001': { specPath: 'tests/policy/10001-verify-policy-search.spec.ts', testTitle: 'ADO 10001 — Verify policy search returns matching policy' },
    });
  });
});

describe('publish plan helpers', () => {
  it('writes action paths as 8 uppercase hex digits per level', () => {
    expect(actionPathSegment('2')).toBe('00000002');
    expect(actionPathSegment('26')).toBe('0000001A');
    expect(actionPathSegment('?3')).toBeNull();
    const results = buildActionResults(
      [
        { stepIdentifier: '12;10', outcome: 'Passed' },
        { stepIdentifier: '12;11', outcome: 'Blocked' },
        { stepIdentifier: 'x', outcome: 'Passed' },
      ],
      1,
      () => 900,
      new Map(),
    );
    expect(results.map((result) => [result.actionPath, result.stepIdentifier, result.outcome, result.sharedStepModel])).toEqual([
      ['0000000C', '12', 'Blocked', undefined],
      ['0000000C0000000A', '12;10', 'Passed', undefined],
      ['0000000C0000000B', '12;11', 'Blocked', undefined],
    ]);
  });

  it('takes the worst outcome and keeps the latest result per data row', () => {
    expect(worstOutcome(['Passed', 'NotExecuted'])).toBe('NotExecuted');
    expect(worstOutcome(['Passed', 'Blocked', 'Failed'])).toBe('Failed');
    expect(worstOutcome([])).toBe('Passed');
    const groups = groupByPoint(
      [
        { testCaseId: '1', outcome: 'Failed', durationMs: 1, dataRow: 0 },
        { testCaseId: '1', outcome: 'Passed', durationMs: 2, dataRow: 0 },
        { testCaseId: '2', testPointId: 50, outcome: 'Passed', durationMs: 3 },
      ],
      new Map([['1', [{ pointId: 10, planId: 1, suiteId: 1 }, { pointId: 11, planId: 1, suiteId: 1 }]]]),
    );
    expect(groups.map((group) => [group.pointId, group.iterations.map((result) => result.outcome)])).toEqual([
      [10, ['Passed']],
      [11, ['Passed']],
      [50, ['Passed']],
    ]);
    expect(resultComment([{ testCaseId: '1', outcome: 'Passed', durationMs: 1 }])).toBeUndefined();
    expect(resultComment([{ testCaseId: '1', outcome: 'Passed', durationMs: 1, comment: 'x'.repeat(2000) }])!.length).toBe(1000);
  });
});

describe('receipts end to end through the mock', () => {
  let mock: MockAdo;
  let client: AdoClient;
  beforeAll(async () => {
    mock = await startMockAdo({
      cases: [{ id: 10001, rev: 3, steps: stepsXml([{ id: 4, action: 'Search' }, { id: 5, action: 'Verify' }]) }],
      points: [{ planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 }],
    });
    client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
  });
  afterAll(async () => mock.close());

  it('publishes a run receipt so the step results carry the ADO step identifiers', async () => {
    const testCase: TestCase = { ...CASE, steps: [CASE.steps[2]!, CASE.steps[3]!].map((step, i) => ({ ...step, index: i + 1 })) };
    const results = receiptsToPublishResults(
      [receipt({ steps: [{ index: 1, title: 'Search', outcome: 'passed', durationMs: 1, facets: [] }, { index: 2, title: 'Verify', outcome: 'passed', durationMs: 2, facets: [] }] })],
      [testCase],
    );
    await publishResults(client, { planId: 7, suiteId: 8, runName: 'from receipts', results, cases: [testCase] }, memoryLedger());
    const patched = mock.requests.filter((request) => request.method === 'PATCH' && /\/results/.test(request.url));
    const body = JSON.stringify(patched[0]!.body);
    expect(body).toMatch(/"outcome":"Passed"/);
    expect(body).toMatch(/"stepIdentifier":"5"/);
  });
});

describe('publishReceipts', () => {
  it('loads the cached cases, maps the receipts, associates automation from the receipt specs, and uses the workspace ledger', async () => {
    const mock = await startMockAdo({
      cases: [{ id: 10001, rev: 3, steps: stepsXml([{ id: 4, action: 'Search' }, { id: 5, action: 'Verify' }]) }],
      points: [{ planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 }],
    });
    const root = await mkdtemp(path.join(os.tmpdir(), 'tqa-ado-receipts-'));
    try {
      const workspace = await loadWorkspace(root, {});
      const client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
      await fetchWithCache(workspace, client, { planId: 7, suiteId: 8 });
      mock.clearRequests();
      const receipts = [
        receipt({ steps: [{ index: 1, title: 'Search', outcome: 'passed', durationMs: 1, facets: [] }, { index: 2, title: 'Verify', outcome: 'failed', durationMs: 2, facets: [], error: 'no row' }], outcome: 'failed' }),
        receipt({ testCase: undefined, title: 'helper test' }),
      ];
      const published = await publishReceipts(client, workspace, { planId: 7, suiteId: 8, runName: 'run r-1', receipts, associateAutomation: true });
      expect(published).toMatchObject({ runId: 4711, resultIds: [100000], alreadyPublished: false });
      // Points came from the cached suite fetch: no TestPoint lookup.
      expect(mock.requests.map((request) => `${request.method} ${request.path}`).slice(0, 2)).toEqual(['PATCH /_apis/wit/workitems/10001', 'POST /_apis/test/runs']);
      expect(mock.workItem(10001)!.fields['Microsoft.VSTS.TCM.AutomatedTestStorage']).toBe('tests/policy/10001-verify-policy-search.spec.ts');
      const update = mock.requests.find((request) => request.method === 'PATCH' && request.path.endsWith('/results'))!;
      expect((update.body as Record<string, unknown>[])[0]).toMatchObject({ outcome: 'Failed', testCaseRevision: 3 });
      expect(JSON.stringify(update.body)).toMatch(/"stepIdentifier":"5","outcome":"Failed"/);
      expect((await readJsonl<{ state: string }>(workspace.paths.publishReceipts)).map((entry) => entry.state)).toEqual(['pending', 'created', 'completed']);

      const again = await publishReceipts(client, workspace, { planId: 7, suiteId: 8, runName: 'run r-1', receipts });
      expect(again.alreadyPublished).toBe(true);
      const none = await publishReceipts(client, workspace, { planId: 7, suiteId: 8, runName: 'run r-2', receipts: [receipt({ testCase: undefined })] }).catch((cause: unknown) => cause);
      expect((none as ToolError).family).toBe('invalid-input');
    } finally {
      await mock.close();
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('work item comments', () => {
  let mock: MockAdo;
  let client: AdoClient;
  beforeAll(async () => {
    mock = await startMockAdo({ cases: [{ id: 10001 }] });
    client = createAdoClient({ orgUrl: mock.url, project: mock.project, pat: 'pat' });
  });
  afterAll(async () => mock.close());

  const handoff: Handoff = {
    handoffId: 'h-10001-4-abc',
    testCaseId: '10001',
    stepIndex: 4,
    stepIdentifier: '5',
    blockage: 'ambiguous-target',
    unresolvedIntent: 'Click Edit',
    attempted: ['memory.query', 'app.observe scope main'],
    evidence: {},
    candidates: [{ name: 'Edit <script>alert(1)</script>', why: 'row POL-001', role: 'button' }],
    nextMoves: ['Name the policy in the step'],
    proposedAssertion: "await expect(page.getByRole('row', { name: /POL-001/ })).toBeVisible()",
    raisedAt: '2026-10-19T10:00:00.000Z',
    status: 'open',
  };

  it('posts a comment with the preview api-version and returns its URL', async () => {
    const html = formatHandoffComment(handoff, { screenshotNote: 'Screenshot: .tesseract/handoffs/h.png' });
    const posted = await commentOnWorkItem(client, '10001', html);
    expect(posted).toEqual({ url: `${mock.url}/demo/_apis/wit/workItems/10001/comments/1`, commentId: 1, workItemUrl: `${mock.url}/demo/_workitems/edit/10001` });
    expect(posted.url).toMatch(/comments/);
    const request = mock.requests.at(-1)!;
    expect(request.method).toBe('POST');
    expect(request.query['api-version']).toBe('7.1-preview.4');
    expect(request.body).toEqual({ text: html });
    expect(mock.comments(10001)[0]!.text).toBe(html);
  });

  it('escapes everything that came from the page or the agent', () => {
    const html = formatHandoffComment(handoff);
    expect(html).not.toContain('<script>');
    expect(html).toContain('Edit &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('ADO step 5');
    expect(html).toContain('several controls could be the target');
    expect(html).toContain('<code>await expect(page.getByRole(&#39;row&#39;');
  });

  it('does not resend a comment after an ambiguous failure', async () => {
    mock.fail({ method: 'POST', path: '/comments', status: 500 });
    const before = mock.requests.length;
    const error = await commentOnWorkItem(client, '10001', '<p>x</p>').catch((cause: unknown) => cause);
    expect(error).toBeInstanceOf(ToolError);
    expect((error as ToolError).family).toBe('unavailable');
    expect(mock.requests.length - before).toBe(1);
  });

  it('reports a missing work item as not-found', async () => {
    const error = await commentOnWorkItem(client, 4242, '<p>x</p>').catch((cause: unknown) => cause);
    expect((error as ToolError).family).toBe('not-found');
  });
});

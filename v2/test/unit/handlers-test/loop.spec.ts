/**
 * The authoring loop's back half against real things: an OutSystems-shaped
 * app, a mock Azure DevOps, real Chromium, and the real Playwright runner.
 *
 *   ado.fetch → test.emit (snapshot candidates minted; facet refs) → test.run
 *   → review.record → ado.publish → handoff.raise → fixme run → drift run →
 *   pause on failure, attach over CDP, release.
 *
 * The tests share one workspace and run in order.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Candidate, TestCase } from '../../../src/contract/schemas.js';
import type { BrowserPool } from '../../../src/browser/types.js';
import { awaitHydration, observePage, resolveCandidateLocator, saveSnapshotRecord, type SnapshotRecord } from '../../../src/observe/index.js';
import { findFacet, mintFacet, setRoute } from '../../../src/memory/index.js';
import { loadProfile } from '../../../src/workspace/profiles.js';
import { pausedRunIds, readEmitRecords, runSpecs } from '../../../src/run/index.js';
import type { ToolContext } from '../../../src/tools/types.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { startMockAdo, stepsXml, type MockAdo } from '../../support/mock-ado.js';
import { invoke, makeContext, makePool, makeWorkspace, readLines, type TestWorkspace } from './helpers.js';

const PAT = 'handlers-test-pat';

describe('test, ado, handoff and review handlers over a real app, a mock ADO and Playwright', () => {
  let app: FixtureApp;
  let ado: MockAdo;
  let ws: TestWorkspace;
  let pool: BrowserPool;
  let ctx: ToolContext;
  const logs: string[] = [];
  const cases = new Map<string, TestCase>();
  let loginSnapshot: SnapshotRecord;
  let searchSnapshot: SnapshotRecord;

  const find = (record: SnapshotRecord, role: string, name: string): Candidate => {
    const found = record.candidates.find((c) => c.role === role && c.name === name);
    if (found === undefined) throw new Error(`no ${role} "${name}" in ${JSON.stringify(record.candidates.map((c) => [c.role, c.name]))}`);
    return found;
  };

  const observe = async (url: string): Promise<{ readonly record: SnapshotRecord; readonly pageId: string }> => {
    const profile = await loadProfile(ws.workspace, 'qa', {});
    const handle = await pool.open({ url, profile, useStorageState: true });
    await awaitHydration(handle.page, { budgetMs: 5000 });
    const observed = await observePage(handle.page, { pageId: handle.pageId, pii: 'standard' });
    const saved = await saveSnapshotRecord(ws.workspace, observed.record);
    return { record: saved.record, pageId: handle.pageId };
  };

  beforeAll(async () => {
    app = await startFixtureApp();
    ado = await startMockAdo({
      pat: PAT,
      cases: [
        {
          id: 20001,
          title: 'Sign in screen shows the form',
          tags: 'smoke',
          steps: stepsXml([
            { id: 2, action: 'Open the Sign in screen', expected: 'The Sign in heading is shown' },
            { id: 3, action: 'Check the Username field', expected: 'The Username field is shown' },
            { id: 4, action: 'Check the Log in button', expected: 'The Log in button is enabled' },
          ]),
        },
        {
          id: 20002,
          title: 'Search for a policy',
          steps: stepsXml([
            { id: 2, action: 'Open Policy Search', expected: 'The Policy Search heading is shown' },
            { id: 3, action: 'Enter POL-001 in the search field', expected: 'The search field holds POL-001' },
            { id: 4, action: 'Click Search', expected: 'The search runs' },
          ]),
        },
        {
          id: 20003,
          title: 'Edit a policy from the results',
          steps: stepsXml([
            { id: 2, action: 'Open Policy Search', expected: 'Policy Search loads' },
            { id: 3, action: 'Click Edit', expected: 'The policy opens' },
          ]),
        },
      ],
      points: [
        { planId: 7, suiteId: 8, testCaseId: 20001, pointId: 1201 },
        { planId: 7, suiteId: 8, testCaseId: 20002, pointId: 1202 },
        { planId: 7, suiteId: 8, testCaseId: 20003, pointId: 1203 },
      ],
    });
    ws = await makeWorkspace({ baseURL: app.baseURL, ado: { orgUrl: ado.url, project: ado.project }, profile: { storageStatePath: '.auth/qa.json' } });

    // The customer's saved login: sign in once with Playwright and keep the storage state in the workspace.
    const browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${app.baseURL}Login`);
    await page.getByLabel('Username').fill('qa.user');
    await page.getByLabel('Password').fill('correct-horse');
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL(/PolicySearch$/);
    await fs.mkdir(path.join(ws.root, '.auth'), { recursive: true });
    await context.storageState({ path: path.join(ws.root, '.auth', 'qa.json') });
    await browser.close();

    pool = makePool(ws.workspace);
    ctx = makeContext(ws.workspace, pool, { ...process.env, AZURE_DEVOPS_PAT: PAT, TESSERACT_PARAM_PASSWORD: 'correct-horse' }, logs);
  }, 60_000);

  afterAll(async () => {
    await pool?.closeAll();
    await ado?.close();
    await app?.close();
    if (process.env.TESSERACT_KEEP_WS !== '1') await ws?.dispose();
  });

  it('ado.fetch reads the suite from Azure DevOps and caches every case', async () => {
    const fetched = await invoke('ado.fetch', { planId: 7, suiteId: 8 }, ctx);
    expect(fetched.source).toBe('ado');
    expect(fetched.testCases.map((c) => c.id)).toEqual(['20001', '20002', '20003']);
    for (const testCase of fetched.testCases) cases.set(testCase.id, testCase);
    expect(cases.get('20001')!.steps.map((s) => s.stepIdentifier)).toEqual(['2', '3', '4']);
    const cached = await fs.readdir(ws.workspace.paths.cases);
    expect(cached.sort()).toEqual(['20001.json', '20002.json', '20003.json']);
  });

  it('ado.fetch serves cached cases when Azure DevOps is not configured, and says not-configured otherwise', async () => {
    const offline = makeContext(ws.workspace, pool, {});
    const fromCache = await invoke('ado.fetch', { ids: ['20002', '20001'] }, offline);
    expect(fromCache.source).toBe('cache');
    expect(fromCache.testCases.map((c) => c.id)).toEqual(['20001', '20002']);
    await expect(invoke('ado.fetch', { ids: ['20001', '29999'] }, offline)).rejects.toMatchObject({ family: 'not-configured' });
    await expect(invoke('ado.fetch', {}, offline)).rejects.toMatchObject({ family: 'invalid-input' });
    const before = ado.requests.length;
    const refreshed = await invoke('ado.fetch', { ids: ['20001'], refresh: true }, ctx);
    expect(refreshed.source).toBe('ado');
    expect(ado.requests.length).toBeGreaterThan(before);
  });

  it('test.emit mints snapshot candidates as facets and writes a spec, page object and emit record', async () => {
    loginSnapshot = (await observe(`${app.baseURL}Login`)).record;
    await setRoute(ws.workspace, 'login', { url: 'Login', landmarks: loginSnapshot.fingerprint.landmarks });
    const heading = find(loginSnapshot, 'heading', 'Sign in');
    const username = find(loginSnapshot, 'textbox', 'Username');
    const login = find(loginSnapshot, 'button', 'Log in');
    const snapshotId = loginSnapshot.snapshotId;

    const steps = [
      { index: 1, stepIdentifier: '2', actionText: 'Open the Sign in screen', expectedText: 'The Sign in heading is shown', verb: 'navigate', screen: 'login', assertions: [{ kind: 'visible', target: { snapshotId, candidateRef: heading.ref } }] },
      { index: 2, stepIdentifier: '3', actionText: 'Check the Username field', expectedText: 'The Username field is shown', verb: 'assert', screen: 'login', target: { snapshotId, candidateRef: username.ref } },
      { index: 3, stepIdentifier: '4', actionText: 'Check the Log in button', expectedText: 'The Log in button is enabled', verb: 'assert', screen: 'login', target: { snapshotId, candidateRef: login.ref }, assertions: [{ kind: 'enabled' }] },
    ];

    const dry = await invoke('test.emit', { testCase: { id: '20001' }, steps, dryRun: true }, ctx);
    expect(dry.written).toBe(false);
    expect(dry.diff).toContain('+++');
    expect(dry.facetsMinted).toHaveLength(3);
    expect(await findFacet(ws.workspace, dry.facetsMinted[0]!)).toBeNull();
    expect(await readEmitRecords(ws.workspace)).toEqual([]);

    const emitted = await invoke('test.emit', { testCase: { id: '20001' }, steps }, ctx);
    expect(emitted.written).toBe(true);
    expect(emitted.specPath).toBe('tests/login/20001-sign-in-screen-shows-the-form.spec.ts');
    expect(emitted.pageObjectPaths).toEqual(['pages/login.page.ts']);
    expect(emitted.facetsMinted).toHaveLength(3);
    expect(emitted.facetsMinted.every((id) => id.startsWith('login:'))).toBe(true);
    expect(emitted.facetsUsed.sort()).toEqual([...emitted.facetsMinted].sort());
    const minted = await findFacet(ws.workspace, emitted.facetsMinted[0]!);
    expect(minted).toMatchObject({ status: 'candidate', provenance: { instrument: 'test.emit', testCase: '20001', snapshotId } });

    const spec = await fs.readFile(path.join(ws.root, emitted.specPath), 'utf8');
    expect(spec).toContain("test.step('Check the Username field'");
    expect(spec).not.toMatch(/getBy|locator\(/);

    const records = await readEmitRecords(ws.workspace);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ testCaseId: '20001', revision: cases.get('20001')!.revision, contentHash: cases.get('20001')!.contentHash, specPath: emitted.specPath, pageObjects: ['pages/login.page.ts'], flows: [] });
    expect(records[0]!.steps.map((s) => [s.index, s.stepIdentifier, s.facets.length])).toEqual([[1, '2', 1], [2, '3', 1], [3, '4', 1]]);

    // Emitting again is idempotent: the same facets fold in, nothing new is minted.
    const again = await invoke('test.emit', { testCase: { id: '20001' }, steps }, ctx);
    expect(again.facetsMinted).toEqual([]);
    expect(again.written).toBe(false);
  }, 60_000);

  it('test.emit refuses a stale case, an unknown case, and an unknown handoff', async () => {
    const base = { index: 1, stepIdentifier: '2', actionText: 'Open Policy Search', expectedText: 'Policy Search loads', verb: 'navigate', screen: 'policy-search' };
    await expect(invoke('test.emit', { testCase: { id: '20003' }, steps: [{ ...base, stepIdentifier: '9' }, { ...base, index: 2, stepIdentifier: '3', actionText: 'Click Edit', handoffId: 'h-20003-2-00000000' }] }, ctx)).rejects.toMatchObject({ family: 'conflict' });
    await expect(invoke('test.emit', { testCase: { id: '20003' }, steps: [base] }, ctx)).rejects.toMatchObject({ family: 'invalid-input' });
    await expect(invoke('test.emit', { testCase: { id: '20003' }, steps: [base, { ...base, index: 2, stepIdentifier: '3', actionText: 'Click Edit', handoffId: 'h-20003-2-00000000' }] }, ctx)).rejects.toMatchObject({ family: 'not-found' });
    await expect(invoke('test.emit', { testCase: { id: '424242' }, steps: [base] }, ctx)).rejects.toMatchObject({ family: 'not-found' });
  });

  it('test.emit emits a case whose steps reference facets minted from verified locators', async () => {
    const observed = await observe(`${app.baseURL}PolicySearch`);
    searchSnapshot = observed.record;
    const { page } = pool.get(observed.pageId);
    await setRoute(ws.workspace, 'policy-search', { url: 'PolicySearch', landmarks: searchSnapshot.fingerprint.landmarks });
    const mint = async (name: string, displayName: string, candidate: Candidate): Promise<string> => {
      const verified = await resolveCandidateLocator(page, searchSnapshot.snapshotId, candidate.ref);
      expect(verified.verified).toBe(true);
      const result = await mintFacet(ws.workspace, {
        screen: 'policy-search',
        draft: { name, displayName, aliases: [displayName.toLowerCase()], locator: verified.locator },
        candidate,
        snapshotId: searchSnapshot.snapshotId,
        verified,
        provenance: { instrument: 'app.act' },
      });
      return result.facet.id;
    };
    const heading = await mint('heading', 'Policy Search heading', find(searchSnapshot, 'heading', 'Policy Search'));
    const input = await mint('search-input', 'Policy search field', find(searchSnapshot, 'textbox', 'Search Policy'));
    const button = await mint('search-button', 'Search button', find(searchSnapshot, 'button', 'Search'));
    expect(input).toBe('policy-search:search-input');

    const emitted = await invoke(
      'test.emit',
      {
        testCase: cases.get('20002'),
        steps: [
          { index: 1, stepIdentifier: '2', actionText: 'Open Policy Search', expectedText: 'The Policy Search heading is shown', verb: 'navigate', screen: 'policy-search', assertions: [{ kind: 'visible', target: { facetId: heading } }] },
          { index: 2, stepIdentifier: '3', actionText: 'Enter POL-001 in the search field', expectedText: 'The search field holds POL-001', verb: 'fill', target: { facetId: input }, value: 'POL-001', assertions: [{ kind: 'value', target: { facetId: input }, expected: 'POL-001' }] },
          { index: 3, stepIdentifier: '4', actionText: 'Click Search', expectedText: 'The search runs', verb: 'click', target: { facetId: button } },
        ],
      },
      ctx,
    );
    expect(emitted.specPath).toBe('tests/policy-search/20002-search-for-a-policy.spec.ts');
    expect(emitted.facetsMinted).toEqual([]);
    expect(emitted.facetsUsed).toEqual([heading, input, button]);
  }, 60_000);

  let firstRunId = '';

  it('test.run runs every spec with Playwright and writes receipts mapped to ADO steps and facets', async () => {
    const before = await findFacet(ws.workspace, 'policy-search:search-input');
    const run = await invoke('test.run', { profile: 'qa' }, ctx);
    firstRunId = run.runId;
    expect(run.summary).toEqual({ passed: 2, failed: 0, skipped: 0, flaky: 0 });
    expect(run.paused).toBeUndefined();
    expect(run.reportPath).toMatch(/^\.tesseract\/tmp\/run-.*\/report\.json$/);
    await expect(fs.stat(path.join(ws.root, run.reportPath!))).resolves.toBeDefined();

    const login = run.receipts.find((r) => r.testCase === '20001')!;
    expect(login).toMatchObject({ spec: 'tests/login/20001-sign-in-screen-shows-the-form.spec.ts', outcome: 'passed', title: 'ADO 20001 — Sign in screen shows the form' });
    expect(login.steps.map((s) => [s.index, s.outcome, s.facets.length])).toEqual([[1, 'passed', 1], [2, 'passed', 1], [3, 'passed', 1]]);
    const search = run.receipts.find((r) => r.testCase === '20002')!;
    expect(search.steps.map((s) => s.title)).toEqual(['Open Policy Search', 'Enter POL-001 in the search field', 'Click Search']);
    expect(search.steps[1]!.facets).toEqual(['policy-search:search-input']);

    const lines = await readLines(ws.workspace.paths.runReceipts);
    expect(lines.filter((l) => l.runId === run.runId)).toHaveLength(2);
    const after = await findFacet(ws.workspace, 'policy-search:search-input');
    const [okBefore, totalBefore] = before!.locators[0]!.health!.split('/').map(Number);
    const [okAfter, totalAfter] = after!.locators[0]!.health!.split('/').map(Number);
    expect([okAfter, totalAfter]).toEqual([okBefore! + 1, totalBefore! + 1]);
  }, 120_000);

  it('review.record promotes on accept and accept-with-edit (not after a locator edit); a large edit does not count as accepted', async () => {
    const records = await readEmitRecords(ws.workspace);
    const loginFacets = records.find((r) => r.testCaseId === '20001')!.facets;
    const fixedLocator = await invoke('review.record', { testCaseId: '20002', decision: 'accept-with-edit', reviewer: 'qa.lead', changedLines: 2, locatorEdited: true }, ctx);
    expect(fixedLocator).toMatchObject({ countsAsAccepted: true, facetsPromoted: [] });
    const largeEdit = await invoke('review.record', { testCaseId: '20002', decision: 'accept-with-edit', reviewer: 'qa.lead', changedLines: 12 }, ctx);
    expect(largeEdit).toMatchObject({ countsAsAccepted: false, spec: 'tests/policy-search/20002-search-for-a-policy.spec.ts' });
    expect(largeEdit.facetsPromoted.length).toBeGreaterThan(0);

    const accepted = await invoke('review.record', { testCaseId: '20001', decision: 'accept', reviewer: 'qa.lead', note: 'reads like the case' }, ctx);
    expect(accepted.countsAsAccepted).toBe(true);
    expect([...accepted.facetsPromoted].sort()).toEqual([...loginFacets].sort());
    for (const id of loginFacets) expect((await findFacet(ws.workspace, id))!.status).toBe('trusted');

    const small = await invoke('review.record', { testCaseId: '20002', decision: 'accept-with-edit', reviewer: 'qa.lead', changedLines: 3 }, ctx);
    expect(small.countsAsAccepted).toBe(true);
    const locatorOnly = await invoke('review.record', { testCaseId: '20002', decision: 'accept-with-edit', reviewer: 'qa.lead', changedLines: 40, locatorEdited: true }, ctx);
    expect(locatorOnly.countsAsAccepted).toBe(true);

    await expect(invoke('review.record', { testCaseId: '20003', decision: 'accept', reviewer: 'qa.lead' }, ctx)).rejects.toMatchObject({ family: 'not-found' });
    const lines = await readLines(ws.workspace.paths.reviewReceipts);
    expect(lines.map((l) => [l.testCaseId, l.decision, l.countsAsAccepted])).toEqual([
      ['20002', 'accept-with-edit', true],
      ['20002', 'accept-with-edit', false],
      ['20001', 'accept', true],
      ['20002', 'accept-with-edit', true],
      ['20002', 'accept-with-edit', true],
    ]);
  });

  it('ado.publish publishes a run to the test points, per step, and is idempotent per run name', async () => {
    ado.clearRequests();
    const published = await invoke('ado.publish', { planId: 7, suiteId: 8, runName: 'handlers nightly', fromRunId: firstRunId, associateAutomation: true }, ctx);
    expect(published.alreadyPublished).toBe(false);
    expect(published.resultIds).toHaveLength(2);
    const sequence = ado.requests.map((r) => `${r.method} ${r.path.replace(/\/\d+(?=\/|$)/g, '/{id}')}`);
    // 20001 was re-fetched by id (no points with it), so its point is looked up; 20002's came with the suite fetch.
    expect(sequence).toEqual([
      'GET /_apis/testplan/Plans/{id}/Suites/{id}/TestPoint',
      'PATCH /_apis/wit/workitems/{id}',
      'PATCH /_apis/wit/workitems/{id}',
      'POST /_apis/test/runs',
      'GET /_apis/test/Runs/{id}/results',
      'PATCH /_apis/test/Runs/{id}/results',
      'PATCH /_apis/test/runs/{id}',
    ]);
    const association = ado.requests.find((r) => r.method === 'PATCH' && /workitems\/20001$/i.test(r.path))!;
    expect(JSON.stringify(association.body)).toContain('tests/login/20001-sign-in-screen-shows-the-form.spec.ts');
    const results = ado.requests.find((r) => r.method === 'PATCH' && /\/results$/.test(r.path))!;
    const body = JSON.stringify(results.body);
    expect(body).toMatch(/"outcome":"Passed"/);
    expect(body).toMatch(/"stepIdentifier":"4"/);
    const run = ado.runs().find((r) => r.name === 'handlers nightly')!;
    expect([...run.pointIds].sort()).toEqual([1201, 1202]);

    ado.clearRequests();
    const again = await invoke('ado.publish', { planId: 7, suiteId: 8, runName: 'handlers nightly', fromRunId: firstRunId }, ctx);
    expect(again).toMatchObject({ alreadyPublished: true, runId: published.runId });
    expect(ado.requests).toHaveLength(0);

    const dry = await invoke('ado.publish', { planId: 7, suiteId: 8, runName: 'handlers explicit', results: [{ testCaseId: '20003', outcome: 'Blocked', durationMs: 5 }], dryRun: true }, ctx);
    expect(dry.runId).toBe(0);
    expect(dry.requests?.some((r) => r.method === 'POST' && /\/test\/runs/.test(r.url))).toBe(true);
    expect(ado.runs().some((r) => r.name === 'handlers explicit')).toBe(false);

    await expect(invoke('ado.publish', { planId: 7, suiteId: 8, runName: 'x', fromRunId: 'run-missing' }, ctx)).rejects.toMatchObject({ family: 'not-found' });
    await expect(invoke('ado.publish', { planId: 7, suiteId: 8, runName: 'x', fromRunId: firstRunId }, makeContext(ws.workspace, pool, {}))).rejects.toMatchObject({ family: 'not-configured' });
  });

  let handoffId = '';

  it('handoff.raise writes the handoff with a screenshot and comments on the ADO test case', async () => {
    const observed = await observe(`${app.baseURL}PolicySearch`);
    const raised = await invoke(
      'handoff.raise',
      {
        testCaseId: '20003',
        stepIndex: 2,
        blockage: 'ambiguous-target',
        unresolvedIntent: 'Click Edit',
        attempted: ['memory.query policy-search "Click Edit"', 'app.observe scope main'],
        evidence: { snapshotId: observed.record.snapshotId, pageId: observed.pageId },
        candidates: [{ role: 'link', name: 'Edit', why: 'row POL-001' }, { role: 'link', name: 'Edit', why: 'row POL-002' }],
        nextMoves: ['Name the policy to edit in the step'],
        proposedAssertion: "expect(page).toHaveURL(/PolicyDetail/)",
      },
      ctx,
    );
    handoffId = raised.handoffId;
    expect(raised.handoffId).toMatch(/^h-20003-2-[0-9a-f]{8}$/);
    expect(raised.path).toBe('.tesseract/handoffs/20003-2.json');
    expect(raised.screenshotPath).toBe('.tesseract/handoffs/20003-2.png');
    expect((await fs.stat(path.join(ws.root, raised.screenshotPath!))).size).toBeGreaterThan(1000);
    expect(raised.adoCommentUrl).toMatch(/comments/);
    const comments = ado.comments(20003);
    expect(comments).toHaveLength(1);
    expect(comments[0]!.text).toContain('Click Edit');
    expect(comments[0]!.text).toContain('row POL-002');
    const file = JSON.parse(await fs.readFile(path.join(ws.root, raised.path), 'utf8')) as Record<string, unknown>;
    expect(file).toMatchObject({ handoffId, testCaseId: '20003', stepIndex: 2, stepIdentifier: '3', status: 'open', adoCommentUrl: raised.adoCommentUrl });
  }, 60_000);

  it('handoff.raise keeps the local handoff when the ADO comment fails, and a re-raise keeps the history', async () => {
    ado.fail({ method: 'POST', path: '/comments', status: 500 });
    const again = await invoke(
      'handoff.raise',
      { testCaseId: '20003', stepIndex: 2, blockage: 'ambiguous-target', unresolvedIntent: 'Click Edit', attempted: ['app.observe scope main', 'app.act click Edit (ambiguous)'], evidence: {}, nextMoves: ['Name the policy'] },
      ctx,
    );
    expect(again.adoCommentUrl).toBeUndefined();
    expect(logs.some((line) => line.includes('comment failed'))).toBe(true);
    const file = JSON.parse(await fs.readFile(path.join(ws.root, again.path), 'utf8')) as { handoffId: string; history: { handoffId: string; attempted: string[] }[] };
    expect(file.handoffId).toBe(again.handoffId);
    expect(file.history.map((h) => h.handoffId)).toEqual([handoffId]);
    expect(file.history[0]!.attempted).toContain('memory.query policy-search "Click Edit"');
    // The superseded id is not the open handoff any more.
    await expect(
      invoke('test.emit', { testCase: { id: '20003' }, steps: [
        { index: 1, stepIdentifier: '2', actionText: 'Open Policy Search', expectedText: 'Policy Search loads', verb: 'navigate', screen: 'policy-search' },
        { index: 2, stepIdentifier: '3', actionText: 'Click Edit', expectedText: 'The policy opens', verb: 'click', handoffId },
      ] }, ctx),
    ).rejects.toThrow(/superseded/);
    handoffId = again.handoffId;
  }, 60_000);

  it('a step with a handoff is emitted as test.fixme and runs as skipped, not failed', async () => {
    const emitted = await invoke(
      'test.emit',
      {
        testCase: { id: '20003' },
        steps: [
          {
            index: 1,
            stepIdentifier: '2',
            actionText: 'Open Policy Search',
            expectedText: 'Policy Search loads',
            verb: 'navigate',
            screen: 'policy-search',
            assertions: [
              // A raw locator another facet already owns is that facet; a new one is minted on the step's screen.
              { kind: 'visible', target: { locator: { strategy: 'role-name', role: 'heading', name: 'Policy Search' } } },
              { kind: 'visible', target: { locator: { strategy: 'role-name', role: 'link', name: 'Claims', scope: { landmark: 'navigation' } } } },
            ],
          },
          { index: 2, stepIdentifier: '3', actionText: 'Click Edit', expectedText: 'The policy opens', verb: 'click', handoffId },
        ],
      },
      ctx,
    );
    expect(emitted.facetsMinted).toHaveLength(1);
    expect(emitted.facetsMinted[0]).toMatch(/^policy-search:.*claims/);
    expect(emitted.facetsUsed).toEqual(['policy-search:heading', emitted.facetsMinted[0]]);
    expect(await findFacet(ws.workspace, emitted.facetsMinted[0]!)).toMatchObject({ status: 'candidate', provenance: { instrument: 'test.emit' }, locators: [{ strategy: 'role-name', role: 'link', name: 'Claims' }] });
    const spec = await fs.readFile(path.join(ws.root, emitted.specPath), 'utf8');
    expect(spec).toContain(`test.fixme(true, 'Needs a human (handoff ${handoffId})`);
    const run = await invoke('test.run', { specPaths: [emitted.specPath], profile: 'qa' }, ctx);
    expect(run.summary).toEqual({ passed: 0, failed: 0, skipped: 1, flaky: 0 });
    const receipt = run.receipts[0]!;
    expect(receipt).toMatchObject({ testCase: '20003', outcome: 'skipped' });
    expect(receipt.error).toBeUndefined();
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'fixme']]);
  }, 120_000);

  it('test.run validates its spec paths', async () => {
    await expect(invoke('test.run', { specPaths: ['../outside.spec.ts'] }, ctx)).rejects.toMatchObject({ family: 'invalid-input' });
    await expect(invoke('test.run', { specPaths: ['tests/nope/1-missing.spec.ts'] }, ctx)).rejects.toMatchObject({ family: 'not-found' });
    await expect(invoke('test.run', { specPaths: ['pages/login.page.ts'] }, ctx)).rejects.toMatchObject({ family: 'invalid-input' });
  });

  const SEARCH_SPEC = 'tests/policy-search/20002-search-for-a-policy.spec.ts';
  const LOGIN_SPEC = 'tests/login/20001-sign-in-screen-shows-the-form.spec.ts';

  it('test.emit renders a recorded login flow in beforeEach; the run reads its secret from the environment', async () => {
    const records = await readEmitRecords(ws.workspace);
    const loginSteps = records.find((r) => r.testCaseId === '20001')!.steps;
    const username = loginSteps[1]!.facets[0]!;
    const logIn = loginSteps[2]!.facets[0]!;
    const password = await mintFacet(ws.workspace, {
      screen: 'login',
      draft: { name: 'password-input', displayName: 'Password field' },
      candidate: find(loginSnapshot, 'textbox', 'Password'),
      snapshotId: loginSnapshot.snapshotId,
      provenance: { instrument: 'flow.record', flow: 'login' },
    });
    await fs.mkdir(ws.workspace.paths.recordings, { recursive: true });
    await fs.writeFile(
      path.join(ws.workspace.paths.recordings, 'login.json'),
      JSON.stringify({
        name: 'login',
        startUrl: 'Login',
        steps: [
          { index: 1, action: 'navigate', screen: 'login', url: 'Login' },
          { index: 2, action: 'fill', facetId: username, screen: 'login', value: { param: 'username' }, url: 'Login' },
          { index: 3, action: 'fill', facetId: password.facet.id, screen: 'login', value: { param: 'password', secret: true }, url: 'Login' },
          { index: 4, action: 'click', facetId: logIn, screen: 'login', url: 'Login' },
        ],
        params: [{ name: 'username', secret: false, default: 'qa.user' }, { name: 'password', secret: true }],
      }),
    );
    const steps = records.find((r) => r.testCaseId === '20002')!.steps;
    const emitted = await invoke(
      'test.emit',
      {
        testCase: { id: '20002' },
        flows: [{ name: 'login' }],
        steps: [
          { index: 1, stepIdentifier: '2', actionText: 'Open Policy Search', expectedText: 'The Policy Search heading is shown', verb: 'navigate', screen: 'policy-search', assertions: [{ kind: 'visible', target: { facetId: steps[0]!.facets[0]! } }] },
          { index: 2, stepIdentifier: '3', actionText: 'Enter POL-001 in the search field', expectedText: 'The search field holds POL-001', verb: 'fill', target: { facetId: 'policy-search:search-input' }, value: 'POL-001', assertions: [{ kind: 'value', target: { facetId: 'policy-search:search-input' }, expected: 'POL-001' }] },
          { index: 3, stepIdentifier: '4', actionText: 'Click Search', expectedText: 'The search runs', verb: 'click', target: { facetId: 'policy-search:search-button' } },
        ],
      },
      ctx,
    );
    expect(emitted.specPath).toBe(SEARCH_SPEC);
    expect(emitted.flowPaths).toEqual(['flows/login.ts']);
    expect(emitted.pageObjectPaths).toEqual(expect.arrayContaining(['pages/policy-search.page.ts', 'pages/login.page.ts']));
    const spec = await fs.readFile(path.join(ws.root, SEARCH_SPEC), 'utf8');
    expect(spec).toMatch(/test\.beforeEach\(async \(\{ page \}\) => \{\n\s+await login\(page, \{ username: 'qa\.user', password: requireEnv\('TESSERACT_PARAM_PASSWORD'\) \}\);/);
    const record = (await readEmitRecords(ws.workspace)).filter((r) => r.testCaseId === '20002').pop()!;
    expect(record.flows).toEqual(['login']);
    expect(record.facets).toEqual(expect.arrayContaining([username, password.facet.id, logIn, 'policy-search:search-input']));

    const green = await invoke('test.run', { specPaths: [SEARCH_SPEC], profile: 'qa' }, ctx);
    expect(green.summary.passed).toBe(1);

    const { TESSERACT_PARAM_PASSWORD: _secret, ...withoutSecret } = ctx.env;
    const red = await invoke('test.run', { specPaths: [SEARCH_SPEC], profile: 'qa' }, makeContext(ws.workspace, pool, withoutSecret));
    expect(red.summary.failed).toBe(1);
    expect(red.receipts[0]!.error).toMatchObject({ family: 'not-configured', failureType: 'environment' });
    expect(red.receipts[0]!.error!.message).toContain('TESSERACT_PARAM_PASSWORD');
    expect(red.receipts[0]!.steps.every((s) => s.outcome === 'skipped')).toBe(true);
  }, 120_000);

  it('a release that renames the search field fails as drift on its facet, with the customer config, and lowers its health', async () => {
    // From here on the workspace has its own Playwright config (short timeouts), as a customer's would.
    await fs.writeFile(
      path.join(ws.root, 'playwright.config.ts'),
      [
        "import { defineConfig } from '@playwright/test';",
        "import { readFileSync } from 'node:fs';",
        "const profile = JSON.parse(readFileSync(`.tesseract/profiles/${process.env.TESSERACT_PROFILE ?? 'qa'}.json`, 'utf8'));",
        "export default defineConfig({ testDir: 'tests', timeout: 15_000, expect: { timeout: 2_000 }, use: { baseURL: process.env.TESSERACT_BASE_URL ?? profile.baseURL, storageState: profile.storageStatePath, actionTimeout: 2_000, trace: 'retain-on-failure' } });",
        '',
      ].join('\n'),
    );
    const before = await findFacet(ws.workspace, 'policy-search:search-input');
    app.setVariant('v2-renamed-search');
    const run = await invoke('test.run', { specPaths: [SEARCH_SPEC], profile: 'qa' }, ctx);
    expect(run.summary.failed).toBe(1);
    const receipt = run.receipts[0]!;
    expect(receipt.error).toMatchObject({ family: 'not-found', failureType: 'drift', facet: 'policy-search:search-input' });
    expect(receipt.error!.message).toContain("getByRole('textbox', { name: 'Search Policy', exact: true })");
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'failed'], [3, 'skipped']]);
    expect(receipt.trace).toMatch(/^\.tesseract\/tmp\/run-.*trace\.zip$/);
    await expect(fs.stat(path.join(ws.root, receipt.trace!))).resolves.toBeDefined();

    const after = await findFacet(ws.workspace, 'policy-search:search-input');
    const [okBefore, totalBefore] = before!.locators[0]!.health!.split('/').map(Number);
    const [okAfter, totalAfter] = after!.locators[0]!.health!.split('/').map(Number);
    expect(okAfter).toBe(okBefore);
    expect(totalAfter).toBe(totalBefore! + 1);
    expect(okAfter! / totalAfter!).toBeLessThan(okBefore! / totalBefore!);
  }, 120_000);

  it('pauseOnFailure holds the failing browser open over CDP until the next run releases it', async () => {
    const profile = await loadProfile(ws.workspace, 'qa', {});
    // A customer config without actionTimeout: the repair run turns the test timeout off, so actions must keep it.
    await fs.writeFile(
      path.join(ws.root, 'playwright.config.ts'),
      [
        "import { defineConfig } from '@playwright/test';",
        "export default defineConfig({ testDir: 'tests', timeout: 4_000, use: { baseURL: process.env.TESSERACT_BASE_URL, storageState: '.auth/qa.json' } });",
        '',
      ].join('\n'),
    );
    const env = { ...process.env, TESSERACT_PARAM_PASSWORD: 'correct-horse' };
    // Two specs: the login spec runs (and passes) first, then the search spec fails and holds its browser.
    const paused = await runSpecs(ws.workspace, { specPaths: [SEARCH_SPEC, LOGIN_SPEC], profile, profileName: 'qa', pauseOnFailure: true, env, timeoutMs: 90_000 });
    expect(paused.paused).toBeDefined();
    expect(paused.paused!.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(paused.paused!.failingStep).toBe('Enter POL-001 in the search field');
    expect(paused.paused!.url).toMatch(/PolicySearch$/);
    expect(pausedRunIds()).toEqual([paused.paused!.repairId]);
    expect(paused.receipts.map((r) => [r.testCase, r.outcome, r.paused !== undefined])).toEqual([['20001', 'passed', false], ['20002', 'failed', true]]);
    expect(paused.summary).toEqual({ passed: 1, failed: 1, skipped: 0, flaky: 0 });
    expect(paused.receipts[0]!.steps.map((s) => s.facets.length)).toEqual([1, 1, 1]);
    const receipt = paused.receipts.find((r) => r.paused !== undefined)!;
    expect(receipt).toMatchObject({ testCase: '20002', spec: SEARCH_SPEC, outcome: 'failed', error: { failureType: 'drift', facet: 'policy-search:search-input' } });
    expect(receipt.steps.map((s) => [s.index, s.outcome])).toEqual([[1, 'passed'], [2, 'failed'], [3, 'skipped']]);
    const repairFile = JSON.parse(await fs.readFile(path.join(ws.workspace.paths.repair, `${paused.paused!.repairId}.json`), 'utf8')) as { cdpEndpoint: string };
    expect(repairFile.cdpEndpoint).toBe(paused.paused!.cdpEndpoint);

    const attached = await chromium.connectOverCDP(paused.paused!.cdpEndpoint);
    const urls = attached.contexts().flatMap((context) => context.pages().map((page) => page.url()));
    expect(urls.some((url) => /PolicySearch$/.test(url))).toBe(true);
    const page = attached.contexts().flatMap((context) => context.pages()).find((p) => /PolicySearch$/.test(p.url()))!;
    expect(await page.getByPlaceholder('Find a policy').isVisible()).toBe(true);

    // The next run releases the paused one first; the repair files go with it.
    const next = await runSpecs(ws.workspace, { specPaths: [LOGIN_SPEC], profile, profileName: 'qa', env });
    expect(pausedRunIds()).toEqual([]);
    expect(next.summary.passed).toBe(1);
    await expect(fs.stat(path.join(ws.workspace.paths.repair, `${paused.paused!.repairId}.json`))).rejects.toThrow();
    const tmp = await fs.readdir(ws.workspace.paths.tmp);
    expect(tmp.some((name) => name.startsWith('repair-'))).toBe(false);
  }, 180_000);
});

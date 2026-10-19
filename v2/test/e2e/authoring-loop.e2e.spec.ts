/**
 * The whole loop, the way an agent host drives it: the BUILT server over
 * stdio, a real browser, an OutSystems-shaped app, and a mock Azure DevOps.
 *
 *  1. Record the login once (flow.record while the "QA" drives with app.act).
 *  2. Fetch ADO 10001, author its four steps (memory miss → observe → act →
 *     assert → mint), emit a plain spec + page objects, run it with
 *     Playwright (engine absent), review it, publish it to the test plan.
 *  3. Raise a handoff for an ambiguous step.
 *  4. Release a drifting app: preflight sees it, the run classifies it as
 *     drift, the paused browser is repaired in place, the run goes green.
 */
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startFixtureApp, type FixtureApp } from '../support/fixture-app.js';
import { startMockAdo, type MockAdo } from '../support/mock-ado.js';
import { BIN, connect, createWorkspace, V2_ROOT, type E2eWorkspace, type McpSession } from './support.js';

type Json = Record<string, unknown>;

const STEPS_XML = `<steps id="0" last="5">
  <step id="2" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Navigate to Policy Search screen&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Policy Search screen loads&lt;/P&gt;</parameterizedString><description/></step>
  <step id="3" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Enter @policyNumber in search field&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Policy Number accepts a valid policy&lt;/P&gt;</parameterizedString><description/></step>
  <step id="4" type="ActionStep"><parameterizedString isformatted="true">&lt;P&gt;Click Search button&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Search runs&lt;/P&gt;</parameterizedString><description/></step>
  <step id="5" type="ValidateStep"><parameterizedString isformatted="true">&lt;P&gt;Verify search results show policy&lt;/P&gt;</parameterizedString><parameterizedString isformatted="true">&lt;P&gt;Matching policy appears in Search Results&lt;/P&gt;</parameterizedString><description/></step>
</steps>`;

const PARAMS_XML = '<parameters><param name="policyNumber" bind="default"/></parameters>';
const DATA_XML = '<NewDataSet><Table1><policyNumber>POL-001</policyNumber></Table1></NewDataSet>';

describe('tesseract-qa end to end over MCP stdio', () => {
  let app: FixtureApp;
  let ado: MockAdo;
  let ws: E2eWorkspace;
  let mcp: McpSession;
  const env = { AZURE_DEVOPS_PAT: 'e2e-pat-token', TESSERACT_PARAM_PASSWORD: 'correct-horse', TESSERACT_PARAM_USERNAME: 'qa.user' };

  beforeAll(async () => {
    const built = spawnSync('npm', ['run', 'build'], { cwd: V2_ROOT, encoding: 'utf8' });
    if (built.status !== 0) throw new Error(`build failed:\n${built.stdout}\n${built.stderr}`);
    app = await startFixtureApp();
    ado = await startMockAdo({
      cases: [{ id: 10001, rev: 3, title: 'Verify policy search returns matching policy', tags: 'smoke; billing', priority: 1, steps: STEPS_XML, parameters: PARAMS_XML, dataSource: DATA_XML }],
      points: [{ planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 }],
    });
    ws = await createWorkspace({ baseURL: app.baseURL, ado: { orgUrl: ado.url, project: ado.project }, profile: { loginFlow: 'login' } });
    mcp = await connect(ws.root, env);
  }, 240_000);

  afterAll(async () => {
    await mcp?.close();
    await ado?.close();
    await app?.close();
    if (process.env.TESSERACT_E2E_KEEP !== '1') await ws?.dispose();
  });

  it('lists the sixteen tools over stdio', async () => {
    const { tools } = await mcp.client.listTools();
    expect(tools).toHaveLength(16);
  });

  it('records the login flow while the QA walks it once', async () => {
    const opened = await mcp.call<Json>('app_open', { url: 'Login', profile: 'qa', auth: 'none' });
    const pageId = opened.pageId as string;
    expect(opened.variant).toBe('reactive');

    const recording = mcp.call<Json>('flow_record', { name: 'login', pageId, profile: 'qa', stopOn: 'urlChange', timeoutMs: 60_000 });
    await new Promise((r) => setTimeout(r, 1500));
    const snap = await mcp.call<Json>('app_observe', { pageId });
    const candidates = snap.candidates as Json[];
    const ref = (role: string, name: string): string => {
      const found = candidates.find((c) => c.role === role && c.name === name);
      if (found === undefined) throw new Error(`no ${role} "${name}" in ${JSON.stringify(candidates.map((c) => [c.role, c.name]))}`);
      return found.ref as string;
    };
    await mcp.call('app_act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: ref('textbox', 'Username') }, value: '@username', params: { username: 'qa.user' } });
    await mcp.call('app_act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: ref('textbox', 'Password') }, value: '@password', params: { password: 'correct-horse' } });
    await mcp.call('app_act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: ref('button', 'Log in') } });
    const recorded = await recording;
    expect(recorded.stoppedBy).toBe('urlChange');
    expect((recorded.facetsMinted as string[]).length).toBeGreaterThanOrEqual(3);
    expect(recorded.params).toEqual(expect.arrayContaining(['password']));
    const flowText = await readFile(path.join(ws.root, 'flows', 'login.ts'), 'utf8');
    expect(flowText).toMatch(/export async function login\(page: Page/);

    // The secret never reaches disk.
    const leaked = spawnSync('grep', ['-rl', 'correct-horse', ws.root], { encoding: 'utf8' });
    expect(leaked.stdout.trim()).toBe('');
  });

  let authoredFacets: string[] = [];

  it('authors ADO 10001 step by step and emits a plain Playwright spec', async () => {
    const fetched = await mcp.call<Json>('ado_fetch', { planId: 7, suiteId: 8 });
    const testCase = (fetched.testCases as Json[])[0]!;
    expect(testCase.id).toBe('10001');
    expect((testCase.steps as Json[]).map((s) => s.stepIdentifier)).toEqual(['2', '3', '4', '5']);

    const opened = await mcp.call<Json>('app_open', { profile: 'qa', auth: 'flow', url: 'PolicySearch' });
    const pageId = opened.pageId as string;
    expect(String(opened.finalUrl)).toMatch(/PolicySearch$/);

    const miss = await mcp.call<Json>('memory_query', { screen: 'policy-search', phrase: 'Enter policy number in search field' });
    expect(miss.facets).toEqual([]);

    const snap = await mcp.call<Json>('app_observe', { pageId, scope: 'search', intent: 'Enter @policyNumber in search field' });
    const hints = snap.hints as Json[];
    const input = (snap.candidates as Json[]).find((c) => c.role === 'textbox')!;
    expect(input.namingSource).toBe('placeholder');
    expect(hints[0]!.ref).toBe(input.ref);

    const filled = await mcp.call<Json>('app_act', {
      pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: input.ref }, value: '@policyNumber', params: { policyNumber: 'POL-001' },
      decision: { testCase: '10001', step: 2, chose: input.ref, reason: 'only textbox in the search landmark', host: { model: 'e2e-host-model', tokens: { prompt: 100, completion: 10 } } },
    });
    expect(filled.outcome).toBe('succeeded');
    const inputLocator = (filled.resolved as Json).locator;

    const button = (snap.candidates as Json[]).find((c) => c.role === 'button' && c.name === 'Search')!;
    const clicked = await mcp.call<Json>('app_act', { pageId, action: 'click', target: { snapshotId: snap.snapshotId, ref: button.ref } });
    expect(clicked.outcome).toBe('succeeded');

    const rowCheck = await mcp.call<Json>('app_assert', {
      pageId, assertion: 'contains-text', target: { locator: { strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } } }, expected: 'POL-001', params: { policyNumber: 'POL-001' },
    });
    expect(rowCheck.passed).toBe(true);

    const main = await mcp.call<Json>('app_observe', { pageId, scope: 'main' });
    const heading = (main.candidates as Json[]).find((c) => c.role === 'heading' && c.name === 'Policy Search')!;
    const row = (main.candidates as Json[]).find((c) => c.role === 'row' && String(c.name).includes('POL-001'))!;

    const minted = await Promise.all([
      mcp.call<Json>('memory_mint', { screen: 'policy-search', facet: { name: 'heading', kind: 'element', displayName: 'Policy Search heading', aliases: ['Policy Search screen'] }, evidence: { snapshotId: main.snapshotId, ref: heading.ref }, route: { url: 'PolicySearch' } }),
      mcp.call<Json>('memory_mint', { screen: 'policy-search', facet: { name: 'policy-number-input', kind: 'element', displayName: 'Policy number search field', aliases: ['search field', 'policy number'], locator: inputLocator }, evidence: { snapshotId: snap.snapshotId, ref: input.ref } }),
      mcp.call<Json>('memory_mint', { screen: 'policy-search', facet: { name: 'search-button', kind: 'element', displayName: 'Search button', aliases: ['Search'] }, evidence: { snapshotId: snap.snapshotId, ref: button.ref } }),
      mcp.call<Json>('memory_mint', { screen: 'policy-search', facet: { name: 'results-table', kind: 'row', displayName: 'Search results row', aliases: ['search results', 'matching policy'], parameter: 'policyNumber', locator: { strategy: 'row-text', value: '{policyNumber}', scope: { landmark: 'main' } } }, evidence: { snapshotId: main.snapshotId, ref: row.ref } }),
    ]);
    authoredFacets = minted.map((m) => (m.facet as Json).id as string);
    expect(authoredFacets).toEqual(['policy-search:heading', 'policy-search:policy-number-input', 'policy-search:search-button', 'policy-search:results-table']);

    const hit = await mcp.call<Json>('memory_query', { screen: 'policy-search', phrase: 'Enter policy number in search field' });
    expect(((hit.facets as Json[])[0] as Json).id).toBe('policy-search:policy-number-input');

    const emitted = await mcp.call<Json>('test_emit', {
      testCase: { id: '10001' },
      flows: [{ name: 'login' }],
      steps: [
        { index: 1, stepIdentifier: '2', actionText: 'Navigate to Policy Search screen', expectedText: 'Policy Search screen loads', verb: 'navigate', screen: 'policy-search', assertions: [{ kind: 'visible', target: { facetId: 'policy-search:heading' } }] },
        { index: 2, stepIdentifier: '3', actionText: 'Enter @policyNumber in search field', expectedText: 'Policy Number accepts a valid policy', verb: 'fill', target: { facetId: 'policy-search:policy-number-input' }, value: '@policyNumber', assertions: [{ kind: 'value', target: { facetId: 'policy-search:policy-number-input' }, expected: '@policyNumber' }] },
        { index: 3, stepIdentifier: '4', actionText: 'Click Search button', expectedText: 'Search runs', verb: 'click', target: { facetId: 'policy-search:search-button' } },
        { index: 4, stepIdentifier: '5', actionText: 'Verify search results show policy', expectedText: 'Matching policy appears in Search Results', verb: 'assert', assertions: [{ kind: 'contains-text', target: { facetId: 'policy-search:results-table' }, expected: '@policyNumber' }] },
      ],
    });
    const specPath = emitted.specPath as string;
    expect(specPath).toMatch(/^tests\/policy-search\/10001-verify-policy-search-returns-matching-policy\.spec\.ts$/);
    const spec = await readFile(path.join(ws.root, specPath), 'utf8');
    expect(spec).not.toMatch(/tesseract-qa|getBy|locator\(/);
    expect(spec).toMatch(/test\.step\('Enter @policyNumber in search field'/);
    const pageObject = await readFile(path.join(ws.root, 'pages', 'policy-search.page.ts'), 'utf8');
    expect(pageObject).toMatch(/getByRole\('search'\)\.getByRole\('textbox', \{ name: 'Search Policy', exact: true \}\)/);
  });

  let runId = '';

  it('runs the spec with Playwright alone, and the engine is not in the runtime path', async () => {
    const run = await mcp.call<Json>('test_run', { profile: 'qa' });
    expect(run.summary).toMatchObject({ passed: 1, failed: 0 });
    runId = run.runId as string;
    // The same spec passes with nothing but npx playwright test.
    const direct = spawnSync(process.execPath, [require_resolve_playwright_cli(), 'test', '--reporter=line'], {
      cwd: ws.root, encoding: 'utf8', env: { ...process.env, ...env, TESSERACT_PROFILE: 'qa' },
    });
    expect(direct.status, direct.stdout + direct.stderr).toBe(0);
  });

  it('records the review, promotes facets, and publishes to the test plan', async () => {
    const review = await mcp.call<Json>('review_record', { testCaseId: '10001', decision: 'accept', reviewer: 'qa.lead' });
    expect(review.countsAsAccepted).toBe(true);
    expect(review.facetsPromoted).toEqual(expect.arrayContaining(['policy-search:policy-number-input']));

    const published = await mcp.call<Json>('ado_publish', { planId: 7, suiteId: 8, runName: 'e2e nightly 1', fromRunId: runId, associateAutomation: true });
    expect(published.alreadyPublished).toBe(false);
    const again = await mcp.call<Json>('ado_publish', { planId: 7, suiteId: 8, runName: 'e2e nightly 1', fromRunId: runId });
    expect(again.alreadyPublished).toBe(true);
    const patched = ado.requests.filter((r) => r.method === 'PATCH' && /\/results/.test(r.url));
    expect(patched.length).toBeGreaterThanOrEqual(1);
    const body = JSON.stringify(patched[0]!.body);
    expect(body).toMatch(/"outcome":"Passed"/);
    expect(body).toMatch(/"stepIdentifier":"5"/);
  });

  it('raises a handoff instead of guessing', async () => {
    const handoff = await mcp.call<Json>('handoff_raise', {
      testCaseId: '10001', stepIndex: 4, blockage: 'ambiguous-target', unresolvedIntent: 'Click Edit',
      attempted: ['memory.query', 'app.observe scope main'], evidence: {}, candidates: [{ name: 'Edit', why: 'row POL-001' }, { name: 'Edit', why: 'row POL-002' }],
      nextMoves: ['Name the policy in the step'],
    });
    expect(handoff.handoffId).toMatch(/^h-10001-4-/);
    expect(String(handoff.adoCommentUrl ?? '')).toMatch(/comments/);
    expect(ado.requests.some((r) => r.method === 'POST' && /\/comments/.test(r.url))).toBe(true);
  });

  it('sees a drifting release, classifies the failure, and repairs it in place', async () => {
    const before = await mcp.call<Json>('memory_preflight', { screen: 'policy-search', profile: 'qa' });
    expect((before.screens as Json[])[0]!.status).toBe('ok');

    app.setVariant('v2-renamed-search');
    const after = await mcp.call<Json>('memory_preflight', { screen: 'policy-search', profile: 'qa' });
    const screen = (after.screens as Json[])[0]!;
    expect(['stale', 'missing']).toContain(screen.status);
    const inputEntry = (screen.facets as Json[]).find((f) => f.id === 'policy-search:policy-number-input')!;
    expect(['stale', 'missing']).toContain(inputEntry.status);

    const red = await mcp.call<Json>('test_run', { profile: 'qa', pauseOnFailure: true });
    const paused = red.paused as Json | undefined;
    expect(paused?.cdpEndpoint).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);

    const attached = await mcp.call<Json>('app_open', { attach: { cdpEndpoint: paused!.cdpEndpoint, urlContains: 'PolicySearch' } });
    expect(attached.attached).toBe(true);
    const pageId = attached.pageId as string;
    const snap = await mcp.call<Json>('app_observe', { pageId, scope: 'search', intent: 'Enter policy number in search field' });
    const input = (snap.candidates as Json[]).find((c) => c.role === 'textbox')!;
    expect(input.name).toBe('Find a policy');
    const tried = await mcp.call<Json>('app_act', { pageId, action: 'fill', target: { snapshotId: snap.snapshotId, ref: input.ref }, value: 'POL-001' });
    expect(tried.outcome).toBe('succeeded');
    const enriched = await mcp.call<Json>('memory_enrich', {
      facetId: 'policy-search:policy-number-input', locator: (tried.resolved as Json).locator, evidence: { snapshotId: snap.snapshotId, ref: input.ref },
    });
    expect((enriched.changes as string[]).join('\n')).toMatch(/regenerated pages\/policy-search\.page\.ts/);

    const green = await mcp.call<Json>('test_run', { profile: 'qa' });
    expect(green.summary).toMatchObject({ passed: 1, failed: 0 });
  });

  it('leaves an authoring receipt for every call, with the host decision', async () => {
    const text = await readFile(path.join(ws.root, '.tesseract', 'receipts', 'authoring.jsonl'), 'utf8');
    const lines = text.trim().split('\n').map((l) => JSON.parse(l) as Json);
    expect(lines.length).toBeGreaterThan(20);
    const decided = lines.find((l) => l.tool === 'app.act' && (l.host as Json | undefined)?.model === 'e2e-host-model');
    expect(decided).toBeDefined();
    expect(text).not.toMatch(/correct-horse/);
    const runs = await readdir(path.join(ws.root, '.tesseract', 'receipts'));
    expect(runs).toEqual(expect.arrayContaining(['authoring.jsonl', 'runs.jsonl', 'reviews.jsonl', 'emits.jsonl', 'publish.jsonl']));
  });

  it('serves the CLI from the same declaration', () => {
    const tools = spawnSync(process.execPath, [BIN, 'tools', '--json'], { encoding: 'utf8' });
    expect(JSON.parse(tools.stdout)).toHaveLength(16);
    const query = spawnSync(process.execPath, [BIN, 'memory.query', '--root', ws.root, '--screen', 'policy-search', '--phrase', 'search field'], { encoding: 'utf8' });
    expect(query.status, query.stderr).toBe(0);
    expect(JSON.parse(query.stdout).facets[0].id).toBe('policy-search:policy-number-input');
    const bad = spawnSync(process.execPath, [BIN, 'review.record', '--root', ws.root, '--test-case-id', '10001', '--decision', 'maybe', '--reviewer', 'x'], { encoding: 'utf8' });
    expect(bad.status).toBe(2);
  });
});

function require_resolve_playwright_cli(): string {
  return path.join(V2_ROOT, '..', 'node_modules', '@playwright', 'test', 'cli.js');
}

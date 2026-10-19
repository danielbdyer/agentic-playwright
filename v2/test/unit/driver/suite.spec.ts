/**
 * The batch driver end to end: the heuristic decider (no model) authors
 * ADO cases against the OutSystems-shaped fixture app through the real
 * runtime and the real handlers, emits plain specs, runs them with
 * Playwright, and publishes the run to a mock Azure DevOps.
 *
 * The handler map is loaded dynamically: when a slice's handlers are not
 * there yet, the suite is skipped rather than failing to import.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createBrowserPool } from '../../../src/browser/pool.js';
import { readJsonl } from '../../../src/core/fsio.js';
import { authorSuite, type SuiteSummary } from '../../../src/driver/index.js';
import { authoringReceiptMarkdown, computeNumbers, renderNumbersMarkdown } from '../../../src/report/index.js';
import { createRuntime, type Runtime } from '../../../src/tools/runtime.js';
import type { ToolHandlers } from '../../../src/tools/types.js';
import { loadWorkspace } from '../../../src/workspace/workspace.js';
import { startFixtureApp, type FixtureApp } from '../../support/fixture-app.js';
import { dataSourceXml, parametersXml, startMockAdo, stepsXml, type MockAdo } from '../../support/mock-ado.js';

type Json = Record<string, unknown>;

const loadHandlers = async (): Promise<{ handlers: ToolHandlers; releasePausedRuns: () => Promise<void> } | null> => {
  try {
    const { createHandlers } = await import('../../../src/tools/handlers/index.js');
    const run = await import('../../../src/run/index.js');
    return { handlers: createHandlers(), releasePausedRuns: run.releasePausedRuns };
  } catch (error) {
    process.stderr.write(`driver e2e skipped: handlers are not all present yet (${(error as Error).message})\n`);
    return null;
  }
};

const loaded = await loadHandlers();

describe.skipIf(loaded === null)('authorSuite with the heuristic decider', () => {
  let app: FixtureApp;
  let ado: MockAdo;
  let root: string;
  let runtime: Runtime;
  const logs: string[] = [];
  const env = { ...process.env, AZURE_DEVOPS_PAT: 'driver-pat' } as NodeJS.ProcessEnv;

  beforeAll(async () => {
    app = await startFixtureApp();
    ado = await startMockAdo({
      pat: 'driver-pat',
      cases: [
        {
          id: 10001,
          rev: 2,
          title: 'Verify policy search returns matching policy',
          tags: 'smoke; billing',
          priority: 1,
          steps: stepsXml([
            { id: 2, action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
            { id: 3, action: 'Enter @policyNumber in search field', expected: 'Policy Number accepts a valid policy' },
            { id: 4, action: 'Click Search button', expected: 'Search runs' },
            { id: 5, action: 'Verify search results show policy', expected: 'Matching policy appears in Search Results', type: 'ValidateStep' },
          ]),
          parameters: parametersXml(['policyNumber']),
          dataSource: dataSourceXml([{ policyNumber: 'POL-001' }]),
        },
        {
          id: 10002,
          rev: 1,
          title: 'Edit an active policy',
          steps: stepsXml([
            { id: 2, action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
            { id: 3, action: 'Click Filter', expected: '' },
            { id: 4, action: 'Check the Active only checkbox', expected: '' },
            { id: 5, action: 'Click Search button', expected: '' },
            { id: 6, action: 'Click Edit', expected: 'Policy detail opens' },
          ]),
        },
        {
          id: 10003,
          rev: 1,
          title: 'Closed claims and a paraphrased count',
          steps: stepsXml([
            { id: 2, action: 'Navigate to Claims screen', expected: 'Claims screen loads' },
            { id: 3, action: 'Select Closed in the Claim status dropdown', expected: '' },
            { id: 4, action: 'Navigate to Policy Search screen', expected: 'Policy Search screen loads' },
            { id: 5, action: 'Enter POL-001 in search field', expected: '' },
            { id: 6, action: 'Click Search button', expected: '' },
            { id: 7, action: 'Verify the status message reads "2 policies found"', expected: '' },
          ]),
        },
        {
          id: 10004,
          rev: 1,
          title: 'Closed claims count shows in the page text',
          steps: stepsXml([
            { id: 2, action: 'Navigate to Claims screen', expected: 'Claims screen loads' },
            { id: 3, action: 'Select Closed in the Claim status dropdown', expected: '' },
            { id: 4, action: 'Verify the claims summary shows "7 closed claims"', expected: '' },
          ]),
        },
      ],
      points: [
        { planId: 7, suiteId: 8, testCaseId: 10001, pointId: 1203 },
        { planId: 7, suiteId: 8, testCaseId: 10002, pointId: 1204 },
      ],
    });

    root = await mkdtemp(path.join(os.tmpdir(), 'tesseract-driver-'));
    await mkdir(path.join(root, '.tesseract', 'profiles'), { recursive: true });
    await writeFile(
      path.join(root, '.tesseract', 'config.json'),
      JSON.stringify({ ado: { orgUrl: ado.url, project: ado.project, patEnv: 'AZURE_DEVOPS_PAT' } }, null, 2),
    );
    await writeFile(
      path.join(root, '.tesseract', 'profiles', 'qa.json'),
      JSON.stringify({ name: 'qa', baseURL: app.baseURL, storageStatePath: '.tesseract/auth/qa.json' }, null, 2),
    );

    // Sign in once and save the session, the way a QA would with codegen --save-storage.
    const browser = await chromium.launch();
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${app.baseURL}Login`);
      await page.getByLabel('Username').fill('qa.user');
      await page.getByLabel('Password').fill('correct-horse');
      await page.getByRole('button', { name: 'Log in' }).click();
      await page.waitForURL(/PolicySearch$/);
      await mkdir(path.join(root, '.tesseract', 'auth'), { recursive: true });
      await context.storageState({ path: path.join(root, '.tesseract', 'auth', 'qa.json') });
    } finally {
      await browser.close();
    }

    const workspace = await loadWorkspace(root, env);
    const browserPool = createBrowserPool({ userAgentSuffix: workspace.config.userAgentSuffix, headless: true, root: workspace.paths.root });
    runtime = createRuntime({
      workspace,
      browser: browserPool,
      handlers: loaded!.handlers,
      env,
      log: (message) => logs.push(message),
      closeHooks: [loaded!.releasePausedRuns],
    });
  }, 120_000);

  afterAll(async () => {
    await runtime?.close();
    await ado?.close();
    await app?.close();
    if (process.env.TESSERACT_KEEP_TMP !== '1') await rm(root, { recursive: true, force: true });
  });

  let first: SuiteSummary;

  it('authors Appendix C from an empty memory, emits a plain spec, runs it green, and publishes', async () => {
    first = await authorSuite(
      runtime,
      { testCaseIds: ['10001'], profile: 'qa', startUrl: 'Dashboard', run: true, publish: { planId: 7, suiteId: 8, runName: 'driver nightly 1' } },
      (message) => logs.push(message),
    );
    const summary = first.cases[0]!;
    expect(summary.error, JSON.stringify(summary, null, 2) + logs.join('\n')).toBeUndefined();
    expect(summary.outcome, JSON.stringify(summary.steps, null, 2)).toBe('authored');
    expect(summary.stepsResolved).toBe(4);
    expect(summary.handoffs).toEqual([]);
    expect(summary.steps.map((s) => s.verb)).toEqual(['navigate', 'fill', 'click', 'assert']);
    expect(summary.steps[0]!.via).toBe('observe');
    expect(summary.specPath).toMatch(/^tests\/policy-search\/10001-verify-policy-search-returns-matching-policy\.spec\.ts$/);
    expect(summary.facetsUsed).toEqual(expect.arrayContaining(['policy-search:policy-number-input', 'policy-search:search-button']));

    const spec = await readFile(path.join(root, summary.specPath!), 'utf8');
    expect(spec).not.toMatch(/getBy|locator\(|tesseract-qa/);
    expect(spec).toMatch(/test\.step\('Enter @policyNumber in search field'/);
    expect(spec).toMatch(/\.goto\(\)/);
    expect(spec).toMatch(/toHaveValue\(policyNumber\)/);
    const page = await readFile(path.join(root, 'pages', 'policy-search.page.ts'), 'utf8');
    expect(page).toMatch(/getByRole\('search'\)\.getByRole\('textbox', \{ name: 'Search Policy', exact: true \}\)/);
    expect(page).toMatch(/goto\(\)/);

    expect(first.run).toMatchObject({ passed: 1, failed: 0 });
    expect(summary.run?.outcome).toBe('passed');
    expect(first.publish).toMatchObject({ alreadyPublished: false });
    expect(ado.requests.some((r) => r.method === 'PATCH' && /\/results/.test(r.url))).toBe(true);
  }, 240_000);

  it('receipts every decision it made, with the reason and the rejected candidates', async () => {
    const lines = (await readJsonl<Json>(path.join(root, '.tesseract', 'receipts', 'authoring.jsonl'))).filter((l) => l.testCase === '10001');
    const acts = lines.filter((l) => l.tool === 'app.act' && l.outcome === 'succeeded');
    expect(acts.length).toBeGreaterThanOrEqual(3);
    for (const act of acts) expect((act.decision as Json | undefined)?.reason).toEqual(expect.any(String));
    const tools = new Set(lines.map((l) => l.tool));
    expect([...tools]).toEqual(expect.arrayContaining(['app.open', 'memory.query', 'app.observe', 'app.act', 'app.assert', 'memory.mint', 'test.emit']));
    const steps = new Set(lines.flatMap((l) => (typeof l.step === 'number' ? [l.step] : [])));
    expect([...steps].sort()).toEqual([1, 2, 3, 4]);
  });

  it('hands off an ambiguous step instead of guessing, and emits it as test.fixme', async () => {
    const result = await authorSuite(runtime, { testCaseIds: ['10002'], profile: 'qa', startUrl: 'Dashboard', run: true }, (message) => logs.push(message));
    const summary = result.cases[0]!;
    expect(summary.error, logs.join('\n')).toBeUndefined();
    expect(summary.outcome, JSON.stringify(summary.steps, null, 2)).toBe('partial');
    expect(summary.stepsResolved).toBe(4);
    expect(summary.handoffs).toHaveLength(1);
    const handoff = summary.handoffs[0]!;
    expect(handoff.stepIndex).toBe(5);
    expect(handoff.blockage).toBe('ambiguous-target');
    const file = JSON.parse(await readFile(path.join(root, '.tesseract', 'handoffs', '10002-5.json'), 'utf8')) as Json;
    expect(file.blockage).toBe('ambiguous-target');
    const names = (file.candidates as Json[]).map((c) => c.name);
    expect(names.filter((n) => n === 'Edit')).toHaveLength(2);
    expect(ado.comments.length).toBeGreaterThanOrEqual(1);

    const spec = await readFile(path.join(root, summary.specPath!), 'utf8');
    expect(spec).toMatch(/test\.fixme\(true, 'Needs a human \(handoff/);
    expect(summary.run?.outcome).toBe('skipped');
  }, 240_000);

  it('reaches an unlinked screen by its OutSystems URL, uses a remembered route, and hands off a paraphrased result', async () => {
    // No startUrl: the case starts on the profile baseURL, the sign-in page, which has no menu.
    const result = await authorSuite(runtime, { testCaseIds: ['10003'], profile: 'qa', run: true }, (message) => logs.push(message));
    const summary = result.cases[0]!;
    expect(summary.error, logs.join('\n')).toBeUndefined();
    expect(summary.steps.map((s) => [s.index, s.status, s.via ?? null]), JSON.stringify(summary.steps, null, 2)).toEqual([
      [1, 'resolved', 'url'],
      [2, 'resolved', 'observe'],
      [3, 'resolved', 'route'],
      [4, 'resolved', 'memory'],
      [5, 'resolved', 'memory'],
      [6, 'handoff', null],
    ]);
    expect(summary.handoffs.map((h) => h.blockage)).toEqual(['text-mismatch']);
    const file = JSON.parse(await readFile(path.join(root, '.tesseract', 'handoffs', '10003-6.json'), 'utf8')) as Json;
    expect(String(file.proposedAssertion)).toMatch(/toContainText\('1 policy found'\)/);
    expect(String(file.unresolvedIntent)).toMatch(/1 policy found/);

    const claims = await readFile(path.join(root, 'pages', 'claims.page.ts'), 'utf8');
    expect(claims).toMatch(/goto\(\)[\s\S]*'Claims'/);
    const spec = await readFile(path.join(root, summary.specPath!), 'utf8');
    expect(spec).toMatch(/selectOption\('Closed'\)/);
    expect(spec).toMatch(/fill\('POL-001'\)/);
    expect(spec).toMatch(/test\.fixme\(true, 'Needs a human \(handoff [^)]+\): text mismatch/);
    expect(summary.run?.outcome).toBe('skipped');
  }, 240_000);

  it('checks text no single element carries on its landmark, through a region facet', async () => {
    // "7 closed claims" is a plain <p> with no role: no candidate carries it, the main landmark does.
    const result = await authorSuite(runtime, { testCaseIds: ['10004'], profile: 'qa', startUrl: 'Claims', run: true }, (message) => logs.push(message));
    const summary = result.cases[0]!;
    expect(summary.outcome, JSON.stringify(summary.steps, null, 2)).toBe('authored');
    const spec = await readFile(path.join(root, summary.specPath!), 'utf8');
    expect(spec).toMatch(/await expect\(claims\.mainContent\)\.toContainText\('7 closed claims'\);/);
    const page = await readFile(path.join(root, 'pages', 'claims.page.ts'), 'utf8');
    expect(page).toMatch(/get mainContent\(\): Locator \{\s*return this\.page\.getByRole\('main'\);/);
    expect(summary.run?.outcome).toBe('passed');
  }, 240_000);

  it('re-authors a case from scratch on a revisit, resolving its steps from memory', async () => {
    const again = await authorSuite(runtime, { testCaseIds: ['10001'], profile: 'qa', run: true }, (message) => logs.push(message));
    const summary = again.cases[0]!;
    expect(summary.outcome, JSON.stringify(summary.steps, null, 2)).toBe('authored');
    expect(summary.steps[0]!.via).toBe('route');
    expect(summary.steps.filter((s) => s.via === 'memory').map((s) => s.index)).toEqual([2, 3, 4]);
    expect(summary.facetsMinted).toEqual([]);
    expect(summary.specPath).toBe(first.cases[0]!.specPath);
    expect(summary.run?.outcome).toBe('passed');
  }, 240_000);

  it('reports the numbers and a per-test receipt from what the authoring left behind', async () => {
    const numbers = await computeNumbers(runtime.ctx.workspace);
    expect(numbers.acceptance).toMatchObject({ emitted: 4, accepted: 0, awaitingReview: 4 });
    expect(numbers.diagnostics.handoffReasons).toEqual({ 'ambiguous-target': 1, 'text-mismatch': 1 });
    expect(numbers.diagnostics.handoffRate.of).toBe(4 + 5 + 6 + 3);
    expect(numbers.diagnostics.facetReuse.reused).toBeGreaterThan(0);
    expect(numbers.diagnostics.locatorStrategyDistribution['role-name']).toBeGreaterThan(0);
    expect(renderNumbersMarkdown(numbers)).toMatch(/Handoff reasons:\*\* (?:ambiguous-target 1, text-mismatch 1|text-mismatch 1, ambiguous-target 1)/);

    const receipt = await authoringReceiptMarkdown(runtime.ctx.workspace, '10002');
    expect(receipt).toMatch(/^# ADO 10002 — Edit an active policy/);
    expect(receipt).toMatch(/### 5\. Click Edit/);
    expect(receipt).toMatch(/\*\*Step 5, ambiguous-target\*\*/);
    expect(receipt).toMatch(/app\.act click on candidate c\d+ → succeeded via `page\.getByText\('Filter'/);
    expect(receipt).toMatch(/\*\*Latest run:\*\* skipped/);
  });
});
